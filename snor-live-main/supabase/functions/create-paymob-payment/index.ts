import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────────
// ⚠️  P1: بدل * استخدم دومين موقعك الحقيقي
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Env vars ──────────────────────────────────────────────────────
const PAYMOB_API_KEY              = Deno.env.get("PAYMOB_API_KEY")!;
const PAYMOB_CARD_INTEGRATION_ID  = Deno.env.get("PAYMOB_CARD_INTEGRATION_ID")!;
const PAYMOB_WALLET_INTEGRATION_ID= Deno.env.get("PAYMOB_WALLET_INTEGRATION_ID")!;
const PAYMOB_IFRAME_ID            = Deno.env.get("PAYMOB_IFRAME_ID") ?? "";

// ── Packages ──────────────────────────────────────────────────────
const PACKAGES = [
  { id: "pkg_100",  coins: 100,  amount: 1000 },
  { id: "pkg_500",  coins: 500,  amount: 4500 },
  { id: "pkg_1000", coins: 1000, amount: 8000 },
];

// ── merchant_order_id helpers ─────────────────────────────────────
//
//  FORMAT:  <uuid>|<packageId>|<timestamp>
//  مثال:    550e8400-e29b-41d4-a716-446655440000|pkg_100|1718000000000
//
//  ليه "|"؟
//    - UUID  يحتوي على "-"  فقط
//    - pkgId يحتوي على "_"  فقط
//    - timestamp أرقام فقط
//    - "|" مش موجود في أي منهم → delimiter آمن 100%
//
function buildMerchantOrderId(userId: string, pkgId: string): string {
  return `${userId}|${pkgId}|${Date.now()}`;
}

// ── Main handler ──────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ── Validate input ──
    const { packageId, paymentMethod, phone } = await req.json();

    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return new Response(
        JSON.stringify({ error: "Invalid package" }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (paymentMethod === "wallet" && !phone) {
      return new Response(
        JSON.stringify({ error: "Phone required for wallet payment" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ── Step 1: Paymob auth token ──
    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
    });
    const authData = await authRes.json();
    const token: string = authData.token;

    if (!token) {
      console.error("Paymob auth failed:", authData);
      throw new Error("Failed to get Paymob auth token");
    }

    // ── Step 2: Create order ──
    //  ✅ الإصلاح هنا — merchant_order_id بـ "|" delimiter آمن
    const merchantOrderId = buildMerchantOrderId(user.id, pkg.id);

    const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: pkg.amount,
        currency: "EGP",
        merchant_order_id: merchantOrderId,   // ✅ الإصلاح
        items: [{
          name: `${pkg.coins} Coins - Snor Live`,
          amount_cents: pkg.amount,
          description: `Snor Live ${pkg.coins} coins package`,
          quantity: 1,
        }],
      }),
    });
    const order = await orderRes.json();

    if (!order.id) {
      console.error("Paymob order creation failed:", order);
      throw new Error("Failed to create Paymob order");
    }

    // ── Step 3: Payment key ──
    const firstName = user.user_metadata?.full_name?.split(" ")[0] ?? "User";
    const lastName  = user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "User";

    const paymentKeyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: pkg.amount,
        expiration: 3600,
        order_id: order.id,
        billing_data: {
          email:           user.email ?? "user@example.com",
          first_name:      firstName,
          last_name:       lastName,
          phone_number:    phone ?? "01000000000",
          apartment:       "N/A",
          floor:           "N/A",
          street:          "N/A",
          building:        "N/A",
          shipping_method: "N/A",
          postal_code:     "N/A",
          city:            "Cairo",
          country:         "EG",
          state:           "Cairo",
        },
        currency:        "EGP",
        integration_id:  paymentMethod === "wallet"
          ? Number(PAYMOB_WALLET_INTEGRATION_ID)
          : Number(PAYMOB_CARD_INTEGRATION_ID),
        lock_order_when_paid: true,   // ✅ منع الدفع مرتين
      }),
    });
    const paymentKeyData = await paymentKeyRes.json();
    const paymentToken: string = paymentKeyData.token;

    if (!paymentToken) {
      console.error("Paymob payment key failed:", paymentKeyData);
      throw new Error("Failed to get payment token");
    }

    // ── Step 4: سجّل العملية كـ pending ──
    const { error: txErr } = await supabase
      .from("coin_transactions")
      .insert({
        user_id:  user.id,
        amount:   pkg.coins,
        type:     "purchase",
        status:   "pending",
        meta: {
          paymob_order_id:     order.id,
          merchant_order_id:   merchantOrderId,
          package_id:          pkg.id,
          payment_method:      paymentMethod,
        },
      });

    if (txErr) {
      // مش fatal — الـ webhook هيكمل حتى لو التسجيل فشل
      console.warn("coin_transactions insert warning:", txErr.message);
    }

    // ── Step 5: رد حسب طريقة الدفع ──
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

      if (!walletData.redirect_url) {
        console.error("Wallet payment failed:", walletData);
        throw new Error("Failed to initiate wallet payment");
      }

      return new Response(
        JSON.stringify({ redirect_url: walletData.redirect_url, type: "wallet" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
      return new Response(
        JSON.stringify({ iframe_url: iframeUrl, type: "card" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

  } catch (err) {
    console.error("create-paymob-payment error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});