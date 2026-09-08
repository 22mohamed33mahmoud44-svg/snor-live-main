import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const PRICE_IDS: Record<string, string | undefined> = {
  pkg_100: Deno.env.get("STRIPE_PRICE_100_COINS"),
  pkg_500: Deno.env.get("STRIPE_PRICE_500_COINS"),
  pkg_1000: Deno.env.get("STRIPE_PRICE_1000_COINS"),
};

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { packageId } = await req.json();
    const priceId = PRICE_IDS[packageId];

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Stripe price is not configured for this package" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("APP_URL");
    if (!appUrl) {
      return new Response(JSON.stringify({ error: "APP_URL is not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, package_id: packageId },
      success_url: `${appUrl}/coins?success=true`,
      cancel_url: `${appUrl}/coins?cancelled=true`,
    });

    return new Response(
      JSON.stringify({ session_id: session.id, checkout_url: session.url }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-checkout error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
