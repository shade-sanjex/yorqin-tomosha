import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

interface RoomLite { id: string; name: string }

/**
 * Mounted globally for any signed-in user. For each room this user hosts that is
 * currently active, listens on `room:{id}:lobby` for join requests from public-lobby
 * users and presents an Accept/Decline toast. The host responds via the same channel.
 *
 * Re-subscribes whenever the user's set of hosted rooms changes (new room created,
 * room deleted, etc.) so newly created rooms are immediately covered.
 */
export function JoinRequestListener() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomLite[]>([]);

  // Maintain a fresh list of rooms hosted by this user.
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("host_id", user.id);
      if (!mounted) return;
      setRooms(data ?? []);
    };
    load();
    const ch = supabase
      .channel(`user:${user.id}:rooms`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `host_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [user]);

  // Subscribe a lobby channel per hosted room.
  useEffect(() => {
    if (!user || rooms.length === 0) return;

    const channels = rooms.map((room) => {
      const ch = supabase.channel(`room:${room.id}:lobby`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "join-request" }, ({ payload }) => {
        const p = payload as { fromId: string; fromName: string };
        const id = `lobby-${room.id}-${p.fromId}`;
        toast(uz.joinRequestIncoming(p.fromName), {
          id,
          duration: Infinity,
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
      return ch;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [user, rooms]);

  return null;
}
