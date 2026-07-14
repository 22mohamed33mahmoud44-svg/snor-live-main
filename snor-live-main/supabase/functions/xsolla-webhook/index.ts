import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XSOLLA_WEBHOOK_SECRET = Deno.env.get("XSOLLA_WEBHOOK_SECRET");

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// مقارنة ثابتة الزمن لمنع هجمات التوقيت (timing attacks)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyXsollaSignature(bodyText: string, authorizationHeader: string): Promise<boolean> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Signature ")) return false;

  const receivedHash = authorizationHeader.substring(10).trim().toLowerCase();

  const encoder = new TextEncoder();
  const dataToHash = encoder.encode(bodyText + XSOLLA_WEBHOOK_SECRET);

  const hashBuffer = await crypto.subtle.digest("SHA-1", dataToHash);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(computedHash, receivedHash);
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// تحديد عدد الكوينز بناءً على الـ SKU
const PACKAGES: Record<string, number> = {
  coins_100: 100,
  coins_500: 500,
  coins_1000: 1000,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    // ── 1. التحقق من التوقيع: fail closed ──
    // لو السر غير مضبوط في البيئة، نرفض كل الطلبات بدلاً من تخطي التحقق
    if (!XSOLLA_WEBHOOK_SECRET) {
      console.error("XSOLLA_WEBHOOK_SECRET is not configured — rejecting all webhooks.");
      return json({ error: "Webhook not configured" }, 500);
    }

    const text = await req.text();
    const authHeader = req.headers.get("Authorization") ?? "";

    const isValid = await verifyXsollaSignature(text, authHeader);
    if (!isValid) {
      console.warn("Invalid Xsolla signature");
      return json({ error: { code: "INVALID_SIGNATURE", description: "Invalid signature" } }, 401);
    }

    const body = text.trim() ? JSON.parse(text) : {};
    const notificationType = body.notification_type;

    // ── 2. التحقق من المستخدم ──
    if (notificationType === "user_validation") {
      const userId = body.user?.id;

      if (!userId || typeof userId !== "string") {
        return json({ error: { code: "INVALID_USER", description: "User ID is missing" } }, 400);
      }

      // تجاهل التحقق للمستخدمين التجريبيين من Xsolla
      if (userId === "123456" || userId.startsWith("test_xsolla_")) {
        console.log(`Xsolla test user: ${userId}`);
        return new Response(null, { status: 200 });
      }

      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) {
        console.warn(`User not found: ${userId}`);
        return json({ error: { code: "INVALID_USER", description: "User not found" } }, 400);
      }

      return new Response(null, { status: 200 });
    }

    // ── 3. معالجة الدفع الناجح ──
    if (notificationType === "payment") {
      const transactionId = String(body.transaction?.id ?? "");
      const userId = body.user?.id;
      const itemSku = body.purchase?.items?.[0]?.sku;

      if (!transactionId || !userId || !itemSku) {
        return json({ error: "Missing required data" }, 400);
      }

      const coinsToAdd = PACKAGES[itemSku] ?? 0;
      if (coinsToAdd === 0) {
        console.error("Unknown SKU:", itemSku);
        return json({ error: "Invalid SKU" }, 400);
      }

      const supabase = getAdminClient();

      // ── 3a. Idempotency حقيقية: عمود provider_txn_id فريد (unique index) ──
      // إدخال سجل المعاملة أولاً — لو المعاملة معالجة مسبقاً يفشل الإدخال بـ 23505
      const { data: txnRow, error: dupErr } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          type: "purchase",
          status: "success",
          amount: coinsToAdd,
          provider: "xsolla",
          provider_txn_id: transactionId,
          meta: { xsolla_transaction_id: transactionId, sku: itemSku },
        })
        .select("id")
        .single();

      if (dupErr) {
        if (dupErr.code === "23505" || dupErr.message?.includes("duplicate")) {
          console.log(`Transaction ${transactionId} already processed — skipping.`);
          return json({ status: 200 }, 200);
        }
        console.error("Failed to record transaction:", dupErr);
        // نرجع 500 حتى تعيد Xsolla المحاولة لاحقاً
        return json({ error: "Failed to record transaction" }, 500);
      }

      // ── 3b. إضافة الكوينز عبر RPC ذرّي يزيد الرصيد (لا يستبدله أبداً) ──
      const { error: coinsErr } = await supabase.rpc("increment_coins", {
        p_user_id: userId,
        p_amount: coinsToAdd,
      });

      if (coinsErr) {
        console.error("Failed to credit coins — rolling back transaction record:", coinsErr);
        // نحذف سجل المعاملة حتى تنجح إعادة المحاولة القادمة من Xsolla
        await supabase.from("transactions").delete().eq("id", txnRow.id);
        return json({ error: "Failed to add coins" }, 500);
      }

      console.log(`Credited ${coinsToAdd} coins to user ${userId} (txn ${transactionId})`);
      return json({ status: 200 }, 200);
    }

    // أي إشعارات أخرى (refund وغيرها تُسجَّل فقط حالياً)
    console.log(`Unhandled Xsolla notification type: ${notificationType}`);
    return json({ status: 200 }, 200);
  } catch (err) {
    console.error("Unexpected error:", String(err));
    return json({ error: "Internal Server Error" }, 500);
  }
});
