import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSyncedPlayer, type ParticipantStatus, type SyncedPlayerHandle, type PlayerState } from "@/hooks/useSyncedPlayer";
import { useLiveKitToken } from "@/hooks/useLiveKitToken";
import { useProfiles } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash2, Maximize2, Minimize2, LogOut, Copy, Loader2, Film, Users,
  PanelRightOpen, PanelRightClose, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";
import { CameraGrid } from "@/components/CameraGrid";
import { ChatPanel } from "@/components/ChatPanel";
import { InviteFriendsDialog } from "@/components/InviteFriendsDialog";
import { SyncedPlayer } from "@/components/SyncedPlayer";
import { ForceMuteHandler } from "@/components/ForceMuteHandler";
import { MediaSearchDialog } from "@/components/MediaSearchDialog";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

interface RoomRow {
  id: string;
  host_id: string;
  name: string;
  video_url: string | null;
  video_storage_path: string | null;
  video_kind: "file" | "youtube";
  playback_time: number;
  is_playing: boolean;
  controllers: string[];
  is_private: boolean;
  is_active: boolean;
}

interface FloatingEmoji { id: number; emoji: string; left: number; }
const REACTIONS = ["😂", "🔥", "😲", "❤️", "👏"];

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i;
const FILE_RE = /^https?:\/\/.+\.(mp4|webm|m3u8)(\?.*)?$/i;

