import { useEffect, useRef, useState } from "react";
import type { PeerState } from "@/hooks/usePeerMesh";
import type { ProfileLite } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Mic, MicOff, Video, VideoOff, AlertCircle } from "lucide-react";
import { uz } from "@/lib/uz";

interface CameraGridProps {
  localStream: MediaStream | null;
  localSpeaking: boolean;
  peers: Record<string, PeerState>;
  profiles: Record<string, ProfileLite>;
  permError: string | null;
  micEnabled: boolean;
  camEnabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onRetry: () => void;
  selfId: string;
  selfName: string;
}

function VideoTile({
  stream, name, speaking, muted, isSelf,
}: { stream: MediaStream | null; name: string; speaking: boolean; muted?: boolean; isSelf?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled);

  return (
    <div className={`relative aspect-video rounded-lg overflow-hidden bg-surface-2 border transition-shadow ${speaking ? "speaking-glow" : ""}`}>
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted || isSelf}
          className={`w-full h-full object-cover ${hasVideo ? "" : "opacity-0"}`}
        />
      ) : null}
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-12 rounded-full bg-primary/20 grid place-items-center text-primary font-bold">
            {name[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[11px] font-medium text-white drop-shadow flex items-center gap-1">
        <span className="truncate">{name}{isSelf ? " (siz)" : ""}</span>
      </div>
    </div>
  );
}

export function CameraGrid({
  localStream, localSpeaking, peers, profiles, permError,
  micEnabled, camEnabled, onToggleMic, onToggleCam, onRetry, selfId, selfName,
}: CameraGridProps) {
  const [permDismissed, setPermDismissed] = useState(false);

  if (permError && !permDismissed) {
    return (
      <div className="rounded-xl border bg-surface p-4 space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertCircle className="size-5 text-destructive shrink-0" />
          <p>{uz.permError}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry}>{uz.permRetry}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPermDismissed(true)}>{uz.watchOnly}</Button>
        </div>
      </div>
    );
  }

  const peerEntries = Object.values(peers);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <VideoTile stream={localStream} name={selfName} speaking={localSpeaking} isSelf />
          {peerEntries.map((p) => (
            <VideoTile
              key={p.userId}
              stream={p.stream}
              name={profiles[p.userId]?.display_name ?? "Mehmon"}
              speaking={p.speaking}
            />
          ))}
        </div>
        <div className="flex gap-2 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={micEnabled ? "secondary" : "destructive"} onClick={onToggleMic}>
                {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{micEnabled ? uz.micOn : uz.micOff}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={camEnabled ? "secondary" : "destructive"} onClick={onToggleCam}>
                {camEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{camEnabled ? uz.camOn : uz.camOff}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
