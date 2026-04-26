import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFriends } from "@/components/GlobalFriendsProvider";
import { useFriendProfiles } from "@/hooks/useFriendProfiles";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, UserPlus, Check, X, Loader2 } from "lucide-react";
import { uz } from "@/lib/uz";
import { toast } from "sonner";

interface SearchResult {
  id: string;
  display_name: string;
}

export function FriendsModal() {
  const { user } = useAuth();
  const { friends, incomingRequests, sendFriendRequest, acceptFriend, declineFriend, removeFriend } = useFriends();
  const profiles = useFriendProfiles(friends);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async () => {
    const q = query.trim();
    if (q.length < 2 || !user) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", `%${q}%`)
      .limit(20);
    setSearching(false);
    setResults((data ?? []).filter((r) => r.id !== user.id));
  };

  const send = (toId: string, name: string) => {
    if (friends.includes(toId)) {
      toast.info(uz.alreadyFriends);
      return;
    }
    if (!onlineUsers[toId]) {
      toast.warning(uz.userNotOnline);
      // Still send — will be received when they connect later in same session
    }
    sendFriendRequest(toId);
    toast.success(`${name}: ${uz.friendRequestSent}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="size-4 mr-1.5" />
          {uz.friends}
          {incomingRequests.length > 0 && (
            <span className="ml-1.5 size-5 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center font-bold">
              {incomingRequests.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{uz.friends}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="my">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="my">{uz.myFriends}</TabsTrigger>
            <TabsTrigger value="requests">
              {uz.incomingRequests}
              {incomingRequests.length > 0 && (
                <span className="ml-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center">
                  {incomingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="add">{uz.addFriend}</TabsTrigger>
          </TabsList>

          <TabsContent value="my" className="mt-3">
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{uz.noFriends}</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {friends.map((fid) => {
                  const isOnline = !!onlineUsers[fid];
                  const name = onlineUsers[fid]?.displayName ?? fid.slice(0, 8);
                  return (
                    <li key={fid} className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
                      <div className="relative">
                        <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold">
                          {name[0]?.toUpperCase()}
                        </div>
                        <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface-2 ${isOnline ? "bg-success" : "bg-muted-foreground"}`} />
                      </div>
                      <span className="flex-1 text-sm truncate">{name}</span>
                      <span className="text-[10px] text-muted-foreground">{isOnline ? uz.online : uz.offline}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeFriend(fid)} aria-label={uz.delete}>
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-3">
            {incomingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{uz.noRequests}</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {incomingRequests.map((r) => (
                  <li key={r.from} className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
                    <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold">
                      {r.fromName[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm truncate">{r.fromName}</span>
                    <Button size="sm" onClick={() => { acceptFriend(r.from); toast.success(uz.friendAdded(r.fromName)); }}>
                      <Check className="size-3.5 mr-1" /> {uz.accept}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => declineFriend(r.from)}>
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="add" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={uz.searchUserPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
              <Button onClick={doSearch} disabled={searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </Button>
            </div>
            {results.length === 0 && query.trim().length >= 2 && !searching && (
              <p className="text-xs text-muted-foreground text-center py-4">{uz.noResults}</p>
            )}
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
                  <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold">
                    {r.display_name[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm truncate">{r.display_name}</span>
                  <Button size="sm" onClick={() => send(r.id, r.display_name)} disabled={friends.includes(r.id)}>
                    <UserPlus className="size-3.5 mr-1" />
                    {friends.includes(r.id) ? uz.alreadyFriends : uz.sendFriendRequest}
                  </Button>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
