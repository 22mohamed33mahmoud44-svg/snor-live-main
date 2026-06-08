import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const { price_id, user_id } = await req.json();

  if (!price_id || !user_id) {
    return new Response("Missing fields", { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: price_id, quantity: 1 }],
    metadata: { user_id, price_id },
    success_url: `${Deno.env.get("APP_URL")}/coins?success=true`,
    cancel_url:  `${Deno.env.get("APP_URL")}/coins?cancelled=true`,
  });

  return new Response(
    JSON.stringify({ session_id: session.id }),
    { headers: { "Content-Type": "application/json" } }
  );
});