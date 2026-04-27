import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseLiveKitTokenArgs {
  roomId: string;
  displayName: string;
  enabled: boolean;
}

interface TokenResult {
  token: string | null;
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function useLiveKitToken({ roomId, displayName, enabled }: UseLiveKitTokenArgs): TokenResult {
  const [state, setState] = useState<TokenResult>({
    token: null,
    url: null,
    loading: enabled,
    error: null,
  });
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !roomId) return;
    const key = `${roomId}::${displayName}`;
    if (key === lastKeyRef.current && state.token) return;
    lastKeyRef.current = key;

    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { roomId, displayName },
      });
      if (cancelled) return;
      if (error || !data?.token) {
        console.error("[LiveKit] token request failed", error);
        setState({ token: null, url: null, loading: false, error: error?.message ?? "Token olinmadi" });
        return;
      }
      setState({ token: data.token, url: data.url, loading: false, error: null });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName, enabled]);

  return state;
}
