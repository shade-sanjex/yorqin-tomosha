import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles } from "@/hooks/useProfiles";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Film, Users, LogIn } from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

interface PublicRoom {
  id: string;
  name: string;
  host_id: string;
  is_active: boolean;
  is_private: boolean;
}

export function LobbyList() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, name, host_id, is_active, is_private")
      .eq("is_private", false)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(30);
    setRooms((data ?? []).filter((r) => r.host_id !== user?.id));
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("lobby:active-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const profiles = useProfiles(rooms.map((r) => r.host_id));

  const requestJoin = async (room: PublicRoom) => {
    if (!user) return;
    setPendingId(room.id);
    const ch = supabase.channel(`room:${room.id}:lobby`, {
      config: { broadcast: { self: false } },
    });
    const fromName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Mehmon";

    let resolved = false;
    const timeout = window.setTimeout(() => {
      if (!resolved) {
        toast.error(uz.hostNotResponding);
        setPendingId(null);
        supabase.removeChannel(ch);
      }
    }, 30000);

    ch.on("broadcast", { event: "join-response" }, ({ payload }) => {
      const p = payload as { toId: string; accepted: boolean };
      if (p.toId !== user.id) return;
      resolved = true;
      window.clearTimeout(timeout);
      setPendingId(null);
      supabase.removeChannel(ch);
      if (p.accepted) {
        toast.success(uz.joinAccepted);
        window.location.href = `/room/${room.id}`;
      } else {
        toast.error(uz.joinDeclined);
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.send({
          type: "broadcast",
          event: "join-request",
          payload: { fromId: user.id, fromName },
        });
        toast.info(uz.joinRequestSent);
      }
    });
  };

  if (rooms.length === 0) {
    return (
      <div className="rounded-xl border bg-surface p-8 text-center text-muted-foreground text-sm">
        {uz.noActiveRooms}
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {rooms.map((r) => {
        const host = profiles[r.host_id];
        const hostName = host?.display_name ?? "Mehmon";
        return (
          <li key={r.id} className="rounded-xl border bg-surface p-4 flex items-center gap-3">
            <Avatar className="size-10 shrink-0">
              {host?.avatar_url ? <AvatarImage src={host.avatar_url} alt={hostName} /> : null}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                {hostName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate flex items-center gap-2">
                <Film className="size-3.5 text-primary" />
                {r.name}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="size-3" /> {hostName}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => requestJoin(r)}
              disabled={pendingId === r.id}
            >
              <LogIn className="size-3.5 mr-1.5" />
              {pendingId === r.id ? uz.joinRequestSent : uz.joinRoom}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
