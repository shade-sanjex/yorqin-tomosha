import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FriendProfile {
  display_name: string;
  avatar_url: string | null;
}

const cache = new Map<string, FriendProfile>();

export function useFriendProfiles(ids: string[]) {
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>(() => {
    const init: Record<string, FriendProfile> = {};
    ids.forEach((id) => {
      const c = cache.get(id);
      if (c) init[id] = c;
    });
    return init;
  });

  const key = ids.slice().sort().join(",");

  useEffect(() => {
    if (ids.length === 0) {
      setProfiles({});
      return;
    }
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) {
      const next: Record<string, FriendProfile> = {};
      ids.forEach((id) => {
        const c = cache.get(id);
        if (c) next[id] = c;
      });
      setProfiles(next);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", missing);
      if (cancelled) return;
      if (error) {
        console.warn("[Friends] profiles fetch failed", error);
        return;
      }
      (data ?? []).forEach((row) => {
        cache.set(row.id, {
          display_name: row.display_name ?? "Foydalanuvchi",
          avatar_url: row.avatar_url ?? null,
        });
      });
      const next: Record<string, FriendProfile> = {};
      ids.forEach((id) => {
        const c = cache.get(id);
        if (c) next[id] = c;
      });
      setProfiles(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profiles;
}
