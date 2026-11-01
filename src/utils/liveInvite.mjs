// An invitation URL is a pointer to a public live broadcast, NOT a publishing
// credential. The receiver must sign in; the database and LiveKit server verify
// whether the broadcast is still live and whether the viewer may subscribe.
export const STREAM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readLiveInvite(search) {
  const id = new URLSearchParams(search).get('live');
  return id && STREAM_ID_RE.test(id) ? id.toLowerCase() : null;
}

export function buildLiveInviteUrl(origin, streamId) {
  if (!STREAM_ID_RE.test(streamId)) throw new Error('Invalid live broadcast ID');
  const url = new URL('/', origin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Live invitations must use a secure origin');
  }
  url.searchParams.set('live', streamId.toLowerCase());
  return url.toString();
}

export function clearLiveInviteUrl(href) {
  const url = new URL(href);
  url.searchParams.delete('live');
  return url.pathname + url.search + url.hash;
}
