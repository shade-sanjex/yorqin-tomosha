import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSyncedPlayer, type ParticipantStatus } from "@/hooks/useSyncedPlayer";
import { usePeerMesh } from "@/hooks/usePeerMesh";
import { useProfiles } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Play, Pause, Upload, Link2, Trash2, Maximize2, Minimize2, LogOut,
  Copy, Loader2, Film, Users, Maximize,
} from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";
import { CameraGrid } from "@/components/CameraGrid";
import { ChatPanel } from "@/components/ChatPanel";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

interface RoomRow {
  id: string;
  host_id: string;
  name: string;
  video_url: string | null;
  video_storage_path: string | null;
  playback_time: number;
  is_playing: boolean;
}

interface FloatingEmoji { id: number; emoji: string; left: number; }

const REACTIONS = ["😂", "🔥", "😲", "❤️", "👏"];

function RoomPage() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<{ user_id: string; status: ParticipantStatus }[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ParticipantStatus>>({});
  const [theaterMode, setTheaterMode] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [nukeOpen, setNukeOpen] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reactionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isHost = !!(user && room && user.id === room.host_id);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Load room + subscribe
  useEffect(() => {
    if (!user) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, host_id, name, video_url, video_storage_path, playback_time, is_playing")
        .eq("id", roomId)
        .maybeSingle();

      if (!mounted) return;
      if (error || !data) {
        toast.error(uz.notFound);
        navigate({ to: "/dashboard" });
        return;
      }
      setRoom(data);
      setLoading(false);

      // Join as participant (idempotent upsert)
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

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      if (user) {
        supabase
          .from("room_participants")
          .delete()
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .then(() => {});
      }
    };
  }, [roomId, user, navigate]);

  // Load + subscribe to participants
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
      const emoji = (payload as { emoji: string }).emoji;
      addFloating(emoji);
    }).subscribe();
    return () => { supabase.removeChannel(ch); reactionChannelRef.current = null; };
  }, [roomId]);

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
  const initialPlayerState = useMemo(
    () => ({
      isPlaying: room?.is_playing ?? false,
      playbackTime: room?.playback_time ?? 0,
      videoUrl: room?.video_url ?? null,
    }),
    // only initialize once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.id]
  );

  const handleBufferingMap = useCallback((m: Record<string, ParticipantStatus>) => {
    setStatusMap(m);
  }, []);

  const synced = useSyncedPlayer({
    roomId,
    userId: user?.id ?? "",
    isHost,
    videoRef,
    initialState: initialPlayerState,
    onBufferingMapChange: handleBufferingMap,
  });

  // When room.video_url changes from realtime (e.g. host changed), update local
  useEffect(() => {
    if (room) {
      synced.setPlayerState((prev) => ({
        ...prev,
        videoUrl: room.video_url,
        isPlaying: room.is_playing,
        playbackTime: room.playback_time,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.video_url]);

  // WebRTC mesh
  const peerMesh = usePeerMesh({
    roomId,
    userId: user?.id ?? "",
    enabled: !!user && !!room,
  });

  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    participants.forEach((p) => ids.add(p.user_id));
    if (room) ids.add(room.host_id);
    if (user) ids.add(user.id);
    return Array.from(ids);
  }, [participants, room, user]);

  const profiles = useProfiles(participantIds);

  // Buffering overlay logic
  const bufferingUserId = useMemo(() => {
    return Object.entries(statusMap).find(([, s]) => s === "yuklanmoqda")?.[0] ?? null;
  }, [statusMap]);

  // Handle video native events to broadcast status & host control
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onWaiting = () => synced.setMyStatus("yuklanmoqda");
    const onCanPlay = () => synced.setMyStatus("tayyor");
    const onPlaying = () => synced.setMyStatus("tayyor");
    const onPlay = () => {
      if (isHost && !synced.isApplyingRemoteRef.current) synced.broadcastState({ isPlaying: true });
    };
    const onPause = () => {
      if (isHost && !synced.isApplyingRemoteRef.current) synced.broadcastState({ isPlaying: false });
    };
    const onSeeked = () => {
      if (isHost && !synced.isApplyingRemoteRef.current) {
        synced.broadcastState({ playbackTime: v.currentTime });
      }
    };
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [isHost, synced]);

  const togglePlay = () => {
    if (!isHost) {
      toast.info(uz.hostOnly);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const handleUpload = async (file: File) => {
    if (!user || !isHost) return;
    if (!file.type.startsWith("video/")) {
      toast.error("mp4 yoki webm fayl tanlang");
      return;
    }
    const ext = file.name.split(".").pop() || "mp4";
    const path = `${user.id}/${roomId}-${Date.now()}.${ext}`;
    setUploadProgress(0);
    // Use XHR for progress
    const { data: signed, error: signErr } = await supabase
      .storage
      .from("watch_party_media")
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      setUploadProgress(null);
      toast.error(uz.unknownError);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.signedUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")));
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    }).catch(() => {
      setUploadProgress(null);
      toast.error(uz.networkError);
    });

    const { data: pub } = supabase.storage.from("watch_party_media").getPublicUrl(path);
    await supabase
      .from("rooms")
      .update({
        video_url: pub.publicUrl,
        video_storage_path: path,
        playback_time: 0,
        is_playing: false,
      })
      .eq("id", roomId);
    setUploadProgress(null);
    toast.success("Video yuklandi");
  };

  const submitExternalUrl = async () => {
    if (!isHost) return;
    const trimmed = urlInput.trim();
    if (!/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(trimmed)) {
      toast.error(uz.invalidUrl);
      return;
    }
    // If a previously uploaded video exists, remove it
    if (room?.video_storage_path) {
      await supabase.storage.from("watch_party_media").remove([room.video_storage_path]);
    }
    await supabase
      .from("rooms")
      .update({ video_url: trimmed, video_storage_path: null, playback_time: 0, is_playing: false })
      .eq("id", roomId);
    setUrlDialogOpen(false);
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
      .update({ video_url: null, video_storage_path: null, playback_time: 0, is_playing: false })
      .eq("id", roomId);
    setNukeOpen(false);
    toast.success(uz.videoDeleted);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(uz.linkCopied);
  };

  const leave = () => navigate({ to: "/dashboard" });

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
  const selfName = profiles[user.id]?.display_name ?? user.email?.split("@")[0] ?? "Siz";

  return (
    <TooltipProvider>
      <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        {/* Top bar */}
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
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="size-3.5 mr-1.5" />
                  {uz.copyLink}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uz.copyLink}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => setTheaterMode((v) => !v)}>
                  {theaterMode ? <Minimize2 className="size-3.5 mr-1.5" /> : <Maximize2 className="size-3.5 mr-1.5" />}
                  {theaterMode ? uz.exitTheater : uz.theaterMode}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theaterMode ? uz.exitTheater : uz.theaterMode}</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="ghost" onClick={leave}>
              <LogOut className="size-3.5 mr-1.5" />
              {uz.leave}
            </Button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Video area */}
          <div className="flex-1 flex flex-col min-w-0 p-3 gap-3">
            <div className="relative flex-1 rounded-xl overflow-hidden bg-black border min-h-0">
              {room.video_url ? (
                <video
                  ref={videoRef}
                  src={room.video_url}
                  className="w-full h-full object-contain"
                  controls={isHost}
                  controlsList="nodownload"
                  playsInline
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-center p-6">
                  <div>
                    <Film className="size-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-lg">{uz.noVideo}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{uz.noVideoHint}</p>
                  </div>
                </div>
              )}

              {/* Guest "no controls" hint */}
              {room.video_url && !isHost && (
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-[11px]">
                  {uz.hostOnly}
                </div>
              )}

              {/* Buffering overlay */}
              {bufferingName && (
                <div className="absolute inset-0 bg-black/70 grid place-items-center backdrop-blur-sm">
                  <div className="text-center px-6">
                    <Loader2 className="size-10 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-white font-medium">{uz.waitingFor(bufferingName)}</p>
                  </div>
                </div>
              )}

              {/* Floating emojis */}
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

            {/* Controls row */}
            <div className="flex items-center gap-2 flex-wrap">
              {isHost && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" onClick={togglePlay} disabled={!room.video_url}>
                        {room.is_playing ? <Pause className="size-4 mr-1.5" /> : <Play className="size-4 mr-1.5" />}
                        {room.is_playing ? "Pauza" : "O'ynatish"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{room.is_playing ? "To'xtatish" : "Boshlash"}</TooltipContent>
                  </Tooltip>

                  <label>
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      hidden
                      disabled={uploadProgress !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                        e.currentTarget.value = "";
                      }}
                    />
                    <Button size="sm" variant="outline" asChild>
                      <span className="cursor-pointer">
                        <Upload className="size-4 mr-1.5" />
                        {uz.uploadVideo}
                      </span>
                    </Button>
                  </label>

                  <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Link2 className="size-4 mr-1.5" />
                        {uz.externalUrl}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{uz.externalUrl}</DialogTitle>
                        <DialogDescription>{uz.pasteUrl}</DialogDescription>
                      </DialogHeader>
                      <Input
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/video.mp4"
                      />
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setUrlDialogOpen(false)}>{uz.cancel}</Button>
                        <Button onClick={submitExternalUrl}>Qo'shish</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {room.video_url && (
                    <Button size="sm" variant="destructive" onClick={() => setNukeOpen(true)}>
                      <Trash2 className="size-4 mr-1.5" />
                      {uz.nuke}
                    </Button>
                  )}
                </>
              )}

              <div className="ml-auto flex gap-1">
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

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="rounded-lg border bg-surface p-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span>{uz.uploading}</span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside
            className={`border-l bg-surface flex flex-col transition-all duration-300 ease-out shrink-0 ${
              theaterMode ? "w-0 opacity-0 overflow-hidden" : "w-80 opacity-100"
            }`}
          >
            <Tabs defaultValue="cameras" className="flex flex-col h-full min-h-0">
              <TabsList className="grid grid-cols-2 m-2">
                <TabsTrigger value="cameras">{uz.cameras}</TabsTrigger>
                <TabsTrigger value="chat">{uz.chat}</TabsTrigger>
              </TabsList>
              <TabsContent value="cameras" className="flex-1 overflow-y-auto p-3 mt-0">
                <CameraGrid
                  localStream={peerMesh.localStream}
                  localSpeaking={peerMesh.localSpeaking}
                  peers={peerMesh.peers}
                  profiles={profiles}
                  permError={peerMesh.permError}
                  micEnabled={peerMesh.micEnabled}
                  camEnabled={peerMesh.camEnabled}
                  onToggleMic={peerMesh.toggleMic}
                  onToggleCam={peerMesh.toggleCam}
                  onRetry={peerMesh.retryPermission}
                  selfId={user.id}
                  selfName={selfName}
                />
                <div className="mt-4 border-t pt-3">
                  <h4 className="text-xs uppercase text-muted-foreground font-medium mb-2">{uz.participants}</h4>
                  <ul className="space-y-1">
                    {participantIds.map((id) => {
                      const p = profiles[id];
                      const status = statusMap[id] ?? "tayyor";
                      const isThisHost = id === room.host_id;
                      return (
                        <li key={id} className="flex items-center gap-2 text-sm">
                          <div className="size-7 rounded-full bg-primary/20 grid place-items-center text-xs font-bold text-primary">
                            {(p?.display_name ?? "?")[0].toUpperCase()}
                          </div>
                          <span className="truncate flex-1">{p?.display_name ?? "Mehmon"}{isThisHost && " 👑"}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              status === "yuklanmoqda" ? "bg-yellow-500/20 text-yellow-300" :
                              status === "tayyor" ? "bg-success/20 text-success" :
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status === "yuklanmoqda" ? uz.loadingStatus : status === "tayyor" ? uz.ready : uz.joined}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </TabsContent>
              <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
                <ChatPanel roomId={roomId} userId={user.id} profiles={profiles} />
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        {/* Nuke confirmation */}
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
    </TooltipProvider>
  );
}
