export interface LiveDiscoveryRow {
  id: string;
  user_id?: string | null;
  title?: string | null;
  streamer_name?: string | null;
  viewers_count?: number | null;
  likes_count?: number | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  is_live?: boolean | null;
}

export interface LiveDiscoveryItem {
  id: string;
  user_id: string;
  title: string;
  streamer_name: string;
  viewers_count: number;
  likes_count: number;
  avatar_url?: string;
  color: string;
  created_at: string;
}

export interface LiveDiscoveryEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: LiveDiscoveryRow | null;
  old?: Pick<LiveDiscoveryRow, 'id'> | null;
}
export const LIVE_DISCOVERY_LIMIT: number;
export function streamFromRow(row: LiveDiscoveryRow, previous?: LiveDiscoveryItem | null): LiveDiscoveryItem;
export function applyLiveStreamChange(streams: LiveDiscoveryItem[], event: LiveDiscoveryEvent): LiveDiscoveryItem[];
export function filterAndSortLiveStreams(streams: LiveDiscoveryItem[], search: string, sort?: 'popular' | 'recent'): LiveDiscoveryItem[];
