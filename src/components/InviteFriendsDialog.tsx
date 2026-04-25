import { useState } from "react";
import { useFriends } from "@/components/GlobalFriendsProvider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, Send } from "lucide-react";
import { uz } from "@/lib/uz";
import { toast } from "sonner";

interface InviteFriendsDialogProps {
  roomId: string;
  roomName: string;
}

export function InviteFriendsDialog({ roomId, roomName }: InviteFriendsDialogProps) {
  const { friends, onlineUsers, sendInvite } = useFriends();
  const [open, setOpen] = useState(false);

  const onlineFriends = friends
    .map((id) => onlineUsers[id])
    .filter((u): u is { userId: string; displayName: string } => !!u);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="size-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{uz.inviteFriend}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{uz.inviteFriends}</DialogTitle>
          <DialogDescription>{roomName}</DialogDescription>
        </DialogHeader>
        {onlineFriends.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {friends.length === 0 ? uz.noFriends : uz.noOnlineFriends}
          </p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {onlineFriends.map((f) => (
              <li key={f.userId} className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
                <div className="relative">
                  <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold">
                    {f.displayName[0]?.toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface-2 bg-success" />
                </div>
                <span className="flex-1 text-sm truncate">{f.displayName}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    sendInvite(f.userId, roomId, roomName);
                    toast.success(uz.inviteSent(f.displayName));
                  }}
                >
                  <Send className="size-3.5 mr-1" /> {uz.invite}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