function RoomPage() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<{ user_id: string; status: ParticipantStatus }[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ParticipantStatus>>({});
  const [theaterMode, setTheaterMode] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [nukeOpen, setNukeOpen] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const playerHandleRef = useRef<SyncedPlayerHandle | null>(null);
  const reactionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const moderationChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isHost = !!(user && room && user.id === room.host_id);
  const canControl = !!(user && room && (isHost || room.controllers.includes(user.id)));

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Load room + subscribe
  useEffect(() => {
    if (!user) return;
    let mounted = true;

    if (typeof window !== "undefined" && window.localStorage.getItem(`kicked:${roomId}`) === "1") {
      toast.error(uz.kickedMessage);
      navigate({ to: "/dashboard" });
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, host_id, name, video_url, video_storage_path, video_kind, playback_time, is_playing, controllers, is_private, is_active")
        .eq("id", roomId)
        .maybeSingle();

      if (!mounted) return;
      if (error || !data) {
        toast.error(uz.notFound);
        navigate({ to: "/dashboard" });
        return;
      }
      setRoom(data as RoomRow);
      setLoading(false);

      // Mark host's room active
      if (data.host_id === user.id && !data.is_active) {
        await supabase.from("rooms").update({ is_active: true }).eq("id", roomId);
      }

      await supabase
        .from("room_participants")
        .upsert(
          { room_id: roomId, user_id: user.id, status: "tayyor" },
          { onConflict: "room_id,user_id" }
        );
    })();

    const ch = supabase
      .channel(`room:${roomId}:db`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new as RoomRow)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => {
          toast.error("Xona o'chirildi");
          navigate({ to: "/dashboard" });
        }
      )
      .subscribe();

    const onUnload = () => {
      if (user.id === room?.host_id) {
        // Best-effort flag inactive on tab close
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`,
          new Blob([JSON.stringify({ is_active: false })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      mounted = false;
      window.removeEventListener("beforeunload", onUnload);
      supabase.removeChannel(ch);
      if (user) {
        supabase
          .from("room_participants")
          .delete()
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .then(() => {});
        // If host is leaving, mark room inactive
        if (room && user.id === room.host_id) {
          supabase.from("rooms").update({ is_active: false }).eq("id", roomId).then(() => {});
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user, navigate]);

  // Participants list
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("room_participants")
        .select("user_id, status")
        .eq("room_id", roomId);
      setParticipants(data ?? []);
    };
    load();
    const ch = supabase
      .channel(`room:${roomId}:participants`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId, user]);

  // Reactions channel
  useEffect(() => {
    const ch = supabase.channel(`room:${roomId}:reactions`, { config: { broadcast: { self: false } } });
    reactionChannelRef.current = ch;
    ch.on("broadcast", { event: "react" }, ({ payload }) => {
      addFloating((payload as { emoji: string }).emoji);
    }).subscribe();
    return () => { supabase.removeChannel(ch); reactionChannelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Moderation channel
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`room:${roomId}:moderation`, { config: { broadcast: { self: false } } });
    moderationChannelRef.current = ch;
    ch.on("broadcast", { event: "kick" }, ({ payload }) => {
      const { targetUserId } = payload as { targetUserId: string };
      if (targetUserId === user.id) {
        try { window.localStorage.setItem(`kicked:${roomId}`, "1"); } catch { /* noop */ }
        toast.error(uz.kickedMessage);
        navigate({ to: "/dashboard" });
      }
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); moderationChannelRef.current = null; };
  }, [roomId, user, navigate]);

  const addFloating = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const left = 20 + Math.random() * 60;
    setFloatingEmojis((prev) => [...prev, { id, emoji, left }]);
    window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 3000);
  }, []);

  const sendReaction = (emoji: string) => {
    addFloating(emoji);
    reactionChannelRef.current?.send({ type: "broadcast", event: "react", payload: { emoji } });
  };

  // Synced player
  const initialPlayerState = useMemo<PlayerState>(
    () => ({
      isPlaying: room?.is_playing ?? false,
      playbackTime: room?.playback_time ?? 0,
      videoUrl: room?.video_url ?? null,
      videoKind: (room?.video_kind ?? "file") as "file" | "youtube",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.id]
  );

  const handleBufferingMap = useCallback((m: Record<string, ParticipantStatus>) => {
    setStatusMap(m);
  }, []);

  const profilesRef = useRef<Record<string, { display_name: string }>>({});

  const handleRemotePlayer = useCallback(
    (next: { isPlaying: boolean; playbackTime: number }, prev: { isPlaying: boolean; playbackTime: number }) => {
      if (!room) return;
      const hostName = profilesRef.current[room.host_id]?.display_name ?? uz.host;
      if (next.isPlaying !== prev.isPlaying) {
        toast(next.isPlaying ? uz.playedVideo(hostName) : uz.pausedVideo(hostName));
      }
    },
    [room]
  );

  const synced = useSyncedPlayer({
    roomId,
    userId: user?.id ?? "",
    isHost,
    initialState: initialPlayerState,
    onBufferingMapChange: handleBufferingMap,
    onRemotePlayerChange: handleRemotePlayer,
    playerHandleRef,
  });

  useEffect(() => {
    if (room) {
      synced.setPlayerState({
        isPlaying: room.is_playing,
        playbackTime: room.playback_time,
        videoUrl: room.video_url,
        videoKind: room.video_kind,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.video_url, room?.video_kind]);

  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    participants.forEach((p) => ids.add(p.user_id));
    if (room) ids.add(room.host_id);
    if (user) ids.add(user.id);
    return Array.from(ids);
  }, [participants, room, user]);

  const profiles = useProfiles(participantIds);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);

  const bufferingUserId = useMemo(() => {
    return Object.entries(statusMap).find(([, s]) => s === "yuklanmoqda")?.[0] ?? null;
  }, [statusMap]);

  const submitVideoUrl = async () => {
    if (!isHost || !room) return;
    const trimmed = urlInput.trim();
    let kind: "file" | "youtube" | null = null;
    if (YT_RE.test(trimmed)) kind = "youtube";
    else if (FILE_RE.test(trimmed)) kind = "file";
    if (!kind) {
      toast.error(uz.invalidVideoUrl);
      return;
    }
    if (room.video_storage_path) {
      await supabase.storage.from("watch_party_media").remove([room.video_storage_path]);
    }
    await supabase
      .from("rooms")
      .update({
        video_url: trimmed,
        video_kind: kind,
        video_storage_path: null,
        playback_time: 0,
        is_playing: false,
      })
      .eq("id", roomId);
    setUrlInput("");
    toast.success("Video qo'shildi");
  };

  const nukeVideo = async () => {
    if (!isHost || !room) return;
    if (room.video_storage_path) {
      await supabase.storage.from("watch_party_media").remove([room.video_storage_path]);
    }
    await supabase
      .from("rooms")
      .update({ video_url: null, video_kind: "file", video_storage_path: null, playback_time: 0, is_playing: false })
      .eq("id", roomId);
    setNukeOpen(false);
    toast.success(uz.videoDeleted);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(uz.linkCopied);
  };

  const leave = () => navigate({ to: "/dashboard" });

  const handleForceMute = (targetUserId: string) => {
    moderationChannelRef.current?.send({
      type: "broadcast", event: "force-mute", payload: { targetUserId },
    });
    toast.success(uz.forceMute);
  };

  const handleKick = async (targetUserId: string) => {
    if (!room) return;
    await supabase
      .from("room_participants")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", targetUserId);
    moderationChannelRef.current?.send({
      type: "broadcast", event: "kick", payload: { targetUserId },
    });
    toast.success(uz.kick);
  };

  const handleToggleControl = async (targetUserId: string) => {
    if (!room || !isHost) return;
    const has = room.controllers.includes(targetUserId);
    const next = has
      ? room.controllers.filter((c) => c !== targetUserId)
      : [...room.controllers, targetUserId];
    await supabase.from("rooms").update({ controllers: next }).eq("id", roomId);
    const name = profiles[targetUserId]?.display_name ?? "Mehmon";
    toast.success(has ? uz.controlRevoked(name) : uz.controlGranted(name));
  };

  // LiveKit token
  const selfDisplayName = useMemo(() => {
    if (!user) return "Mehmon";
    return (
      profiles[user.id]?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Mehmon"
    );
  }, [user, profiles]);

  const lk = useLiveKitToken({
    roomId,
    displayName: selfDisplayName,
    enabled: !!user && !!room,
  });

  if (authLoading || loading || !user || !room) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const bufferingName =
    bufferingUserId && bufferingUserId !== user.id
      ? profiles[bufferingUserId]?.display_name ?? "Foydalanuvchi"
      : null;

  const onPlayerEvent = {
    onPlay: () => { if (canControl && !synced.isApplyingRemoteRef.current) synced.broadcastState({ isPlaying: true }); },
    onPause: () => { if (canControl && !synced.isApplyingRemoteRef.current) synced.broadcastState({ isPlaying: false }); },
    onSeek: (sec: number) => { if (canControl && !synced.isApplyingRemoteRef.current) synced.broadcastState({ playbackTime: sec }); },
    onProgress: (_sec: number) => { /* periodic broadcast handled inside hook */ },
    onBuffering: (b: boolean) => synced.setMyStatus(b ? "yuklanmoqda" : "tayyor"),
  };

  const RoomBody = (
    <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="border-b px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <Film className="size-5 text-primary" />
          </Link>
          <div className="min-w-0">
            <div className="font-semibold truncate text-sm">{room.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="size-3" />
              {participants.length} {uz.participants.toLowerCase()}
              {isHost && <span className="ml-2 text-primary">• {uz.host}</span>}
              {!isHost && canControl && <span className="ml-2 text-primary">• 🔑</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <InviteFriendsDialog roomId={roomId} roomName={room.name} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">{uz.copyLink}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uz.copyLink}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setTheaterMode((v) => !v)} className="hidden md:inline-flex">
                {theaterMode ? <Minimize2 className="size-3.5 mr-1.5" /> : <Maximize2 className="size-3.5 mr-1.5" />}
                {theaterMode ? uz.exitTheater : uz.theaterMode}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theaterMode ? uz.exitTheater : uz.theaterMode}</TooltipContent>
          </Tooltip>
          <Button
            size="sm" variant="outline"
            onClick={() => setMobilePanelOpen((v) => !v)}
            className="md:hidden"
            aria-label={mobilePanelOpen ? uz.hidePanel : uz.showPanel}
          >
            {mobilePanelOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={leave}>
            <LogOut className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{uz.leave}</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 p-2 md:p-3 gap-2 md:gap-3">
          {canControl && (
            <div className="flex gap-2 items-center">
              <Youtube className="size-4 text-destructive shrink-0" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={uz.youtubeOrFile}
                onKeyDown={(e) => e.key === "Enter" && submitVideoUrl()}
              />
              <Button size="sm" onClick={submitVideoUrl}>{uz.loadVideo}</Button>
              {room.video_url && (
                <Button size="sm" variant="destructive" onClick={() => setNukeOpen(true)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )}

          <div className="relative flex-1 rounded-xl overflow-hidden bg-black border min-h-0">
            <SyncedPlayer
              ref={playerHandleRef}
              state={synced.playerState}
              canControl={canControl}
              bufferingName={bufferingName}
              {...onPlayerEvent}
            />

            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {floatingEmojis.map((e) => (
                <div
                  key={e.id}
                  className="absolute bottom-4 text-5xl animate-float-up"
                  style={{ left: `${e.left}%` }}
                >
                  {e.emoji}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => sendReaction(r)}
                className="size-9 rounded-md bg-surface hover:bg-surface-2 border text-xl transition-transform hover:scale-110 active:scale-95"
                aria-label={`Reaktsiya ${r}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {mobilePanelOpen && (
          <button
            type="button"
            aria-label={uz.hidePanel}
            onClick={() => setMobilePanelOpen(false)}
            className="md:hidden absolute inset-0 bg-black/50 z-10"
          />
        )}

        <aside
          className={`bg-surface flex flex-col shrink-0
            absolute md:static inset-y-0 right-0 z-20 w-[85%] max-w-sm md:w-80
            border-l transition-transform duration-300 ease-out
            ${mobilePanelOpen ? "translate-x-0" : "translate-x-full"}
            md:translate-x-0
            ${theaterMode ? "md:w-0 md:opacity-0 md:overflow-hidden" : "md:opacity-100"}`}
        >
          <div className="p-3 border-b shrink-0 max-h-[45%] overflow-y-auto">
            <CameraGrid
              profiles={profiles}
              selfId={user.id}
              hostId={room.host_id}
              controllers={room.controllers}
              isHost={isHost}
              onForceMute={handleForceMute}
              onKick={handleKick}
              onToggleControl={handleToggleControl}
            />
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel roomId={roomId} userId={user.id} profiles={profiles} />
          </div>
        </aside>
      </div>

      <AlertDialog open={nukeOpen} onOpenChange={setNukeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uz.nuke}</AlertDialogTitle>
            <AlertDialogDescription>{uz.nukeWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={nukeVideo}
            >
              {uz.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );

  return (
    <TooltipProvider>
      {lk.token && lk.url ? (
        <LiveKitRoom
          serverUrl={lk.url}
          token={lk.token}
          connect
          audio
          video
          data-lk-theme="default"
        >
          <RoomAudioRenderer />
          {RoomBody}
        </LiveKitRoom>
      ) : (
        <div className="min-h-screen grid place-items-center">
          {lk.error ? (
            <p className="text-sm text-destructive">{uz.mediaConnectError}</p>
          ) : (
            <Loader2 className="animate-spin text-primary" />
          )}
        </div>
      )}
    </TooltipProvider>
  );
}
