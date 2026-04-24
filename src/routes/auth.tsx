import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uz } from "@/lib/uz";
import { toast } from "sonner";
import { Film, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const onSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("Invalid") ? uz.invalidCreds : uz.authError);
    }
  };

  const onSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const display_name = String(fd.get("display_name"));
    if (password.length < 6) {
      toast.error(uz.weakPassword);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { display_name },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("already") ? uz.emailExists : error.message);
    } else {
      toast.success("Tasdiqlovchi xat yuborildi (yoki darhol kiring)");
    }
  };

  const onGoogle = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setSubmitting(false);
        toast.error(uz.googleSignInError);
        return;
      }
      // Some browsers/environments don't auto-redirect — force it.
      if (data?.url) {
        window.location.assign(data.url);
      }
    } catch {
      setSubmitting(false);
      toast.error(uz.googleSignInError);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-background text-foreground">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <Film className="size-6 text-primary" />
          <span className="font-bold text-lg">Birga Tomosha</span>
        </Link>
        <div className="rounded-2xl border bg-surface p-6 shadow-2xl">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">{uz.signIn}</TabsTrigger>
              <TabsTrigger value="signup">{uz.signUp}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">{uz.email}</Label>
                  <Input id="si-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pass">{uz.password}</Label>
                  <Input id="si-pass" name="password" type="password" required autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.signIn}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">{uz.displayName}</Label>
                  <Input id="su-name" name="display_name" required minLength={2} maxLength={40} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">{uz.email}</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pass">{uz.password}</Label>
                  <Input id="su-pass" name="password" type="password" required minLength={6} autoComplete="new-password" />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.signUp}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs text-muted-foreground">yoki</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <Button variant="outline" disabled={submitting} onClick={onGoogle} className="w-full">
            <svg viewBox="0 0 24 24" className="size-4 mr-2" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A10.98 10.98 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            {uz.google}
          </Button>
        </div>
      </div>
    </main>
  );
}
