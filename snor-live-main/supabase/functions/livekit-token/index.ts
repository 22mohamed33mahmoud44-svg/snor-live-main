// deno-lint-ignore-file no-import-prefix no-unversioned-import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk';

// إعدادات الـ CORS للسماح لتطبيقك بالاتصال بالسيرفر
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. معالجة طلبات الـ OPTIONS الخاصة بمتصفحات الويب
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. قراءة بيانات الطلب (مرة واحدة فقط لتجنب أخطاء Deno)
    const body = await req.json();
    const { room, username, isStreamer } = body;

    if (!room) {
      return new Response(JSON.stringify({ error: "Missing 'room' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. التحقق من هوية المستخدم باستخدام Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // تحديد هوية المشارك (استخدام اسم المستخدم المُرسل أو الـ ID الخاص بسوبابيز كبديل)
    const participantIdentity = username || user.id;

    // 4. جلب مفاتيح LiveKit من بيئة العمل
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      console.error('LiveKit API Key or Secret not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 5. إنشاء توكن LiveKit وإعطاء الصلاحيات
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: "2h",
      metadata: JSON.stringify({ profile_name: user.user_metadata?.full_name }),
    });

    at.addGrant({
      roomJoin: true,
      room: room,
      canPublish: !!isStreamer, // السماح بالبث فقط إذا كان المستخدم هو المذيع
      canPublishData: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // 6. إرسال التوكن بنجاح للفرونت إند
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Error generating token:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
