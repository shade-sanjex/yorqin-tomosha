import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileLite {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

const cache = new Map<string, ProfileLite>();

export function useProfiles(userIds: string[]) {
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  useEffect(() => {
    if (userIds.length === 0) return;
    const missing = userIds.filter((id) => !cache.has(id));
    if (missing.length === 0) {
      const m: Record<string, ProfileLite> = {};
      userIds.forEach((id) => { const p = cache.get(id); if (p) m[id] = p; });
      setProfiles(m);
      return;
    }
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", missing)
      .then(({ data }) => {
        if (data) data.forEach((p) => cache.set(p.id, p));
        const m: Record<string, ProfileLite> = {};
        userIds.forEach((id) => { const p = cache.get(id); if (p) m[id] = p; });
        setProfiles(m);
      });
  }, [userIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return profiles;
}
