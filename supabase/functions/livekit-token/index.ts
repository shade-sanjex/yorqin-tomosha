// Supabase Edge Function: mint a LiveKit access token for the authenticated user.
// Called by the client when joining a room. The user's JWT is verified by Supabase
// (verify_jwt = true in supabase/config.toml), so we trust the Authorization header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody {
  roomId?: string;
  displayName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("LIVEKIT_URL");
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");

    if (!url || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "LiveKit sozlamalari topilmadi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Avtorizatsiya talab qilinadi" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userResult, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userResult?.user) {
      return new Response(
        JSON.stringify({ error: "Foydalanuvchi aniqlanmadi" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user = userResult.user;

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const roomId = (body.roomId ?? "").trim();
    const displayName = (body.displayName ?? "Mehmon").trim().slice(0, 60);
    if (!roomId) {
      return new Response(
        JSON.stringify({ error: "roomId kerak" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
      ttl: "2h",
    });
    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    console.log("[LiveKit] token issued", { user: user.id, room: roomId });

    return new Response(
      JSON.stringify({ token, url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[LiveKit] token error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Noma'lum xatolik" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
