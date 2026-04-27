import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import ReactPlayer from "react-player";
import type { SyncedPlayerHandle, PlayerState } from "@/hooks/useSyncedPlayer";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2, Film } from "lucide-react";
import { uz } from "@/lib/uz";

interface SyncedPlayerProps {
  state: PlayerState;
  canControl: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (sec: number) => void;
  onProgress: (sec: number) => void;
  onBuffering: (buffering: boolean) => void;
  bufferingName: string | null;
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export const SyncedPlayer = forwardRef<SyncedPlayerHandle, SyncedPlayerProps>(function SyncedPlayer(
  { state, canControl, onPlay, onPause, onSeek, onProgress, onBuffering, bufferingName },
  ref
) {
  const playerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localTime, setLocalTime] = useState(state.playbackTime);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useImperativeHandle(ref, () => ({
    seekTo: (sec) => {
      const p = playerRef.current;
      if (p) {
        try { p.currentTime = sec; } catch { /* noop */ }
      }
      setLocalTime(sec);
    },
    play: () => {
      playerRef.current?.play().catch(() => {});
    },
    pause: () => {
      playerRef.current?.pause();
    },
    getCurrentTime: () => playerRef.current?.currentTime ?? 0,
  }), []);

  // Drive native HTMLMediaElement-style events from <ReactPlayer>'s <video> child
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const onPlayEv = () => onPlay();
    const onPauseEv = () => onPause();
    const onSeekedEv = () => onSeek(el.currentTime);
    const onTimeUpdate = () => {
      setLocalTime(el.currentTime);
      onProgress(el.currentTime);
    };
    const onDurationChange = () => setDuration(el.duration || 0);
    const onWaiting = () => onBuffering(true);
    const onCanPlay = () => onBuffering(false);
    el.addEventListener("play", onPlayEv);
    el.addEventListener("pause", onPauseEv);
    el.addEventListener("seeked", onSeekedEv);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("canplay", onCanPlay);
    return () => {
      el.removeEventListener("play", onPlayEv);
      el.removeEventListener("pause", onPauseEv);
      el.removeEventListener("seeked", onSeekedEv);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("canplay", onCanPlay);
    };
  }, [onPlay, onPause, onSeek, onProgress, onBuffering, state.videoUrl]);

  const togglePlay = () => {
    if (!canControl) return;
    const p = playerRef.current;
    if (!p) return;
    if (p.paused) p.play().catch(() => {});
    else p.pause();
  };

  const requestFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else c.requestFullscreen().catch(() => {});
  };

  if (!state.videoUrl) {
    return (
      <div className="absolute inset-0 grid place-items-center text-center p-6">
        <div>
          <Film className="size-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">{uz.noVideo}</h3>
          <p className="text-sm text-muted-foreground mt-1">{uz.noVideoHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 bg-black">
      <ReactPlayer
        ref={playerRef as unknown as React.Ref<HTMLVideoElement>}
        src={state.videoUrl}
        playing={state.isPlaying}
        controls={false}
        muted={muted}
        volume={volume}
        width="100%"
        height="100%"
        playsInline
        config={{
          youtube: {
            playerVars: {
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              disablekb: 1,
              fs: 0,
            },
          },
        }}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      />

      {/* Controls overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10 flex flex-col gap-2 z-10">
        <div className="flex items-center gap-2 text-[11px] text-white font-mono">
          <span>{fmtTime(localTime)}</span>
          <Slider
            value={[localTime]}
            max={duration || 1}
            step={0.1}
            onValueChange={(v) => canControl && onSeek(v[0])}
            disabled={!canControl}
            className="flex-1"
          />
          <span>{fmtTime(duration)}</span>
        </div>

        <div className="flex items-center gap-2">
          {canControl ? (
            <Button size="icon" variant="secondary" onClick={togglePlay} className="size-8">
              {state.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
          ) : (
            <span className="text-[11px] text-white/80 px-2 py-1 rounded bg-black/40">
              {uz.hostOnly}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setMuted((v) => !v)}
              className="text-white/90 hover:text-white"
              aria-label={uz.volume}
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <Slider
              value={[muted ? 0 : volume]}
              max={1}
              step={0.01}
              onValueChange={(v) => { setVolume(v[0]); if (v[0] > 0) setMuted(false); }}
              className="w-24"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={requestFullscreen}
                  className="size-8 rounded-md bg-white/10 hover:bg-white/20 grid place-items-center text-white"
                  aria-label={uz.fullscreen}
                >
                  <Maximize className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{uz.fullscreen}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {bufferingName && (
        <div className="absolute inset-0 bg-black/70 grid place-items-center backdrop-blur-sm z-20">
          <div className="text-center px-6">
            <Loader2 className="size-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-white font-medium">{uz.waitingFor(bufferingName)}</p>
          </div>
        </div>
      )}
    </div>
  );
});
