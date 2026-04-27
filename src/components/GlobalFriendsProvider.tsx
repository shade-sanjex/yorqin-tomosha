import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useFriendsBroadcast } from "@/hooks/useFriendsBroadcast";
import { JoinRequestListener } from "@/components/JoinRequestListener";
import { uz } from "@/lib/uz";

type Ctx = ReturnType<typeof useFriendsBroadcast> | null;

const FriendsCtx = createContext<Ctx>(null);

export function useFriends() {
  const ctx = useContext(FriendsCtx);
  if (!ctx) throw new Error("useFriends must be used inside <GlobalFriendsProvider>");
  return ctx;
}

export function GlobalFriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Foydalanuvchi";

  const friends = useFriendsBroadcast({
    userId: user?.id ?? null,
    displayName,
    enabled: !!user,
  });

  const navigate = useNavigate();

  // Toast new friend requests
  useEffect(() => {
    if (friends.incomingRequests.length === 0) return;
    const latest = friends.incomingRequests[friends.incomingRequests.length - 1];
    toast(uz.friendRequestReceived(latest.fromName), {
      action: {
        label: uz.accept,
        onClick: () => friends.acceptFriend(latest.from),
      },
      cancel: {
        label: uz.decline,
        onClick: () => friends.declineFriend(latest.from),
      },
      duration: 10000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.incomingRequests.length]);

  // Persistent invite popups
  useEffect(() => {
    if (friends.incomingInvites.length === 0) return;
    const latest = friends.incomingInvites[friends.incomingInvites.length - 1];
    const id = `invite-${latest.from}-${latest.roomId}`;
    toast(uz.inviteReceived(latest.fromName, latest.roomName), {
      id,
      duration: Infinity,
      action: {
        label: uz.accept,
        onClick: () => {
          friends.dismissInvite(latest.from, latest.roomId);
          navigate({ to: "/room/$roomId", params: { roomId: latest.roomId } });
          toast.dismiss(id);
        },
      },
      cancel: {
        label: uz.decline,
        onClick: () => {
          friends.dismissInvite(latest.from, latest.roomId);
          toast.dismiss(id);
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.incomingInvites.length]);

  return (
    <FriendsCtx.Provider value={friends}>
      <JoinRequestListener />
      {children}
    </FriendsCtx.Provider>
  );
}
