import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMOB_API_KEY         = Deno.env.get("PAYMOB_API_KEY")!;
const CARD_INTEGRATION_ID    = Number(Deno.env.get("PAYMOB_CARD_INTEGRATION_ID"));
const WALLET_INTEGRATION_ID  = Number(Deno.env.get("PAYMOB_WALLET_INTEGRATION_ID"));
const PAYMOB_IFRAME_ID       = Deno.env.get("PAYMOB_IFRAME_ID") ?? "";

const PACKAGES: Record<string, { coins: number; amount_cents: number }> = {
  pkg_100:  { coins: 100,  amount_cents: 1000  }, // 10 جنيه
  pkg_500:  { coins: 500,  amount_cents: 4500  }, // 45 جنيه
  pkg_1000: { coins: 1000, amount_cents: 8000  }, // 80 جنيه
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { packageId, paymentMethod, phone } = await req.json();

    const pkg = PACKAGES[packageId];
    if (!pkg) {
      return new Response(JSON.stringify({ error: "باقة غير صحيحة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Authentication ──────────────────────────────────────────
    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    const authData = await authRes.json();
    const token = authData.token;
    if (!token) throw new Error("فشل في المصادقة مع Paymob");

    // ── 2. Order Registration ──────────────────────────────────────
    const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: pkg.amount_cents,
        currency: "EGP",
        items: [{
          name: `${pkg.coins} كوينز`,
          amount_cents: pkg.amount_cents,
          description: `شحن ${pkg.coins} كوينز`,
          quantity: 1,
        }],
        merchant_order_id: `${user.id}_${packageId}_${Date.now()}`,
      }),
    });
    const orderData = await orderRes.json();
    const orderId = orderData.id;
    if (!orderId) throw new Error("فشل في إنشاء الطلب");

    // ── 3. Payment Key ─────────────────────────────────────────────
    const integrationId = paymentMethod === "wallet"
      ? WALLET_INTEGRATION_ID
      : CARD_INTEGRATION_ID;

    const payKeyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: pkg.amount_cents,
        expiration: 3600,
        order_id: orderId,
        billing_data: {
          apartment:     "NA",
          email:         "customer@example.com",
          floor:         "NA",
          first_name:    "Customer",
          street:        "NA",
          building:      "NA",
          phone_number:  phone || "+201000000000",
          shipping_method: "NA",
          postal_code:   "NA",
          city:          "Cairo",
          country:       "EG",
          last_name:     "NA",
          state:         "NA",
        },
        currency:        "EGP",
        integration_id:  integrationId,
        lock_order_when_paid: true,
      }),
    });
    const payKeyData = await payKeyRes.json();
    const paymentKey = payKeyData.token;
    if (!paymentKey) throw new Error("فشل في الحصول على مفتاح الدفع");

    // ── 4. Return response based on payment method ─────────────────
    if (paymentMethod === "wallet") {
      // Wallet: redirect to Paymob wallet page
      const walletRes = await fetch("https://accept.paymob.com/api/acceptance/payments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { identifier: phone, subtype: "WALLET" },
          payment_token: paymentKey,
        }),
      });
      const walletData = await walletRes.json();

      return new Response(JSON.stringify({
        type: "wallet",
        redirect_url: walletData.redirect_url,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // Card: return iframe URL
      return new Response(JSON.stringify({
        type: "card",
        iframe_url: `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err) {
    console.error("Payment error:", err);
    return new Response(JSON.stringify({ error: "حدث خطأ أثناء إنشاء عملية الدفع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});