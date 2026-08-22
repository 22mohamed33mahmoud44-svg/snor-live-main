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
    // قراءة الـ body بأمان
    let body: any = {};
    try {
      const text = await req.text();
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    const url  = new URL(req.url);
    const hmac = url.searchParams.get("hmac") ?? "";
    const obj  = body.obj ?? body ?? {};

    // HMAC verification
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
        order:                  String(obj.order?.id ?? ""),
        owner:                  String(obj.owner ?? ""),
        pending:                String(obj.pending ?? ""),
        "source_data.pan":      String(obj.source_data?.pan ?? ""),
        "source_data.sub_type": String(obj.source_data?.sub_type ?? ""),
        "source_data.type":     String(obj.source_data?.type ?? ""),
        success:                String(obj.success ?? ""),
      };

      const isValid = await verifyHmac(flatData, hmac);
      if (!isValid) {
        console.warn("Invalid HMAC signature");
        // دايماً نرجع 200 عشان Paymob ما يعيدش المحاولة
        return new Response(JSON.stringify({ received: true, result: "invalid_signature" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // لو مش successful نتجاهل
    if (obj.success !== true) {
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

    // منع التكرار
    const { error: dupErr } = await supabase
      .from("paymob_events")
      .insert({ transaction_id: transactionId, status: "success" });

    if (dupErr?.code === "23505") {
      return new Response(JSON.stringify({ received: true, result: "already_processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // استخراج بيانات الأوردر
    const merchantOrderId: string = obj.order?.merchant_order_id ?? "";
    const firstUnderscore = merchantOrderId.indexOf("_");
    const lastUnderscore  = merchantOrderId.lastIndexOf("_");
    const userId    = merchantOrderId.substring(0, firstUnderscore);
    const packageId = merchantOrderId.substring(firstUnderscore + 1, lastUnderscore);
    const PACKAGES: Record<string, number> = {
      pkg_100:  100,
      pkg_500:  500,
      pkg_1000: 1000,
    };

    const coinsToAdd = PACKAGES[packageId];

    if (!userId || !coinsToAdd) {
      console.error("Bad order data", { merchantOrderId, userId, packageId });
      return new Response(JSON.stringify({ received: true, result: "bad_order_data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // إضافة الكوينز
    const { error: coinsErr } = await supabase.rpc("add_coins", {
      p_user_id: userId,
      p_amount:  coinsToAdd,
      p_meta: { paymob_transaction_id: transactionId, package_id: packageId },
    });

    if (coinsErr) {
      console.error("add_coins failed", coinsErr);
      // نمسح الـ event عشان يقدر يتعالج تاني
      await supabase.from("paymob_events").delete().eq("transaction_id", transactionId);
      return new Response(JSON.stringify({ received: true, result: "coins_failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("Payment processed", { transactionId, userId, coinsToAdd });

    return new Response(JSON.stringify({ received: true, result: "success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unhandled error", String(err));
    // دايماً 200 حتى لو في error
    return new Response(JSON.stringify({ received: true, result: "internal_error" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});