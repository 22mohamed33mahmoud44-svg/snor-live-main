import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET")!;

async function processPayment(supabase: any, transactionId: string, orderId: string) {
  const { error: dupErr } = await supabase
    .from("paymob_events")
    .insert({ transaction_id: transactionId, status: "success" });
  if (dupErr?.code === "23505") return "already_processed";

  const { data: pendingOrder } = await supabase
    .from("pending_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!pendingOrder) {
    console.error("Order not found:", orderId);
    return "order_not_found";
  }

  await supabase.rpc("add_coins", {
    p_user_id: pendingOrder.user_id,
    p_amount:  pendingOrder.coins,
    p_meta:    { paymob_transaction_id: transactionId },
  });

  await supabase.from("pending_orders").delete().eq("order_id", orderId);
  return "success";
}

serve(async (req) => {
  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    const success       = url.searchParams.get("success");
    const pending       = url.searchParams.get("pending");
    const transactionId = url.searchParams.get("id") ?? "";
    const orderId       = url.searchParams.get("order") ?? "";

    if (success !== "true" && pending !== "false") {
      return new Response("not successful", { status: 200 });
    }

    const result = await processPayment(supabase, transactionId, orderId);
    return new Response(JSON.stringify({ result }), { status: 200 });
  }

  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch { return new Response("ok", { status: 200 }); }

    const obj = body.obj ?? {};
    if (obj.success !== true) return new Response(JSON.stringify({ received: true }), { status: 200 });

    const result = await processPayment(supabase, String(obj.id), String(obj.order?.id ?? ""));
    return new Response(JSON.stringify({ received: true, result }), { status: 200 });
  }

  return new Response("ok", { status: 200 });
});