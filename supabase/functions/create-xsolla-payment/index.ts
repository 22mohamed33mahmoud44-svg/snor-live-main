import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const XSOLLA_PROJECT_ID  = Deno.env.get('XSOLLA_PROJECT_ID')!;
const XSOLLA_MERCHANT_ID = Deno.env.get('XSOLLA_MERCHANT_ID')!;
const XSOLLA_API_KEY     = Deno.env.get('XSOLLA_API_KEY')!;

const PACKAGES = [
  { id: 'pkg_100',  coins: 100,  sku: 'coins_100',  amount: 10  },
  { id: 'pkg_500',  coins: 500,  sku: 'coins_500',  amount: 45  },
  { id: 'pkg_1000', coins: 1000, sku: 'coins_1000', amount: 80  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { packageId } = await req.json();
    const pkg = PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
      return new Response(JSON.stringify({ error: 'Invalid package' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeaderString = btoa(`${XSOLLA_MERCHANT_ID}:${XSOLLA_API_KEY}`);

    const xsollaRes = await fetch(
      `https://api.xsolla.com/merchant/v2/merchants/${XSOLLA_MERCHANT_ID}/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeaderString}`,
        },
        body: JSON.stringify({
          user: {
            id:    { value: user.id },
            email: { value: user.email ?? 'user@snorlive.app' },
          },
          settings: {
            project_id: Number(XSOLLA_PROJECT_ID),
            currency:   'EGP',
            language:   'ar',
            mode:       'sandbox',
          },
          custom_parameters: {
            package_id: pkg.id,
            sku:        pkg.sku,
            coins:      pkg.coins,
          },
        }),
      }
    );

    const xsollaData = await xsollaRes.json();

    if (!xsollaRes.ok || !xsollaData.token) {
      throw new Error(xsollaData.message || 'Failed to generate Xsolla token');
    }

    const { error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type:    'purchase',
        status:  'pending',
        amount:  pkg.coins,
        provider: 'xsolla',
        meta: {
          xsolla_token: xsollaData.token,
          package_id:   pkg.id,
          sku:          pkg.sku,
          coins:        pkg.coins,
          gateway:      'xsolla',
        },
      });

    if (txErr) console.warn('transactions insert warning:', txErr.message);

    return new Response(
      JSON.stringify({ token: xsollaData.token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-xsolla-payment error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
