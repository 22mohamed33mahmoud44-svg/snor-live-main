import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const room = typeof body?.room === 'string' ? body.room.trim() : '';

    if (!room || room.length > 200) {
      return json({ error: "Missing or invalid 'room' parameter" }, 400);
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let canPublish = false;
    let authorized = false;

    if (room.startsWith('snor_call_')) {
      const embedded = room.match(new RegExp(UUID_RE.source.slice(1, -1), 'gi')) ?? [];
      if (embedded.some((id: string) => id.toLowerCase() === user.id.toLowerCase())) {
        authorized = true;
        canPublish = true;
      }
    } else if (UUID_RE.test(room)) {
      const { data: match } = await admin
        .from('matches')
        .select('id, user1, user2, status')
        .eq('id', room)
        .maybeSingle();

      if (match) {
        if ((match.user1 === user.id || match.user2 === user.id) && match.status !== 'ended') {
          authorized = true;
          canPublish = true;
        }
      } else {
        const { data: stream } = await admin
          .from('live_streams')
          .select('id, user_id, is_live')
          .eq('id', room)
          .maybeSingle();

        if (stream) {
          if (stream.user_id === user.id) {
            authorized = true;
            canPublish = true;
          } else if (stream.is_live) {
            authorized = true;
            canPublish = false;
          }
        }
      }
    }

    if (!authorized) {
      return json({ error: 'Forbidden: not a participant of this room' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    const displayName = profile?.username || user.user_metadata?.full_name || 'مستخدم سنور';

    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!apiKey || !apiSecret) {
      console.error('LiveKit API Key or Secret not set in environment variables.');
      return json({ error: 'Server configuration error' }, 500);
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
      ttl: '2h',
      metadata: JSON.stringify({ profile_name: displayName }),
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canPublishData: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    return json({ token }, 200);
  } catch (error) {
    console.error('Error generating token:', error instanceof Error ? error.message : String(error));
    return json({ error: 'Internal Server Error' }, 500);
  }
});
