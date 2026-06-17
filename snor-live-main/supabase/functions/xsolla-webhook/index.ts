import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XSOLLA_WEBHOOK_SECRET = Deno.env.get("XSOLLA_WEBHOOK_SECRET")!;

async function verifyXsollaSignature(bodyText: string, authorizationHeader: string): Promise<boolean> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Signature ")) return false;

  const receivedHash = authorizationHeader.substring(10).trim();

  const encoder = new TextEncoder();
  const dataToHash = encoder.encode(bodyText + XSOLLA_WEBHOOK_SECRET);

  const hashBuffer = await crypto.subtle.digest("SHA-1", dataToHash);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash.toLowerCase() === receivedHash.toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const text = await req.text();
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1. التحقق من التوقيع الأمني
    if (XSOLLA_WEBHOOK_SECRET) {
      const isValid = await verifyXsollaSignature(text, authHeader);
      if (!isValid) {
        console.warn("⚠️ توقيع غير صالح من Xsolla!");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const body = text.trim() ? JSON.parse(text) : {};
    const notificationType = body.notification_type;

    // 2. التحقق من المستخدم
    if (notificationType === "user_validation") {
      const userId = body.user?.id;

      if (!userId) {
        return new Response(
          JSON.stringify({ error: { code: "INVALID_USER", description: "User ID is missing" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // ✅ تجاهل التحقق للمستخدمين التجريبيين من Xsolla
      if (userId === "123456" || userId.startsWith("test_xsolla_")) {
        console.log(`✅ مستخدم تجريبي من Xsolla: ${userId}`);
        return new Response(null, { status: 200 });
      }

      // التحقق من وجود المستخدم في جدول profiles
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (error || !data) {
        console.warn(`⚠️ المستخدم غير موجود: ${userId}`);
        return new Response(
          JSON.stringify({ error: { code: "INVALID_USER", description: "User not found" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`✅ المستخدم موجود: ${userId}`);
      return new Response(null, { status: 200 });
    }

    // 3. معالجة الدفع الناجح
    if (notificationType === "payment") {
      const transactionId = String(body.transaction?.id ?? "");
      const userId = body.user?.id;
      const itemSku = body.purchase?.items?.[0]?.sku;

      if (!transactionId || !userId || !itemSku) {
        return new Response(JSON.stringify({ error: "Missing required data" }), { status: 400 });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // حماية ضد المعاملات المكررة — نسجل في جدول transactions
      const { error: dupErr } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          type: "purchase",
          status: "success",
          meta: { xsolla_transaction_id: transactionId, sku: itemSku }
        });

      if (dupErr && (dupErr.code === "23505" || dupErr.message?.includes("duplicate"))) {
        console.log(`ℹ️ المعاملة ${transactionId} معالجة مسبقاً.`);
        return new Response(JSON.stringify({ status: 200 }), { headers: { "Content-Type": "application/json" } });
      }

      // تحديد عدد الكوينز بناءً على الـ SKU
      const PACKAGES: Record<string, number> = {
        coins_100:  100,
        coins_500:  500,
        coins_1000: 1000,
      };

      const coinsToAdd = PACKAGES[itemSku] ?? 0;

      if (coinsToAdd === 0) {
        console.error("❌ SKU غير معرف:", itemSku);
        return new Response(JSON.stringify({ error: "Invalid SKU" }), { status: 400 });
      }

      // إضافة الكوينز في جدول users_coins
      const { error: coinsErr } = await supabase
        .from("users_coins")
        .upsert(
          { user_id: userId, coins: coinsToAdd },
          { onConflict: "user_id", ignoreDuplicates: false }
        );

      // لو upsert مش شغال، نعمل update مباشر
      if (coinsErr) {
        const { error: updateErr } = await supabase.rpc("increment_coins", {
          p_user_id: userId,
          p_amount: coinsToAdd,
        });

        if (updateErr) {
          console.error("❌ فشل إضافة الكوينز:", updateErr);
          return new Response(JSON.stringify({ error: "Failed to add coins" }), { status: 500 });
        }
      }

      console.log(`✅ تم إضافة ${coinsToAdd} كوين للمستخدم ${userId}`);
      return new Response(JSON.stringify({ status: 200 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // أي إشعارات أخرى
    return new Response(JSON.stringify({ status: 200 }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("🔥 خطأ غير متوقع:", String(err));
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
