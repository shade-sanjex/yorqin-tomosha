import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface PeerState {
  userId: string;
  stream: MediaStream | null;
  speaking: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
}

export interface MediaStateEvent {
  userId: string;
  micEnabled: boolean;
  camEnabled: boolean;
}

interface UsePeerMeshArgs {
  roomId: string;
  userId: string;
  enabled: boolean;
  onPeerJoin?: (userId: string) => void;
  onPeerLeave?: (userId: string) => void;
  onPeerMediaChange?: (ev: MediaStateEvent & { previous?: { micEnabled: boolean; camEnabled: boolean } }) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface SignalPayload {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
}

export function usePeerMesh({
  roomId, userId, enabled, onPeerJoin, onPeerLeave, onPeerMediaChange,
}: UsePeerMeshArgs) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [permError, setPermError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const transceiversRef = useRef<Map<string, { audio: RTCRtpTransceiver; video: RTCRtpTransceiver }>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const iceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Record<string, { analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>>({});
  const rafRef = useRef<number | null>(null);

  // Stable callback refs (so we don't re-init the channel)
  const onPeerJoinRef = useRef(onPeerJoin);
  const onPeerLeaveRef = useRef(onPeerLeave);
  const onPeerMediaChangeRef = useRef(onPeerMediaChange);
  useEffect(() => { onPeerJoinRef.current = onPeerJoin; }, [onPeerJoin]);
  useEffect(() => { onPeerLeaveRef.current = onPeerLeave; }, [onPeerLeave]);
  useEffect(() => { onPeerMediaChangeRef.current = onPeerMediaChange; }, [onPeerMediaChange]);

  const sendSignal = useCallback((p: Omit<SignalPayload, "from">) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { ...p, from: userId } });
  }, [userId]);

  const broadcastMediaState = useCallback((mic: boolean, cam: boolean) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "media-state",
      payload: { userId, micEnabled: mic, camEnabled: cam },
    });
  }, [userId]);

  const attachAnalyser = useCallback((peerId: string, stream: MediaStream) => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (stream.getAudioTracks().length === 0) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analysersRef.current[peerId] = { analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) };
    } catch {
      /* ignore */
    }
  }, []);

  // Create or fetch RTCPeerConnection for a remote
  const ensurePC = useCallback((remoteId: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(remoteId);
    if (existing) return existing;

    console.log("[WebRTC] new PC", remoteId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(remoteId, pc);

    // Pre-add sendrecv transceivers so SDP always negotiates both directions,
    // even before getUserMedia resolves.
    const audioTx = pc.addTransceiver("audio", { direction: "sendrecv" });
    const videoTx = pc.addTransceiver("video", { direction: "sendrecv" });
    transceiversRef.current.set(remoteId, { audio: audioTx, video: videoTx });
    console.log("[WebRTC] transceivers created", remoteId);

    // If media already available, attach via replaceTrack (no extra m-line)
    const local = localStreamRef.current;
    if (local) {
      const aTrack = local.getAudioTracks()[0];
      const vTrack = local.getVideoTracks()[0];
      if (aTrack) audioTx.sender.replaceTrack(aTrack).catch((e) => console.warn("[WebRTC Error] replaceTrack audio", e));
      if (vTrack) videoTx.sender.replaceTrack(vTrack).catch((e) => console.warn("[WebRTC Error] replaceTrack video", e));
      console.log("[WebRTC] tracks attached on PC create", remoteId);
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) sendSignal({ to: remoteId, kind: "ice", ice: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      // Accumulate audio + video into a single per-peer MediaStream so we
      // never lose a track when audio/video arrive in separate events.
      let stream = remoteStreamsRef.current.get(remoteId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(remoteId, stream);
      }
      const already = stream.getTracks().some((t) => t.id === ev.track.id);
      if (!already) stream.addTrack(ev.track);
      console.log("[WebRTC] ontrack", remoteId, ev.track.kind, "total tracks:", stream.getTracks().length);

      ev.track.onunmute = () => console.log("[WebRTC] track unmute", remoteId, ev.track.kind);
      ev.track.onended = () => console.log("[WebRTC] track ended", remoteId, ev.track.kind);

      const finalStream = stream;
      setPeers((prev) => ({
        ...prev,
        [remoteId]: {
          userId: remoteId,
          stream: finalStream,
          speaking: prev[remoteId]?.speaking ?? false,
          micEnabled: prev[remoteId]?.micEnabled ?? true,
          camEnabled: prev[remoteId]?.camEnabled ?? true,
        },
      }));
      attachAnalyser(remoteId, finalStream);
    };

    // Perfect negotiation: when negotiation is needed, create offer
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.set(remoteId, true);
        await pc.setLocalDescription();
        if (pc.localDescription) {
          console.log("[WebRTC] offer-sent", remoteId);
          sendSignal({ to: remoteId, kind: "offer", sdp: pc.localDescription });
        }
      } catch (e) {
        console.warn("[WebRTC Error] negotiation error", remoteId, e);
      } finally {
        makingOfferRef.current.set(remoteId, false);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] state", remoteId, pc.connectionState);
      if (pc.connectionState === "failed") {
        try { pc.restartIce(); } catch { /* noop */ }
      }
    };

    return pc;
  }, [sendSignal, attachAnalyser]);

  const closePC = useCallback((remoteId: string) => {
    const pc = pcsRef.current.get(remoteId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(remoteId);
      console.log("[WebRTC] closed", remoteId);
    }
    transceiversRef.current.delete(remoteId);
    remoteStreamsRef.current.delete(remoteId);
    makingOfferRef.current.delete(remoteId);
    ignoreOfferRef.current.delete(remoteId);
    iceQueueRef.current.delete(remoteId);
    delete analysersRef.current[remoteId];
    setPeers((prev) => {
      const n = { ...prev };
      delete n[remoteId];
      return n;
    });
  }, []);

  const acquireMedia = useCallback(async () => {
    setPermError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: {
          facingMode: "user",
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      attachAnalyser("__local__", stream);
      const aTrack = stream.getAudioTracks()[0];
      const vTrack = stream.getVideoTracks()[0];
      // Attach to existing PCs via replaceTrack on pre-created transceivers
      transceiversRef.current.forEach((tx, peerId) => {
        if (aTrack) tx.audio.sender.replaceTrack(aTrack).catch((e) => console.warn("[WebRTC Error] replaceTrack audio", peerId, e));
        if (vTrack) tx.video.sender.replaceTrack(vTrack).catch((e) => console.warn("[WebRTC Error] replaceTrack video", peerId, e));
        console.log("[WebRTC] media attached after acquire", peerId);
      });
      return stream;
    } catch (e) {
      console.warn("[WebRTC Error] getUserMedia failed", e);
      setPermError("perm");
      return null;
    }
  }, [attachAnalyser]);

  // Setup signaling channel + presence + media
  useEffect(() => {
    if (!enabled || !userId) return;
    let mounted = true;

    (async () => {
      await acquireMedia();
      if (!mounted) return;

      const ch = supabase.channel(`room:${roomId}:webrtc`, {
        config: {
          broadcast: { self: false },
          presence: { key: userId },
        },
      });
      channelRef.current = ch;

      // Signaling
      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to !== userId) return;
        if (p.from === userId) return;

        const pc = ensurePC(p.from);
        const polite = userId > p.from; // higher id = polite

        try {
          if (p.kind === "offer" && p.sdp) {
            const offerCollision =
              pc.signalingState !== "stable" || makingOfferRef.current.get(p.from) === true;
            const ignore = !polite && offerCollision;
            ignoreOfferRef.current.set(p.from, ignore);
            if (ignore) {
              console.log("[WebRTC] ignored offer (impolite)", p.from);
              return;
            }
            if (offerCollision) {
              // polite: rollback
              await Promise.all([
                pc.setLocalDescription({ type: "rollback" }).catch(() => {}),
                pc.setRemoteDescription(p.sdp),
              ]);
            } else {
              await pc.setRemoteDescription(p.sdp);
            }
            // flush ICE queue
            const q = iceQueueRef.current.get(p.from) ?? [];
            for (const c of q) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
            iceQueueRef.current.set(p.from, []);

            await pc.setLocalDescription();
            if (pc.localDescription) {
              console.log("[WebRTC] answer-sent", p.from);
              sendSignal({ to: p.from, kind: "answer", sdp: pc.localDescription });
            }
          } else if (p.kind === "answer" && p.sdp) {
            if (pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(p.sdp);
              console.log("[WebRTC] answer-applied", p.from);
              const q = iceQueueRef.current.get(p.from) ?? [];
              for (const c of q) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
              iceQueueRef.current.set(p.from, []);
            }
          } else if (p.kind === "ice" && p.ice) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try { await pc.addIceCandidate(p.ice); } catch (e) {
                if (!ignoreOfferRef.current.get(p.from)) console.warn("[WebRTC] ice err", e);
              }
            } else {
              const q = iceQueueRef.current.get(p.from) ?? [];
              q.push(p.ice);
              iceQueueRef.current.set(p.from, q);
            }
          }
        } catch (e) {
          console.warn("[WebRTC] signal handler error", p.kind, p.from, e);
        }
      });

      // Media state from peers
      ch.on("broadcast", { event: "media-state" }, ({ payload }) => {
        const ev = payload as MediaStateEvent;
        if (ev.userId === userId) return;
        setPeers((prev) => {
          const cur = prev[ev.userId];
          const previous = cur ? { micEnabled: cur.micEnabled, camEnabled: cur.camEnabled } : undefined;
          onPeerMediaChangeRef.current?.({ ...ev, previous });
          return {
            ...prev,
            [ev.userId]: {
              userId: ev.userId,
              stream: cur?.stream ?? null,
              speaking: cur?.speaking ?? false,
              micEnabled: ev.micEnabled,
              camEnabled: ev.camEnabled,
            },
          };
        });
      });

      // Presence — drives mesh discovery
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, Array<{ userId?: string }>>;
        const remoteIds = new Set<string>();
        Object.keys(state).forEach((key) => { if (key !== userId) remoteIds.add(key); });

        // Initiate to remotes where we are the lower-id (deterministic)
        remoteIds.forEach((rid) => {
          if (!pcsRef.current.has(rid) && userId < rid) {
            console.log("[WebRTC] presence-sync initiate", rid);
            ensurePC(rid); // onnegotiationneeded fires automatically when tracks present
          } else if (!pcsRef.current.has(rid)) {
            // wait for the other side to initiate; still create PC lazily on offer
          }
        });

        // Close PCs for users no longer present
        Array.from(pcsRef.current.keys()).forEach((existing) => {
          if (!remoteIds.has(existing)) {
            console.log("[WebRTC] presence-sync close", existing);
            closePC(existing);
            onPeerLeaveRef.current?.(existing);
          }
        });
      });

      ch.on("presence", { event: "join" }, ({ key }) => {
        if (key === userId) return;
        console.log("[WebRTC] presence join", key);
        onPeerJoinRef.current?.(key);
        // re-broadcast our own media state so the joiner gets it
        broadcastMediaState(micEnabled, camEnabled);
      });

      ch.on("presence", { event: "leave" }, ({ key }) => {
        if (key === userId) return;
        console.log("[WebRTC] presence leave", key);
        closePC(key);
        onPeerLeaveRef.current?.(key);
      });

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ userId });
          // initial media-state broadcast
          broadcastMediaState(true, true);
        }
      });
    })();

    return () => {
      mounted = false;
      const ch = channelRef.current;
      if (ch) {
        ch.untrack().catch(() => {});
        supabase.removeChannel(ch);
      }
      channelRef.current = null;
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      makingOfferRef.current.clear();
      ignoreOfferRef.current.clear();
      iceQueueRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setPeers({});
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, userId]);

  // Speaker detection
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      Object.entries(analysersRef.current).forEach(([id, { analyser, data }]) => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const speaking = avg > 18;
        if (id === "__local__") {
          setLocalSpeaking((prev) => (prev !== speaking ? speaking : prev));
        } else {
          setPeers((prev) => {
            const cur = prev[id];
            if (!cur || cur.speaking === speaking) return prev;
            return { ...prev, [id]: { ...cur, speaking } };
          });
        }
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [enabled]);

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micEnabled;
    s.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicEnabled(next);
    broadcastMediaState(next, camEnabled);
    console.log("[WebRTC] local mic", next);
  }, [micEnabled, camEnabled, broadcastMediaState]);

  const toggleCam = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camEnabled;
    s.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamEnabled(next);
    broadcastMediaState(micEnabled, next);
    console.log("[WebRTC] local cam", next);
  }, [camEnabled, micEnabled, broadcastMediaState]);

  const retryPermission = useCallback(async () => {
    await acquireMedia();
  }, [acquireMedia]);

  const forceMuteMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = false));
    setMicEnabled(false);
    broadcastMediaState(false, camEnabled);
  }, [camEnabled, broadcastMediaState]);

  return {
    localStream,
    localSpeaking,
    peers,
    permError,
    micEnabled,
    camEnabled,
    toggleMic,
    toggleCam,
    retryPermission,
    forceMuteMic,
  };
}
