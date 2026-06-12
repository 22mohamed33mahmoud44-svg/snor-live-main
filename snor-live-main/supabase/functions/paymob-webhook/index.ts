import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymobObj {
  id?: string | number;
  transaction_id?: string | number;
  success?: boolean | string;
  pending?: boolean | string;
  amount_cents?: number;
  currency?: string;
  order?: {
    id?: string | number;
    [key: string]: unknown;
  };
  order_id?: string | number;
  [key: string]: unknown;
}

interface PaymobBody {
  obj?: PaymobObj;
  type?: string;
  [key: string]: unknown;
}

type ProcessResult =
  | "success"
  | "already_processed"
  | "order_not_found"
  | "coins_failed"
  | "skipped_not_success"
  | "missing_data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: unknown) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined ? { data } : {}),
  };
  console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](
    JSON.stringify(entry)
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Paymob HMAC-SHA512 signature verification.
 * Set PAYMOB_HMAC_SECRET in Supabase secrets.
 * If the env var is absent we skip verification (dev/test mode) and log a warning.
 */
async function verifyHmac(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("PAYMOB_HMAC_SECRET");

  if (!secret) {
    log("WARN", "PAYMOB_HMAC_SECRET not set – skipping HMAC verification (dev/test mode)");
    return true;
  }

  const signature = req.headers.get("x-paymob-signature") ?? "";
  if (!signature) {
    log("WARN", "No x-paymob-signature header found");
    return false;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const valid = computed === signature.toLowerCase();
  if (!valid) log("WARN", "HMAC signature mismatch", { computed, received: signature });
  return valid;
}

function extractFields(obj: PaymobObj): {
  transactionId: string;
  orderId: string;
  isSuccess: boolean;
} {
  const transactionId = String(obj.id ?? obj.transaction_id ?? "").trim();

  const orderId = String(
    obj.order?.id ?? obj.order_id ?? ""
  ).trim();

  // Paymob sends booleans or string "true"/"false"
  const isSuccess =
    obj.success === true ||
    obj.success === "true" ||
    String(obj.success).toLowerCase() === "true";

  return { transactionId, orderId, isSuccess };
}

// ─── Core Payment Processing ──────────────────────────────────────────────────

async function processPayment(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  transactionId: string,
  orderId: string
): Promise<ProcessResult> {
  // ① Idempotency – insert first, rely on unique constraint
  const { error: dupErr } = await supabase
    .from("paymob_events")
    .insert({ transaction_id: transactionId, status: "success" });

  if (dupErr?.code === "23505") {
    log("INFO", "Duplicate transaction – already processed", { transactionId });
    return "already_processed";
  }

  if (dupErr) {
    // Unexpected DB error while inserting the event – still log and continue
    // so we don't lose the payment. The next run will hit the duplicate guard.
    log("ERROR", "Failed to insert paymob_event", { transactionId, error: dupErr });
  }

  // ② Look up the pending order
  const { data: pendingOrder, error: orderErr } = await supabase
    .from("pending_orders")
    .select("user_id, coins, order_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderErr) {
    log("ERROR", "DB error fetching pending order", { orderId, error: orderErr });
  }

  if (!pendingOrder) {
    log("WARN", "Pending order not found", { orderId });
    return "order_not_found";
  }

  // ③ Credit coins – treat any failure as fatal for this run
  const { error: coinsErr } = await supabase.rpc("add_coins", {
    p_user_id: pendingOrder.user_id,
    p_amount: pendingOrder.coins,
    p_meta: {
      paymob_transaction_id: transactionId,
      order_id: orderId,
    },
  });

  if (coinsErr) {
    log("ERROR", "add_coins RPC failed", {
      userId: pendingOrder.user_id,
      coins: pendingOrder.coins,
      error: coinsErr,
    });
    // Roll back the event so the next webhook retry can reprocess
    await supabase
      .from("paymob_events")
      .delete()
      .eq("transaction_id", transactionId);
    return "coins_failed";
  }

  // ④ Clean up the pending order
  const { error: deleteErr } = await supabase
    .from("pending_orders")
    .delete()
    .eq("order_id", orderId);

  if (deleteErr) {
    // Non-fatal – coins are already credited
    log("WARN", "Could not delete pending order (coins were credited)", {
      orderId,
      error: deleteErr,
    });
  }

  log("INFO", "Payment processed successfully", {
    transactionId,
    orderId,
    userId: pendingOrder.user_id,
    coins: pendingOrder.coins,
  });

  return "success";
}

// ─── Request Handlers ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function makeSupabase(): any {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}

async function handleGet(url: URL, supabase: ReturnType<typeof makeSupabase>): Promise<Response> {
  const success = url.searchParams.get("success");
  const transactionId = (url.searchParams.get("id") ?? "").trim();
  const orderId = (url.searchParams.get("order") ?? "").trim();

  log("INFO", "GET redirect callback received", { success, transactionId, orderId });

  // Paymob sends success=true and pending=false for completed payments
  if (success !== "true") {
    log("INFO", "GET callback: payment not successful", { success });
    return jsonResponse({ received: true, result: "skipped_not_success" });
  }

  if (!transactionId || !orderId) {
    log("WARN", "GET callback: missing transactionId or orderId", { transactionId, orderId });
    return jsonResponse({ received: true, result: "missing_data" });
  }

  const result = await processPayment(supabase, transactionId, orderId);
  return jsonResponse({ received: true, result });
}

async function handlePost(req: Request, supabase: ReturnType<typeof makeSupabase>): Promise<Response> {
  // ① Read body safely
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (e) {
    log("ERROR", "Failed to read request body", { error: String(e) });
    return jsonResponse({ received: true, result: "body_read_error" });
  }

  // ② Always return 200 to Paymob – parse errors must not bubble up
  let body: PaymobBody = {};
  try {
    body = rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    log("WARN", "Failed to parse JSON body – ignoring event", { rawBody: rawBody.slice(0, 500) });
    return jsonResponse({ received: true, result: "invalid_json" });
  }

  log("INFO", "POST webhook received", { type: body.type });

  // ③ HMAC verification
  const valid = await verifyHmac(req, rawBody);
 if (!valid) {
    log("WARN", "Rejected webhook: invalid HMAC signature");
    return new Response(JSON.stringify({ received: true, result: "invalid_signature" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ④ Support both { obj: {...} } and flat payload
  const obj: PaymobObj = (body.obj as PaymobObj) ?? (body as PaymobObj);

  if (!obj || typeof obj !== "object") {
    log("WARN", "Empty or non-object payload – ignoring");
    return jsonResponse({ received: true, result: "empty_payload" });
  }

  const { transactionId, orderId, isSuccess } = extractFields(obj);

  log("INFO", "Extracted payment fields", { transactionId, orderId, isSuccess });

  // ⑤ Only process successful transactions
  if (!isSuccess) {
    log("INFO", "Skipping non-successful transaction", { transactionId, orderId });
    return jsonResponse({ received: true, result: "skipped_not_success" });
  }

  if (!transactionId || !orderId) {
    log("WARN", "Missing transactionId or orderId – cannot process", {
      transactionId,
      orderId,
    });
    return jsonResponse({ received: true, result: "missing_data" });
  }

  const result = await processPayment(supabase, transactionId, orderId);
  return jsonResponse({ received: true, result });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);

  let supabase: ReturnType<typeof makeSupabase>;
  try {
    supabase = makeSupabase();
  } catch (e) {
    log("ERROR", "Supabase init failed", { error: String(e) });
    // Return 200 so Paymob doesn't retry endlessly
    return jsonResponse({ received: true, result: "server_config_error" });
  }

  try {
    if (req.method === "GET") return await handleGet(url, supabase);
    if (req.method === "POST") return await handlePost(req, supabase);

    // Other methods (HEAD, OPTIONS, etc.)
    return jsonResponse({ received: true }, 200);
  } catch (err) {
    // Last-resort catch – never let an unhandled error return a non-200
    log("ERROR", "Unhandled exception in webhook handler", { error: String(err) });
    return jsonResponse({ received: true, result: "internal_error" });
  }
});