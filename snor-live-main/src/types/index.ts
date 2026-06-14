// ── Types & Interfaces ───────────────────────────────────────────

export interface Profile {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  gender?: string;
}

export interface ConvUser {
  profile: Profile;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

export interface ChatOther {
  id: string;
  full_name?: string;
  username?: string;
  name?: string;
  avatar_url?: string;
}

export interface MsgItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface DashboardProps {
  userId?: string;
  onLogout?: () => void;
}

export interface CallState {
  matchId: string;
  remoteUserId: string;
  type: 'video' | 'audio';
}

export interface SettingsPanelProps {
  onClose: () => void;
  myProfile: Profile | null;
  onLogout: () => void;
  onOpenEdit: () => void;
}
export interface DashboardProps {
  userId?: string;
  onLogout?: () => void;
  onStartRandomMatch?: () => void;  // ← أضف السطر ده
}

export type TabKey = 'home' | 'match' | 'chats' | 'profile';
