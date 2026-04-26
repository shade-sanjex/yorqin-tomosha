import { useState } from "react";
import { useFriends } from "@/components/GlobalFriendsProvider";
import { useFriendProfiles } from "@/hooks/useFriendProfiles";
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
  const { friends, sendInvite } = useFriends();
  const profiles = useFriendProfiles(friends);
  const [open, setOpen] = useState(false);

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
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{uz.noFriends}</p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {friends.map((fid) => {
              const name = profiles[fid]?.display_name ?? "Foydalanuvchi";
              return (
                <li key={fid} className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
                  <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold">
                    {name[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm truncate">{name}</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      sendInvite(fid, roomId, roomName);
                      toast.success(uz.inviteSent(name));
                    }}
                  >
                    <Send className="size-3.5 mr-1" /> {uz.invite}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
