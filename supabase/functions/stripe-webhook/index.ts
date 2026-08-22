import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const COIN_PACKAGES: Record<string, number> = {
  price_100coins:  100,
  price_500coins:  500,
  price_1200coins: 1200,
  price_3000coins: 3000,
};

serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Idempotency — منع double processing
    const { error: dupErr } = await supabase
      .from("stripe_events")
      .insert({ stripe_event_id: event.id, type: event.type });

    if (dupErr?.code === "23505") {
      return new Response("Already processed", { status: 200 });
    }

    const userId  = session.metadata?.user_id;
    const priceId = session.metadata?.price_id;
    const coinsToAdd = COIN_PACKAGES[priceId!];

    if (!userId || !coinsToAdd) {
      return new Response("Bad metadata", { status: 400 });
    }

    await supabase.rpc("add_coins", {
      p_user_id: userId,
      p_amount:  coinsToAdd,
      p_meta:    { stripe_session_id: session.id, price_id: priceId },
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});