import { useAuth } from "@/hooks/useAuth";

const SUPER_ADMIN_EMAIL = "gulimmatovsanjarbekk@gmail.com";

/**
 * Returns true if the currently authenticated user has Super Admin
 * privileges. Decision is made purely from the verified Supabase session
 * email — never from localStorage or hardcoded passwords.
 */
export function useSuperAdmin(): boolean {
  const { user } = useAuth();
  return !!user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
}
