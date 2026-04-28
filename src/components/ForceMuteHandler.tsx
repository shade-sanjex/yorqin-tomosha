import { useEffect } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

interface Props {
  roomId: string;
  selfId: string;
}

/**
 * Mounted inside <LiveKitRoom>. Listens for `force-mute` broadcasts on
 * `room:{id}:moderation` targeting the current user and disables their
 * microphone via the LiveKit local participant.
 */
export function ForceMuteHandler({ roomId, selfId }: Props) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const ch = supabase.channel(`room:${roomId}:moderation`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "force-mute" }, ({ payload }) => {
      const { targetUserId } = payload as { targetUserId: string };
      if (targetUserId !== selfId) return;
      localParticipant?.setMicrophoneEnabled(false).catch(() => {});
      toast.warning(uz.forcedMutedToast);
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, selfId, localParticipant]);

  return null;
}
