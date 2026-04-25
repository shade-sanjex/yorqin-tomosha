import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ParticipantStatus = "kirdi" | "yuklanmoqda" | "tayyor";

export interface PlayerState {
  isPlaying: boolean;
  playbackTime: number;
  videoUrl: string | null;
}

interface UseSyncedPlayerArgs {
  roomId: string;
  userId: string;
  isHost: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  initialState: PlayerState;
  onBufferingMapChange: (map: Record<string, ParticipantStatus>) => void;
  onRemotePlayerChange?: (
    next: { isPlaying: boolean; playbackTime: number },
    previous: { isPlaying: boolean; playbackTime: number }
  ) => void;
}

const SYNC_THRESHOLD = 0.6;
const HOST_BROADCAST_INTERVAL = 1500;

export function useSyncedPlayer({
  roomId,
  userId,
  isHost,
  videoRef,
  initialState,
  onBufferingMapChange,
  onRemotePlayerChange,
}: UseSyncedPlayerArgs) {
  const [playerState, setPlayerState] = useState<PlayerState>(initialState);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const statusMapRef = useRef<Record<string, ParticipantStatus>>({});
  const myStatusRef = useRef<ParticipantStatus>("tayyor");
  const onRemoteRef = useRef(onRemotePlayerChange);
  useEffect(() => { onRemoteRef.current = onRemotePlayerChange; }, [onRemotePlayerChange]);

  const setMyStatus = useCallback(
    (status: ParticipantStatus) => {
      if (myStatusRef.current === status) return;
      myStatusRef.current = status;
      statusMapRef.current = { ...statusMapRef.current, [userId]: status };
      onBufferingMapChange({ ...statusMapRef.current });
      channelRef.current?.send({
        type: "broadcast",
        event: "status",
        payload: { userId, status },
      });
    },
    [userId, onBufferingMapChange]
  );

  const broadcastState = useCallback(
    async (next: Partial<PlayerState>) => {
      if (!isHost) return;
      const v = videoRef.current;
      const state: PlayerState = {
        isPlaying: next.isPlaying ?? !!(v && !v.paused),
        playbackTime: next.playbackTime ?? (v?.currentTime ?? 0),
        videoUrl: next.videoUrl ?? playerState.videoUrl,
      };
      setPlayerState(state);
      console.log("[Sync] broadcast", state.isPlaying ? "play" : "pause", state.playbackTime.toFixed(2));
      channelRef.current?.send({
        type: "broadcast",
        event: "player",
        payload: state,
      });
      await supabase
        .from("rooms")
        .update({
          is_playing: state.isPlaying,
          playback_time: state.playbackTime,
          video_url: state.videoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId);
    },
    [isHost, roomId, videoRef, playerState.videoUrl]
  );

  useEffect(() => {
    const ch = supabase.channel(`room:${roomId}:player`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "player" }, ({ payload }) => {
      const p = payload as PlayerState;
      isApplyingRemoteRef.current = true;
      setPlayerState((prev) => {
        onRemoteRef.current?.(
          { isPlaying: p.isPlaying, playbackTime: p.playbackTime },
          { isPlaying: prev.isPlaying, playbackTime: prev.playbackTime }
        );
        return p;
      });
      const v = videoRef.current;
      if (v) {
        if (Math.abs(v.currentTime - p.playbackTime) > SYNC_THRESHOLD) {
          v.currentTime = p.playbackTime;
        }
        if (p.isPlaying && v.paused) {
          v.play().catch(() => {});
        } else if (!p.isPlaying && !v.paused) {
          v.pause();
        }
      }
      console.log("[Sync] applyRemote", p.isPlaying ? "play" : "pause");
      setTimeout(() => { isApplyingRemoteRef.current = false; }, 100);
    });

    ch.on("broadcast", { event: "status" }, ({ payload }) => {
      const { userId: uid, status } = payload as { userId: string; status: ParticipantStatus };
      statusMapRef.current = { ...statusMapRef.current, [uid]: status };
      onBufferingMapChange({ ...statusMapRef.current });

      if (isHost) {
        const anyBuffering = Object.values(statusMapRef.current).some((s) => s === "yuklanmoqda");
        const v = videoRef.current;
        if (anyBuffering && v && !v.paused) {
          v.pause();
          broadcastState({ isPlaying: false });
        }
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.send({ type: "broadcast", event: "status", payload: { userId, status: myStatusRef.current } });
      }
    });

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomId, userId, isHost, videoRef, onBufferingMapChange, broadcastState]);

  useEffect(() => {
    if (!isHost) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) {
        channelRef.current?.send({
          type: "broadcast",
          event: "player",
          payload: { isPlaying: true, playbackTime: v.currentTime, videoUrl: playerState.videoUrl },
        });
      }
    }, HOST_BROADCAST_INTERVAL);
    return () => window.clearInterval(id);
  }, [isHost, videoRef, playerState.videoUrl]);

  return { playerState, setPlayerState, broadcastState, setMyStatus, isApplyingRemoteRef };
}
