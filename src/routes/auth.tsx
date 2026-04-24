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
import { Film, Loader2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Mode = "tabs" | "forgot-email" | "forgot-otp";

function PasswordInput(props: {
  id: string;
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? uz.hidePassword : uz.showPassword}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("tabs");
  const [forgotEmail, setForgotEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetPass, setResetPass] = useState("");

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

  const onSendCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail);
    setSubmitting(false);
    if (error) {
      toast.error(uz.authError);
      return;
    }
    toast.success(uz.codeSent);
    setMode("forgot-otp");
  };

  const onVerifyAndUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error(uz.invalidOtp);
      return;
    }
    if (resetPass.length < 6) {
      toast.error(uz.weakPassword);
      return;
    }
    setSubmitting(true);
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: forgotEmail,
      token: otp,
      type: "recovery",
    });
    if (verifyErr) {
      setSubmitting(false);
      toast.error(uz.invalidOtp);
      return;
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: resetPass });
    setSubmitting(false);
    if (updErr) {
      toast.error(uz.authError);
      return;
    }
    toast.success(uz.passwordUpdated);
    // Sign out so user logs in with new password
    await supabase.auth.signOut();
    setMode("tabs");
    setForgotEmail("");
    setOtp("");
    setResetPass("");
  };

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-background text-foreground">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <Film className="size-6 text-primary" />
          <span className="font-bold text-lg">Birga Tomosha</span>
        </Link>
        <div className="rounded-2xl border bg-surface p-6 shadow-2xl">
          {mode === "tabs" && (
            <>
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
                      <PasswordInput id="si-pass" name="password" required autoComplete="current-password" />
                    </div>
                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.signIn}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setMode("forgot-email")}
                      className="text-xs text-primary hover:underline w-full text-center"
                    >
                      {uz.forgotPassword}
                    </button>
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
                      <PasswordInput id="su-pass" name="password" required minLength={6} autoComplete="new-password" />
                    </div>
                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.signUp}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}

          {mode === "forgot-email" && (
            <form onSubmit={onSendCode} className="space-y-4">
              <h2 className="font-semibold text-lg">{uz.forgotPassword}</h2>
              <div className="space-y-2">
                <Label htmlFor="fp-email">{uz.email}</Label>
                <Input
                  id="fp-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.sendCode}
              </Button>
              <button
                type="button"
                onClick={() => setMode("tabs")}
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
              >
                {uz.backToSignIn}
              </button>
            </form>
          )}

          {mode === "forgot-otp" && (
            <form onSubmit={onVerifyAndUpdate} className="space-y-4">
              <h2 className="font-semibold text-lg">{uz.updatePassword}</h2>
              <p className="text-xs text-muted-foreground">{forgotEmail}</p>
              <div className="space-y-2">
                <Label htmlFor="otp">{uz.otpCode}</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="tracking-[0.5em] text-center font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np">{uz.newPassword}</Label>
                <PasswordInput
                  id="np"
                  name="newpass"
                  required
                  minLength={6}
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : uz.updatePassword}
              </Button>
              <button
                type="button"
                onClick={() => setMode("tabs")}
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
              >
                {uz.backToSignIn}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
