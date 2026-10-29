import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const COIN_PACKAGES: Record<string, number> = {
  pkg_100: 100,
  pkg_500: 500,
  pkg_1000: 1000,
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

  const userId = session.metadata?.user_id;
  const packageId = session.metadata?.package_id;
  const coinsToAdd = packageId ? COIN_PACKAGES[packageId] : undefined;

  if (!userId || !coinsToAdd) {
    return new Response("Bad checkout metadata", { status: 400 });
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
      p_user_id: userId,
      p_coins: coinsToAdd,
      p_session_id: session.id,
      p_package_id: packageId,
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
