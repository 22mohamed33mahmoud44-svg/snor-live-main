import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYMOB_API_KEY = Deno.env.get("PAYMOB_API_KEY")!;
const PAYMOB_CARD_INTEGRATION_ID = Deno.env.get("PAYMOB_CARD_INTEGRATION_ID")!;
const PAYMOB_WALLET_INTEGRATION_ID = Deno.env.get("PAYMOB_WALLET_INTEGRATION_ID")!;
const PAYMOB_IFRAME_ID = Deno.env.get("PAYMOB_IFRAME_ID") ?? "";

const PACKAGES = [
  { id: "pkg_100", coins: 100, amount: 1000 },
  { id: "pkg_500", coins: 500, amount: 4500 },
  { id: "pkg_1000", coins: 1000, amount: 8000 },
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { packageId, paymentMethod, phone } = await req.json();
    const pkg = PACKAGES.find(p => p.id === packageId);
    if (!pkg) return new Response(JSON.stringify({ error: "Invalid package" }), { status: 400, headers: corsHeaders });

    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    const { token } = await authRes.json();

    const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: pkg.amount,
        currency: "EGP",
        items: [{ name: `${pkg.coins} Coins`, amount_cents: pkg.amount, description: "Snor Live Coins", quantity: 1 }],
        merchant_order_id: `${user.id}_${pkg.id}_${Date.now()}`,
      }),
    });
    const order = await orderRes.json();

    const firstName = user.user_metadata?.full_name?.split(" ")[0] ?? "User";
    const lastName = user.user_metadata?.full_name?.split(" ")[1] ?? "User";

    const paymentKeyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: pkg.amount,
        expiration: 3600,
        order_id: order.id,
        billing_data: {
          email: user.email ?? "user@example.com",
          first_name: firstName,
          last_name: lastName,
          phone_number: (phone && phone.trim()) ? phone.trim() : "01000000000",
          apartment: "N/A", floor: "N/A", street: "N/A",
          building: "N/A", shipping_method: "N/A",
          postal_code: "N/A", city: "Cairo", country: "EG", state: "Cairo",
        },
        currency: "EGP",
        integration_id: paymentMethod === "wallet"
          ? Number(PAYMOB_WALLET_INTEGRATION_ID)
          : Number(PAYMOB_CARD_INTEGRATION_ID),
        lock_order_when_paid: false,
      }),
    });
    const { token: paymentToken } = await paymentKeyRes.json();

    await supabase.from("coin_transactions").insert({
      user_id: user.id,
      amount: pkg.coins,
      type: "purchase",
      status: "pending",
      metadata: { paymob_order_id: order.id, package_id: pkg.id, payment_method: paymentMethod },
    });

    if (paymentMethod === "wallet") {
      const walletRes = await fetch("https://accept.paymob.com/api/acceptance/payments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { identifier: phone, subtype: "WALLET" },
          payment_token: paymentToken,
        }),
      });
      const walletData = await walletRes.json();
      return new Response(JSON.stringify({ redirect_url: walletData.redirect_url, type: "wallet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
      return new Response(JSON.stringify({ iframe_url: iframeUrl, type: "card" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});