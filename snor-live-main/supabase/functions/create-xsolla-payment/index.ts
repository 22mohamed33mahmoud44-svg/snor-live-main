import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XSOLLA_PROJECT_ID  = Deno.env.get("XSOLLA_PROJECT_ID")!;
const XSOLLA_MERCHANT_ID = Deno.env.get("XSOLLA_MERCHANT_ID")!;
const XSOLLA_API_KEY     = Deno.env.get("XSOLLA_API_KEY")!;

const PACKAGES = [
  { id: "pkg_100",  coins: 100,  sku: "coins_100",  amount: 10  },
  { id: "pkg_500",  coins: 500,  sku: "coins_500",  amount: 45  },
  { id: "pkg_1000", coins: 1000, sku: "coins_1000", amount: 80  },
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { packageId } = await req.json();
    const pkg = PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
      return new Response(JSON.stringify({ error: "Invalid package" }), { status: 400, headers: corsHeaders });
    }

    const authHeaderString = btoa(`${XSOLLA_MERCHANT_ID}:${XSOLLA_API_KEY}`);

    // ✅ Xsolla token - بدون purchase items في الـ token
    const xsollaRes = await fetch(
      `https://api.xsolla.com/merchant/v2/merchants/${XSOLLA_MERCHANT_ID}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authHeaderString}`,
        },
        body: JSON.stringify({
          user: {
            id:    { value: user.id },
            email: { value: user.email ?? "user@snorlive.app" },
          },
          settings: {
            project_id: Number(XSOLLA_PROJECT_ID),
            currency:   "EGP",
            language:   "ar",
            mode:       "sandbox",
          },
          custom_parameters: {
            package_id: pkg.id,
            sku:        pkg.sku,
            coins:      pkg.coins,
          },
        }),
      }
    );

    const xsollaData = await xsollaRes.json();
    console.log("Xsolla response:", JSON.stringify(xsollaData));

    if (!xsollaRes.ok || !xsollaData.token) {
      console.error("Xsolla Token Failed:", JSON.stringify(xsollaData));
      throw new Error(xsollaData.message || "Failed to generate Xsolla token");
    }

    const { error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type:    "purchase",
        status:  "pending",
        meta: {
          xsolla_token: xsollaData.token,
          package_id:   pkg.id,
          sku:          pkg.sku,
          coins:        pkg.coins,
          gateway:      "xsolla",
        },
      });

    if (txErr) console.warn("transactions insert warning:", txErr.message);

    return new Response(
      JSON.stringify({ token: xsollaData.token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("create-xsolla-payment error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
