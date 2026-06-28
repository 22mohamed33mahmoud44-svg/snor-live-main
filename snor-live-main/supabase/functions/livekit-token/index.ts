import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AccessToken } from "npm:livekit-server-sdk";

const API_KEY = Deno.env.get("LIVEKIT_API_KEY");
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET");

serve(async (req) => {
  const { room, username, isStreamer } = await req.json();

  if (!room || !username) {
    return new Response(JSON.stringify({ error: "Missing room or username" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const at = new AccessToken(API_KEY!, API_SECRET!, {
    identity: username,
    ttl: "2h",
  });

  at.addGrant({
    roomJoin: true,
    room: room,
    canPublish: isStreamer,
    canPublishData: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});