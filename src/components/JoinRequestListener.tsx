import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

/**
 * Mounted globally for any signed-in user. For each room this user hosts that is
 * currently active, listens on `room:{id}:lobby` for join requests from public-lobby
 * users and presents an Accept/Decline toast. The host responds via the same channel.
 */
export function JoinRequestListener() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channels: Array<ReturnType<typeof supabase.channel>> = [];
    let cancelled = false;

    (async () => {
      // All rooms hosted by this user
      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("host_id", user.id);
      if (cancelled || !data) return;

      data.forEach((room) => {
        const ch = supabase.channel(`room:${room.id}:lobby`, {
          config: { broadcast: { self: false } },
        });
        ch.on("broadcast", { event: "join-request" }, ({ payload }) => {
          const p = payload as { fromId: string; fromName: string };
          const id = `lobby-${room.id}-${p.fromId}`;
          toast(uz.joinRequestIncoming(p.fromName), {
            id,
            duration: 25000,
            description: room.name,
            action: {
              label: uz.accept,
              onClick: () => {
                ch.send({
                  type: "broadcast",
                  event: "join-response",
                  payload: { toId: p.fromId, accepted: true },
                });
                toast.dismiss(id);
              },
            },
            cancel: {
              label: uz.decline,
              onClick: () => {
                ch.send({
                  type: "broadcast",
                  event: "join-response",
                  payload: { toId: p.fromId, accepted: false },
                });
                toast.dismiss(id);
              },
            },
          });
        });
        ch.subscribe();
        channels.push(ch);
      });
    })();

    return () => {
      cancelled = true;
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [user]);

  return null;
}
