import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/uz";
import { toast } from "sonner";
import { Film, Plus, LogOut, Trash2, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ServerMediaManager } from "@/components/ServerMediaManager";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

interface Room {
  id: string;
  name: string;
  created_at: string;
  host_id: string;
}

function Dashboard() {
  const { user, loading } = useAuth();
  const isSuperAdmin = useSuperAdmin();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("rooms")
      .select("id, name, created_at, host_id")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRooms(data ?? []));
  }, [user]);

  const createRoom = async () => {
    if (!user) return;
    const name = newName.trim() || "Yangi xona";
    setCreating(true);
    const { data, error } = await supabase
      .from("rooms")
      .insert({ host_id: user.id, name })
      .select("id, name, created_at, host_id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(uz.unknownError);
      return;
    }
    setNewName("");
    setRooms((r) => [data, ...r]);
    navigate({ to: "/room/$roomId", params: { roomId: data.id } });
  };

  const deleteRoom = async (id: string) => {
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      toast.error(uz.unknownError);
      return;
    }
    setRooms((r) => r.filter((x) => x.id !== id));
    setDeletingId(null);
    toast.success("Xona o'chirildi");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Film className="size-5 text-primary" />
            <span className="font-bold">Birga Tomosha</span>
          </Link>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-primary/15 text-primary">
                <ShieldAlert className="size-3" />
                {uz.superAdmin}
              </span>
            )}
            {isSuperAdmin && <ServerMediaManager />}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4 mr-1.5" /> {uz.signOut}
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">{uz.myRooms}</h1>

        <div className="rounded-xl border bg-surface p-4 mb-8 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder={uz.roomName}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
          />
          <Button onClick={createRoom} disabled={creating} className="shrink-0">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1.5" />{uz.createRoom}</>}
          </Button>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-xl border bg-surface p-12 text-center text-muted-foreground">
            {uz.noRooms}
          </div>
        ) : (
          <ul className="grid gap-3">
            {rooms.map((r) => (
              <li key={r.id} className="rounded-xl border bg-surface p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("uz-UZ")}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link to="/room/$roomId" params={{ roomId: r.id }}>
                    <Button size="sm">
                      <ExternalLink className="size-4 mr-1.5" /> {uz.enter}
                    </Button>
                  </Link>
                  <Button size="sm" variant="destructive" onClick={() => setDeletingId(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xonani o'chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu amalni qaytarib bo'lmaydi. Xona va undagi barcha xabarlar o'chiriladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteRoom(deletingId)}
            >
              {uz.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
