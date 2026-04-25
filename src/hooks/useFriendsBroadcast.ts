import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const FRIENDS_LS_KEY = (uid: string) => `friends:${uid}`;

export interface OnlineUser {
  userId: string;
  displayName: string;
}

export interface FriendRequest {
  from: string;
  fromName: string;
  at: number;
}

export interface RoomInvite {
  from: string;
  fromName: string;
  roomId: string;
  roomName: string;
  at: number;
}

interface UseFriendsBroadcastArgs {
  userId: string | null;
  displayName: string;
  enabled: boolean;
}

function readFriends(uid: string): string[] {
  try {
    const raw = localStorage.getItem(FRIENDS_LS_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFriends(uid: string, ids: string[]) {
  try {
    localStorage.setItem(FRIENDS_LS_KEY(uid), JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* noop */
  }
}

export function useFriendsBroadcast({ userId, displayName, enabled }: UseFriendsBroadcastArgs) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, OnlineUser>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<RoomInvite[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load friends from localStorage
  useEffect(() => {
    if (!userId) return;
    setFriends(readFriends(userId));
  }, [userId]);

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      channelRef.current?.send({ type: "broadcast", event, payload });
    },
    []
  );

  useEffect(() => {
    if (!enabled || !userId) return;

    const ch = supabase.channel("global:friends", {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ userId?: string; displayName?: string }>>;
      const next: Record<string, OnlineUser> = {};
      Object.entries(state).forEach(([key, arr]) => {
        const meta = arr[0] ?? {};
        next[key] = { userId: key, displayName: meta.displayName ?? "Foydalanuvchi" };
      });
      setOnlineUsers(next);
    });

    ch.on("broadcast", { event: "friend-request" }, ({ payload }) => {
      const p = payload as { from: string; fromName: string; to: string };
      if (p.to !== userId) return;
      console.log("[Friends] request from", p.from);
      setIncomingRequests((prev) => {
        if (prev.some((r) => r.from === p.from)) return prev;
        return [...prev, { from: p.from, fromName: p.fromName, at: Date.now() }];
      });
    });

    ch.on("broadcast", { event: "friend-accept" }, ({ payload }) => {
      const p = payload as { from: string; fromName: string; to: string };
      if (p.to !== userId) return;
      console.log("[Friends] accept from", p.from);
      setFriends((prev) => {
        if (prev.includes(p.from)) return prev;
        const next = [...prev, p.from];
        writeFriends(userId, next);
        return next;
      });
    });

    ch.on("broadcast", { event: "room-invite" }, ({ payload }) => {
      const p = payload as { from: string; fromName: string; to: string; roomId: string; roomName: string };
      if (p.to !== userId) return;
      console.log("[Invite] received from", p.from, p.roomId);
      setIncomingInvites((prev) => {
        if (prev.some((i) => i.from === p.from && i.roomId === p.roomId)) return prev;
        return [...prev, { from: p.from, fromName: p.fromName, roomId: p.roomId, roomName: p.roomName, at: Date.now() }];
      });
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ userId, displayName });
        console.log("[Friends] presence tracked");
      }
    });

    return () => {
      ch.untrack().catch(() => {});
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [enabled, userId, displayName]);

  const sendFriendRequest = useCallback(
    (toId: string) => {
      if (!userId) return;
      send("friend-request", { from: userId, fromName: displayName, to: toId });
    },
    [userId, displayName, send]
  );

  const acceptFriend = useCallback(
    (fromId: string) => {
      if (!userId) return;
      setFriends((prev) => {
        if (prev.includes(fromId)) return prev;
        const next = [...prev, fromId];
        writeFriends(userId, next);
        return next;
      });
      setIncomingRequests((prev) => prev.filter((r) => r.from !== fromId));
      send("friend-accept", { from: userId, fromName: displayName, to: fromId });
    },
    [userId, displayName, send]
  );

  const declineFriend = useCallback(
    (fromId: string) => {
      setIncomingRequests((prev) => prev.filter((r) => r.from !== fromId));
      send("friend-decline", { from: userId, to: fromId });
    },
    [userId, send]
  );

  const removeFriend = useCallback(
    (id: string) => {
      if (!userId) return;
      setFriends((prev) => {
        const next = prev.filter((f) => f !== id);
        writeFriends(userId, next);
        return next;
      });
    },
    [userId]
  );

  const sendInvite = useCallback(
    (toId: string, roomId: string, roomName: string) => {
      if (!userId) return;
      send("room-invite", {
        from: userId,
        fromName: displayName,
        to: toId,
        roomId,
        roomName,
      });
    },
    [userId, displayName, send]
  );

  const dismissInvite = useCallback((from: string, roomId: string) => {
    setIncomingInvites((prev) => prev.filter((i) => !(i.from === from && i.roomId === roomId)));
  }, []);

  return {
    onlineUsers,
    friends,
    incomingRequests,
    incomingInvites,
    sendFriendRequest,
    acceptFriend,
    declineFriend,
    removeFriend,
    sendInvite,
    dismissInvite,
  };
}
