import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET")!;

async function verifyHmac(data: Record<string, string>, receivedHmac: string): Promise<boolean> {
  const keys = [
    "amount_cents", "created_at", "currency", "error_occured",
    "has_parent_transaction", "id", "integration_id", "is_3d_secure",
    "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
    "is_voided", "order", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type",
    "success",
  ];
  
  // دمج القيم بترتيب الأبجدية الخاص بـ Paymob بشكل صارم
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
    let body: any = {};
    try {
      const text = await req.text();
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    const url = new URL(req.url);
    const hmac = url.searchParams.get("hmac") ?? "";
    
    // سحب الكائن الأساسي للمعاملة سواء كان ملفوفاً داخل obj أو مباشر
    const obj = body.obj ?? body ?? {};

    if (HMAC_SECRET) {
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
        order:                  String(obj.order?.id ?? obj.order ?? ""),
        owner:                  String(obj.owner ?? ""),
        pending:                String(obj.pending ?? ""),
        "source_data.pan":      String(obj.source_data?.pan ?? ""),
        "source_data.sub_type": String(obj.source_data?.sub_type ?? ""),
        "source_data.type":     String(obj.source_data?.type ?? ""),
        success:                String(obj.success ?? ""),
      };

      const isValid = await verifyHmac(flatData, hmac);
      if (!isValid) {
        console.warn("⚠️ بصمة التوقيع HMAC غير صالحة، احتمال تلاعب بالبيانات:", { hmac });
        return new Response(JSON.stringify({ received: true, result: "invalid_signature" }), {
          status: 200, // نرجع 200 دائماً عشان Paymob ميفضلش يعيد الإرسال ويعطل السيرفر
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // قبول الـ success سواء بوليان أو نص للتوافق الكامل مع قنوات المحافظ والبطاقات
    const isSuccess = obj.success === true || String(obj.success).toLowerCase() === "true";
    if (!isSuccess) {
      return new Response(JSON.stringify({ received: true, result: "not_success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const transactionId = String(obj.id ?? "");
    if (!transactionId) {
      return new Response(JSON.stringify({ received: true, result: "missing_transaction_id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // حماية ضد المعاملات المكررة (إدراج فريد)
    const { error: dupErr } = await supabase
      .from("paymob_events")
      .insert({ transaction_id: transactionId, status: "success" });

    if (dupErr && (dupErr.code === "23505" || dupErr.message?.includes("duplicate"))) {
      console.log(` المعاملة رقم ${transactionId} تم تجهيزها مسبقاً.`);
      return new Response(JSON.stringify({ received: true, result: "already_processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── تفكيك مرن وذكي لـ merchant_order_id لضمان استخراج البيانات ──
    const merchantOrderId: string = String(obj.order?.merchant_order_id ?? obj.merchant_order_id ?? "");
    let userId = "";
    let packageId = "";

    // بندعم الفصل بـ | أو _ أو - لتفادي أي طريقة كتابة في دالة الإنشاء
    const separators = ["|", "_", "-"];
    let parts: string[] = [merchantOrderId];
    
    for (const sep of separators) {
      if (merchantOrderId.includes(sep)) {
        parts = merchantOrderId.split(sep);
        break;
      }
    }

    if (parts.length >= 2) {
      userId = parts[0];
      packageId = parts[1];
    }

    const PACKAGES: Record<string, number> = {
      pkg_100:  100,
      pkg_500:  500,
      pkg_1000: 1000,
    };

    const coinsToAdd = PACKAGES[packageId];

    // خطة بديلة: لو الـ packageId مقروء كـ رقم مباشر من بوابة الدفع
    const finalCoins = coinsToAdd ?? (Number(packageId) ? Number(packageId) : null);

    if (!userId || !finalCoins) {
      console.error("❌ بيانات الفاتورة غير صالحة أو لا يمكن تفكيكها:", { merchantOrderId, userId, packageId });
      // مسح السجل المؤقت عشان يقدر يحاول تاني لو صلحنا البيانات
      await supabase.from("paymob_events").delete().eq("transaction_id", transactionId);
      return new Response(JSON.stringify({ received: true, result: "bad_order_data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── تنفيذ دالة إضافة الكوينز المؤمنة بالسيرفر ──
    const { error: coinsErr } = await supabase.rpc("add_coins", {
      p_user_id: userId,
      p_amount:  finalCoins,
      p_meta: { paymob_transaction_id: transactionId, package_id: packageId },
    });

    if (coinsErr) {
      console.error("❌ فشل استدعاء دالة rpc add_coins:", coinsErr);
      await supabase.from("paymob_events").delete().eq("transaction_id", transactionId);
      return new Response(JSON.stringify({ received: true, result: "coins_failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`✅ تمت عملية الشحن بنجاح! تم إضافة ${finalCoins} كوين للمستخدم ${userId}`);

    return new Response(JSON.stringify({ received: true, result: "success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("🔥 خطأ غير متوقع في نظام الـ Webhook:", String(err));
    return new Response(JSON.stringify({ received: true, result: "internal_error" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});