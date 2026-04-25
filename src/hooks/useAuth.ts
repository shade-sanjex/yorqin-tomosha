import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when supabase fired PASSWORD_RECOVERY (user came from reset email) */
  recoveryMode: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    recoveryMode: false,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth]", event);
      setState((prev) => ({
        session,
        user: session?.user ?? null,
        loading: false,
        recoveryMode:
          event === "PASSWORD_RECOVERY" ? true : prev.recoveryMode,
      }));
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        session,
        user: session?.user ?? null,
        loading: false,
        recoveryMode: prev.recoveryMode,
      }));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
