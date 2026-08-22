import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const XSOLLA_WEBHOOK_SECRET = Deno.env.get('XSOLLA_WEBHOOK_SECRET');

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyXsollaSignature(bodyText: string, authorizationHeader: string): Promise<boolean> {
  if (!authorizationHeader || !authorizationHeader.startsWith('Signature ')) return false;

  const receivedHash = authorizationHeader.substring(10).trim().toLowerCase();

  const encoder = new TextEncoder();
  const dataToHash = encoder.encode(bodyText + XSOLLA_WEBHOOK_SECRET);

  const hashBuffer = await crypto.subtle.digest('SHA-1', dataToHash);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(computedHash, receivedHash);
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

const PACKAGES: Record<string, number> = {
  coins_100: 100,
  coins_500: 500,
  coins_1000: 1000,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!XSOLLA_WEBHOOK_SECRET) {
      console.error('XSOLLA_WEBHOOK_SECRET is not configured — rejecting all webhooks.');
      return json({ error: 'Webhook not configured' }, 500);
    }

    const text = await req.text();
    const authHeader = req.headers.get('Authorization') ?? '';

    const isValid = await verifyXsollaSignature(text, authHeader);
    if (!isValid) {
      console.warn('Invalid Xsolla signature');
      return json({ error: { code: 'INVALID_SIGNATURE', description: 'Invalid signature' } }, 401);
    }

    const body = text.trim() ? JSON.parse(text) : {};
    const notificationType = body.notification_type;

    if (notificationType === 'user_validation') {
      const userId = body.user?.id;
      if (!userId || typeof userId !== 'string') {
        return json({ error: { code: 'INVALID_USER', description: 'User ID is missing' } }, 400);
      }

      if (userId === '123456' || userId.startsWith('test_xsolla_')) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }

      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return json({ error: { code: 'INVALID_USER', description: 'User not found' } }, 400);
      }

      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (notificationType === 'payment') {
      const transactionId = String(body.transaction?.id ?? '');
      const userId = body.user?.id;
      const itemSku = body.purchase?.items?.[0]?.sku;

      if (!transactionId || !userId || !itemSku) {
        return json({ error: 'Missing required data' }, 400);
      }

      const coinsToAdd = PACKAGES[itemSku] ?? 0;
      if (coinsToAdd === 0) {
        console.error('Unknown SKU:', itemSku);
        return json({ error: 'Invalid SKU' }, 400);
      }

      const supabase = getAdminClient();

      const { data: txnRow, error: dupErr } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'purchase',
          status: 'success',
          amount: coinsToAdd,
          provider: 'xsolla',
          provider_txn_id: transactionId,
          meta: { xsolla_transaction_id: transactionId, sku: itemSku },
        })
        .select('id')
        .single();

      if (dupErr) {
        if (dupErr.code === '23505' || dupErr.message?.includes('duplicate')) {
          return json({ status: 200 }, 200);
        }
        console.error('Failed to record transaction:', dupErr);
        return json({ error: 'Failed to record transaction' }, 500);
      }

      const { error: coinsErr } = await supabase.rpc('increment_coins', {
        p_user_id: userId,
        p_amount: coinsToAdd,
      });

      if (coinsErr) {
        console.error('Failed to credit coins — rolling back transaction record:', coinsErr);
        await supabase.from('transactions').delete().eq('id', txnRow.id);
        return json({ error: 'Failed to add coins' }, 500);
      }

      console.log(`Credited ${coinsToAdd} coins to user ${userId} (txn ${transactionId})`);
      return json({ status: 200 }, 200);
    }

    console.log(`Unhandled Xsolla notification type: ${notificationType}`);
    return json({ status: 200 }, 200);
  } catch (err) {
    console.error('Unexpected error:', String(err));
    return json({ error: 'Internal Server Error' }, 500);
  }
});
