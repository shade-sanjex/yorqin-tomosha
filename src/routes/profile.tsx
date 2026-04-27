import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { uz } from "@/lib/uz";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setAvatarUrl(data.avatar_url ?? null);
        }
      });
  }, [user]);

  const onAvatarPick = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Iltimos, rasm faylini tanlang");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      console.error("[Profile] upload failed", upErr);
      setUploading(false);
      toast.error(uz.profileError);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(pub.publicUrl);
    setUploading(false);
    toast.success("Rasm yuklandi — saqlashni unutmang");
  };

  const onSave = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (name.length < 2) {
      toast.error("Ism kamida 2 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, avatar_url: avatarUrl })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      console.error("[Profile] save failed", error);
      toast.error(uz.profileError);
      return;
    }
    // Mirror to auth metadata so LiveKit name + presence pick it up immediately
    await supabase.auth.updateUser({ data: { display_name: name, avatar_url: avatarUrl } });
    toast.success(uz.profileUpdated);
    navigate({ to: "/dashboard" });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const initial = (displayName[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/dashboard">
            <Button size="sm" variant="ghost"><ArrowLeft className="size-4" /></Button>
          </Link>
          <h1 className="font-bold text-lg">{uz.myProfile}</h1>
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div className="rounded-xl border bg-surface p-6 flex flex-col items-center gap-4">
          <Avatar className="size-24">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAvatarPick(f);
              e.currentTarget.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Upload className="size-4 mr-1.5" />}
            {uz.uploadAvatar}
          </Button>
        </div>

        <div className="rounded-xl border bg-surface p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{uz.nickname}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={uz.nickname}
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{uz.email}</label>
            <Input value={user.email ?? ""} disabled />
          </div>
          <Button onClick={onSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Save className="size-4 mr-1.5" />}
            {uz.saveProfile}
          </Button>
        </div>
      </section>
    </main>
  );
}
