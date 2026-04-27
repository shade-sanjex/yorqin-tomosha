import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ParticipantStatus = "kirdi" | "yuklanmoqda" | "tayyor";

export interface PlayerState {
  isPlaying: boolean;
  playbackTime: number;
  videoUrl: string | null;
  videoKind: "file" | "youtube";
}

export interface SyncedPlayerHandle {
  /** seek the underlying player to a given second; provided by the React-Player wrapper */
  seekTo: (sec: number) => void;
  /** pause the underlying player */
  pause: () => void;
  /** play the underlying player */
  play: () => void;
  /** current playback time in seconds */
  getCurrentTime: () => number;
}

interface UseSyncedPlayerArgs {
  roomId: string;
  userId: string;
  /** any user that may control playback (host or in controllers list) */
  canControl: boolean;
  /** Only the host writes the canonical state into the rooms table */
  isHost: boolean;
  initialState: PlayerState;
  onBufferingMapChange: (map: Record<string, ParticipantStatus>) => void;
  onRemotePlayerChange?: (
    next: { isPlaying: boolean; playbackTime: number },
    previous: { isPlaying: boolean; playbackTime: number }
  ) => void;
  /** handle to control whichever player is rendered (react-player or native video) */
  playerHandleRef: React.RefObject<SyncedPlayerHandle | null>;
}

const SYNC_THRESHOLD = 0.6;
const HOST_BROADCAST_INTERVAL = 1500;

export function useSyncedPlayer({
  roomId,
  userId,
  canControl,
  isHost,
  initialState,
  onBufferingMapChange,
  onRemotePlayerChange,
  playerHandleRef,
}: UseSyncedPlayerArgs) {
  const [playerState, setPlayerState] = useState<PlayerState>(initialState);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const statusMapRef = useRef<Record<string, ParticipantStatus>>({});
  const myStatusRef = useRef<ParticipantStatus>("tayyor");
  const onRemoteRef = useRef(onRemotePlayerChange);
  const playerStateRef = useRef(playerState);
  useEffect(() => { onRemoteRef.current = onRemotePlayerChange; }, [onRemotePlayerChange]);
  useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

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

  /** Anyone with control can broadcast playback state to all clients. */
  const broadcastState = useCallback(
    async (next: Partial<PlayerState>) => {
      if (!canControl) return;
      const cur = playerStateRef.current;
      const handle = playerHandleRef.current;
      const state: PlayerState = {
        isPlaying: next.isPlaying ?? cur.isPlaying,
        playbackTime: next.playbackTime ?? handle?.getCurrentTime() ?? cur.playbackTime,
        videoUrl: next.videoUrl ?? cur.videoUrl,
        videoKind: next.videoKind ?? cur.videoKind,
      };
      setPlayerState(state);
      console.log("[Sync] broadcast", state.isPlaying ? "play" : "pause", state.playbackTime.toFixed(2));
      channelRef.current?.send({
        type: "broadcast",
        event: "player",
        payload: state,
      });
      // Only host persists to DB (RLS allows only host to update rooms)
      if (isHost) {
        await supabase
          .from("rooms")
          .update({
            is_playing: state.isPlaying,
            playback_time: state.playbackTime,
            video_url: state.videoUrl,
            video_kind: state.videoKind,
            updated_at: new Date().toISOString(),
          })
          .eq("id", roomId);
      }
    },
    [canControl, isHost, roomId, playerHandleRef]
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
      const handle = playerHandleRef.current;
      if (handle) {
        if (Math.abs(handle.getCurrentTime() - p.playbackTime) > SYNC_THRESHOLD) {
          handle.seekTo(p.playbackTime);
        }
        if (p.isPlaying) handle.play();
        else handle.pause();
      }
      console.log("[Sync] applyRemote", p.isPlaying ? "play" : "pause");
      window.setTimeout(() => { isApplyingRemoteRef.current = false; }, 100);
    });

    ch.on("broadcast", { event: "status" }, ({ payload }) => {
      const { userId: uid, status } = payload as { userId: string; status: ParticipantStatus };
      statusMapRef.current = { ...statusMapRef.current, [uid]: status };
      onBufferingMapChange({ ...statusMapRef.current });

      if (canControl) {
        const anyBuffering = Object.values(statusMapRef.current).some((s) => s === "yuklanmoqda");
        const handle = playerHandleRef.current;
        if (anyBuffering && handle && playerStateRef.current.isPlaying) {
          handle.pause();
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
  }, [roomId, userId, canControl, onBufferingMapChange, broadcastState, playerHandleRef]);

  // Periodic time broadcast from any controller while playing
  useEffect(() => {
    if (!canControl) return;
    const id = window.setInterval(() => {
      const handle = playerHandleRef.current;
      if (!handle) return;
      const cur = playerStateRef.current;
      if (cur.isPlaying) {
        channelRef.current?.send({
          type: "broadcast",
          event: "player",
          payload: { ...cur, playbackTime: handle.getCurrentTime() } satisfies PlayerState,
        });
      }
    }, HOST_BROADCAST_INTERVAL);
    return () => window.clearInterval(id);
  }, [canControl, playerHandleRef]);

  return { playerState, setPlayerState, broadcastState, setMyStatus, isApplyingRemoteRef };
}
