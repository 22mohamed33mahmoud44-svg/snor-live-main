import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET")!;

const PACKAGES: Record<string, number> = {
  pkg_100:  100,
  pkg_500:  500,
  pkg_1000: 1000,
};

async function verifyHmac(data: Record<string, string>, receivedHmac: string): Promise<boolean> {
  const keys = [
    "amount_cents", "created_at", "currency", "error_occured",
    "has_parent_transaction", "id", "integration_id", "is_3d_secure",
    "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
    "is_voided", "order", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type",
    "success",
  ];
  const concatenated = keys.map(k => data[k] ?? "").join("");
  const encoder = new TextEncoder();
  const keyData = encoder.encode(HMAC_SECRET);
  const msgData = encoder.encode(concatenated);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const computed = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return computed.toLowerCase() === receivedHmac.toLowerCase();
}

serve(async (req) => {
  try {
    const body = await req.json();
    const url  = new URL(req.url);
    const hmac = url.searchParams.get("hmac") ?? "";
    const obj  = body.obj ?? {};

    const flatData: Record<string, string> = {
      amount_cents:           String(obj.amount_cents ?? ""),
      created_at:             String(obj.created_at ?? ""),
      currency:               String(obj.currency ?? ""),
      error_occured:          String(obj.error_occured ?? ""),
      has_parent_transaction: String(obj.has_parent_transaction ?? ""),
      id:                     String(obj.id ?? ""),
      integration_id:         String(obj.integration_id ?? ""),
      is_3d_secure:           String(obj.is_3d_secure ?? ""),
      is_auth:                String(obj.is_auth ?? ""),
      is_capture:             String(obj.is_capture ?? ""),
      is_refunded:            String(obj.is_refunded ?? ""),
      is_standalone_payment:  String(obj.is_standalone_payment ?? ""),
      is_voided:              String(obj.is_voided ?? ""),
      order:                  String(obj.order?.id ?? ""),
      owner:                  String(obj.owner ?? ""),
      pending:                String(obj.pending ?? ""),
      "source_data.pan":      String(obj.source_data?.pan ?? ""),
      "source_data.sub_type": String(obj.source_data?.sub_type ?? ""),
      "source_data.type":     String(obj.source_data?.type ?? ""),
      success:                String(obj.success ?? ""),
    };

    const isValid = await verifyHmac(flatData, hmac);
    if (!isValid) return new Response("Invalid HMAC", { status: 401 });
    if (obj.success !== true) return new Response(JSON.stringify({ received: true }), { status: 200 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const transactionId = String(obj.id);
    const { error: dupErr } = await supabase
      .from("paymob_events")
      .insert({ transaction_id: transactionId, status: "success" });
    if (dupErr?.code === "23505") return new Response("Already processed", { status: 200 });

    const merchantOrderId: string = obj.order?.merchant_order_id ?? "";
    const parts     = merchantOrderId.split("_");
    const userId    = parts.slice(0, 5).join("-");
    const packageId = parts[5] + "_" + parts[6];
    const coinsToAdd = PACKAGES[packageId];
    if (!userId || !coinsToAdd) return new Response("Bad order data", { status: 400 });

    await supabase.rpc("add_coins", {
      p_user_id: userId,
      p_amount:  coinsToAdd,
      p_meta: { paymob_transaction_id: transactionId, package_id: packageId },
    });

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});