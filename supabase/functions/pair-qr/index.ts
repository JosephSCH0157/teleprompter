import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import QRCode from "https://esm.sh/qrcode@1.5.4";

type ReqBody = {
  baseUrl?: string;
  pairPath?: string;
  metadata?: Record<string, unknown>;
  ttlMinutes?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function randomToken(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  const b64 = btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return b64;
}

async function getUserIdFromJwt(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return null;
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    return typeof json?.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in Supabase Function env vars)",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: ReqBody = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const baseUrl =
    (body.baseUrl || "").trim() ||
      new URL(req.url).searchParams.get("baseUrl") ||
      "";
  const pairPath = (body.pairPath || "/pair").trim() || "/pair";
  const ttlMinutes = Number(body.ttlMinutes ?? 10);
  const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10;

  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: "baseUrl is required (e.g. https://podcastersforge.com)" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const token = randomToken(18);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 60_000).toISOString();

  const createdBy = await getUserIdFromJwt(req);
  const metadata = body.metadata ?? {};

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/display_pair_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify([{
      token,
      expires_at: expiresAt,
      created_by: createdBy,
      metadata,
    }]),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    return new Response(
      JSON.stringify({ error: "Failed to create pairing session", detail: errText }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const pairUrl = new URL(pairPath, baseUrl);
  pairUrl.searchParams.set("t", token);

  const qrSvg = await QRCode.toString(pairUrl.toString(), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    width: 320,
  });

  return new Response(
    JSON.stringify({
      token,
      expiresAt,
      pairUrl: pairUrl.toString(),
      qrSvg,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
