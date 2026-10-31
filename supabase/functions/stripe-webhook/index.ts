import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validatePaidCoinCheckout } from "./checkout-credit-validation.mjs";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Must match the same server-side Stripe Price IDs used by create-checkout.
// A valid Stripe signature alone does not prove the purchased price.
const PRICE_IDS: Record<string, string | undefined> = {
  pkg_100: Deno.env.get("STRIPE_PRICE_100_COINS"),
  pkg_500: Deno.env.get("STRIPE_PRICE_500_COINS"),
  pkg_1000: Deno.env.get("STRIPE_PRICE_1000_COINS"),
};

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return new Response("Webhook not configured", { status: 500 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true, result: "not_paid" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Webhook event payloads do not include the full purchased line items.
  // Fetch Stripe's authoritative order line before doing any wallet credit.
  // A temporary Stripe outage returns 500 so Stripe will retry the event.
  let lineItems: Stripe.ApiList<Stripe.LineItem>;
  try {
    lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  } catch (error) {
    console.error("Could not verify Stripe Checkout line items", session.id, error);
    return new Response("Payment verification unavailable", { status: 500 });
  }

  const order = validatePaidCoinCheckout(session, lineItems, PRICE_IDS);
  if (!order) {
    // Never acknowledge a paid but unverified order as fulfilled.
    // This is a release/price configuration problem requiring investigation.
    console.error("Paid Stripe checkout failed package/price verification", session.id);
    return new Response("Payment requires verification", { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Single database transaction: deduplication and wallet credit succeed or fail together.
  const { data: credited, error: creditError } = await supabase.rpc(
    "credit_stripe_checkout_event",
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_user_id: order.userId,
      p_coins: order.coins,
      p_session_id: order.sessionId,
      p_package_id: order.packageId,
    },
  );

  if (creditError) {
    console.error("credit_stripe_checkout_event failed", creditError);
    return new Response("Failed to credit coins", { status: 500 });
  }

  if (!credited) {
    return new Response("Already processed", { status: 200 });
  }

  return new Response(JSON.stringify({ received: true, result: "success" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
