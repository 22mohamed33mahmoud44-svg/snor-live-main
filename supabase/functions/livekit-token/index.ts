import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken, TrackSource } from 'npm:livekit-server-sdk@2';
import { authorizeRoom } from './authorization.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

    // The database is authoritative for authorization; lookup failures must deny access.
    const authorization = await authorizeRoom(
      room,
      user.id,
      async (roomId: string) => {
        const { data, error } = await admin
          .from('matches')
          .select('user1, user2, status, kind, call_type')
          .eq('id', roomId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      async (roomId: string) => {
        const { data, error } = await admin
          .from('live_streams')
          .select('user_id, is_live')
          .eq('id', roomId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
    );

    const { authorized, canPublish, kind } = authorization;
    if (!authorized) {
      return json({ error: 'Forbidden: not a participant of this room' }, 403);
    }

    const { data: profile } = await admin
      .from('public_profiles')
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
      // Short-lived call join tokens reduce how long an ended room can be rejoined.
      ttl: kind === 'match' ? '10m' : '2h',
      metadata: JSON.stringify({ profile_name: displayName }),
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canPublishData: true,
      canSubscribe: true,
      // Only microphone tracks may be published for consented audio calls.
      // Enforced in the signed LiveKit token, not merely in React UI.
      ...('publishSources' in authorization && authorization.publishSources?.includes('microphone')
        ? { canPublishSources: [TrackSource.MICROPHONE] }
        : {}),
    });

    const token = await at.toJwt();
    return json({ token }, 200);
  } catch (error) {
    console.error('Error generating token:', error instanceof Error ? error.message : String(error));
    return json({ error: 'Internal Server Error' }, 500);
  }
});
