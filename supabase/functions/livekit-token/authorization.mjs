// Pure authorization logic, shared by Supabase Edge Function and Node regression tests.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lookups must throw on database errors so access always fails closed.
 * @param {string} room
 * @param {string} userId
 * @param {(roomId: string) => Promise<{user1:string,user2:string,status:string}|null>} lookupMatch
 * @param {(roomId: string) => Promise<{user_id:string,is_live:boolean}|null>} lookupStream
 */
export async function authorizeRoom(room, userId, lookupMatch, lookupStream) {
  const denied = { authorized: false, canPublish: false, kind: null };

  if (!UUID_RE.test(room) || !UUID_RE.test(userId)) return denied;

  const match = await lookupMatch(room);
  if (match) {
    const participant = match.user1 === userId || match.user2 === userId;
    if (!participant || match.status !== 'active') return denied;
    return { authorized: true, canPublish: true, kind: 'match' };
  }

  const stream = await lookupStream(room);
  if (!stream || stream.is_live !== true) return denied;

  return {
    authorized: true,
    canPublish: stream.user_id === userId,
    kind: 'stream',
  };
}
