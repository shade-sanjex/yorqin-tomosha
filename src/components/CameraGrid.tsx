import { useEffect, useRef, useState } from "react";
import {
  useTracks,
  useLocalParticipant,
  useParticipants,
  useConnectionState,
  TrackReference,
} from "@livekit/components-react";
import { Track, ConnectionState, Participant } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Mic, MicOff, Video, VideoOff, Volume2, VolumeX,
  MoreVertical, MicOff as ForceMuteIcon, UserX,
  KeyRound, KeySquare, Loader2,
} from "lucide-react";
import { uz } from "@/lib/uz";
import type { ProfileLite } from "@/hooks/useProfiles";

interface CameraGridProps {
  profiles: Record<string, ProfileLite>;
  selfId: string;
  hostId: string;
  controllers: string[];
  isHost: boolean;
  onForceMute: (userId: string) => void;
  onKick: (userId: string) => void;
  onToggleControl: (userId: string) => void;
}

interface TileProps {
  participant: Participant;
  videoTrack?: TrackReference;
  micEnabled: boolean;
  camEnabled: boolean;
  isSelf: boolean;
  isHost: boolean;
  isController: boolean;
  profile?: ProfileLite;
  showHostMenu: boolean;
  onForceMute: () => void;
  onKick: () => void;
  onToggleControl: () => void;
}

function VideoTile({
  participant, videoTrack, micEnabled, camEnabled,
  isSelf, isHost, isController, profile, showHostMenu,
  onForceMute, onKick, onToggleControl,
}: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [locallyMuted, setLocallyMuted] = useState(false);

  // Attach LiveKit video track to <video> element
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const pub = videoTrack?.publication;
    const track = pub?.track;
    if (track && camEnabled) {
      track.attach(el);
      console.log("[LiveKit] video track attached to <video>", participant.identity);
      return () => {
        track.detach(el);
      };
    }
  }, [videoTrack, camEnabled, participant.identity]);

  const name = profile?.display_name ?? participant.name ?? "Mehmon";
  const initial = name[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-2 border">
      {camEnabled && videoTrack ? (
        <div
          className="absolute inset-0"
          style={isSelf ? { transform: "rotateY(180deg)" } : undefined}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf || locallyMuted}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-surface-2">
          <div className="text-center">
            <Avatar className="size-14 mx-auto mb-2">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center">
              <VideoOff className="size-3" />
              {uz.cameraOffLabel}
            </p>
          </div>
        </div>
      )}

      {!micEnabled && (
        <div className="absolute top-1 left-1 size-6 rounded-md bg-destructive/80 grid place-items-center text-white">
          <MicOff className="size-3" />
        </div>
      )}

      {!isSelf && (
        <div className="absolute top-1 right-1 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setLocallyMuted((v) => !v)}
                className="size-7 rounded-md bg-black/60 hover:bg-black/80 grid place-items-center text-white"
                aria-label={locallyMuted ? uz.localUnmute : uz.localMute}
              >
                {locallyMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{locallyMuted ? uz.localUnmute : uz.localMute}</TooltipContent>
          </Tooltip>

          {showHostMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="size-7 rounded-md bg-black/60 hover:bg-black/80 grid place-items-center text-white"
                  aria-label={uz.hostActions}
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onToggleControl}>
                  {isController ? <KeyRound className="size-4 mr-2" /> : <KeySquare className="size-4 mr-2" />}
                  {isController ? uz.revokeControl : uz.grantControl}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onForceMute}>
                  <ForceMuteIcon className="size-4 mr-2" />
                  {uz.forceMute}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onKick} className="text-destructive focus:text-destructive">
                  <UserX className="size-4 mr-2" />
                  {uz.kick}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[11px] font-medium text-white drop-shadow flex items-center gap-1">
        <span className="truncate">
          {name}{isSelf ? " (siz)" : ""}{isHost ? " 👑" : ""}{isController && !isHost ? " 🔑" : ""}
        </span>
      </div>
    </div>
  );
}

export function CameraGrid({
  profiles, selfId, hostId, controllers, isHost,
  onForceMute, onKick, onToggleControl,
}: CameraGridProps) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const { localParticipant } = useLocalParticipant();

  const camOn = localParticipant?.isCameraEnabled ?? false;
  const micOn = localParticipant?.isMicrophoneEnabled ?? false;

  const toggleMic = () => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(!micOn).catch((e) => console.warn("[LiveKit] mic toggle", e));
  };
  const toggleCam = () => {
    if (!localParticipant) return;
    localParticipant.setCameraEnabled(!camOn).catch((e) => console.warn("[LiveKit] cam toggle", e));
  };

  const cameraTracksByIdentity = new Map<string, TrackReference>();
  cameraTracks.forEach((t) => {
    cameraTracksByIdentity.set(t.participant.identity, t);
  });

  if (connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting) {
    return (
      <div className="rounded-xl border bg-surface p-6 grid place-items-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary mb-2" />
        {uz.connectingMedia}
      </div>
    );
  }

  if (connectionState === ConnectionState.Disconnected) {
    return (
      <div className="rounded-xl border bg-surface p-4 text-sm text-destructive">
        {uz.mediaConnectError}
      </div>
    );
  }

  // Order: self first, then others
  const ordered = [...participants].sort((a, b) => {
    if (a.identity === selfId) return -1;
    if (b.identity === selfId) return 1;
    return 0;
  });

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {ordered.map((p) => (
            <VideoTile
              key={p.identity}
              participant={p}
              videoTrack={cameraTracksByIdentity.get(p.identity)}
              micEnabled={p.isMicrophoneEnabled}
              camEnabled={p.isCameraEnabled}
              isSelf={p.identity === selfId}
              isHost={p.identity === hostId}
              isController={controllers.includes(p.identity)}
              profile={profiles[p.identity]}
              showHostMenu={isHost && p.identity !== selfId}
              onForceMute={() => onForceMute(p.identity)}
              onKick={() => onKick(p.identity)}
              onToggleControl={() => onToggleControl(p.identity)}
            />
          ))}
        </div>
        <div className="flex gap-2 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={micOn ? "secondary" : "destructive"} onClick={toggleMic}>
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{micOn ? uz.micOn : uz.micOff}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={camOn ? "secondary" : "destructive"} onClick={toggleCam}>
                {camOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{camOn ? uz.camOn : uz.camOff}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
