import { useState, useRef, ReactNode } from 'react';
import { CoinsBalance } from "./components/CoinsBalance";
import BuyCoins from './BuyCoins';
// ── Types ────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  gender?: string;
}

interface ConvUser {
  profile: Profile;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

interface DemoUser {
  id: string;
  name: string;
  age: number;
  flag: string;
  color: string;
  match: number;
}

interface ChatOther {
  id: string;
  full_name?: string;
  username?: string;
  name?: string;
  avatar_url?: string;
}

interface MsgItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface DashboardProps {
  userId?: string;
  onStartRandomMatch?: () => void;
  onLogout?: () => void;
}

interface PrivateChatProps {
  myId: string;
  other: ChatOther;
  onBack: () => void;
}

interface SettingsPanelProps {
  onClose: () => void;
  myProfile: Profile | null;
  onLogout: () => void;
}

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

interface RowProps {
  icon: ReactNode;
  label: string;
  sub?: string;
  children?: ReactNode;
}

interface StatItem {
  num?: number | string;
  label?: string;
  divider?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────
const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
};

const initials = (p?: Profile | null): string =>
  (p?.full_name || p?.username || '?')[0].toUpperCase();

const DEMO_USERS: DemoUser[] = [
  { id: 'd1', name: 'لينا',  age: 23, flag: '🇪🇬', color: '#c084fc', match: 92 },
  { id: 'd2', name: 'كريم', age: 26, flag: '🇸🇦', color: '#38bdf8', match: 87 },
  { id: 'd3', name: 'نور',  age: 21, flag: '🇲🇦', color: '#f472b6', match: 95 },
  { id: 'd4', name: 'علي',  age: 29, flag: '🇦🇪', color: '#34d399', match: 78 },
  { id: 'd5', name: 'ريم',  age: 24, flag: '🇯🇴', color: '#fb923c', match: 84 },
  { id: 'd6', name: 'أحمد', age: 27, flag: '🇱🇧', color: '#60a5fa', match: 91 },
];

// ── Snor Live Logo ───────────────────────────────────────────────
const SnorLiveLogo = ({ size = 26 }: { size?: number }) => (
  <svg width={size * 3.6} height={size} viewBox="0 0 130 35" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0"  y="26" fontFamily="'Segoe UI',Arial,sans-serif" fontWeight="700" fontSize="24" fill="white" letterSpacing="-0.5">Sno</text>
    <text x="52" y="26" fontFamily="'Segoe UI',Arial,sans-serif" fontWeight="700" fontSize="24" fill="white">r</text>
    <circle cx="62" cy="4" r="3.5" fill="#00d4ff" />
    <text x="65" y="26" fontFamily="'Segoe UI',Arial,sans-serif" fontWeight="700" fontSize="24" fill="white"> SNOR</text>
  </svg>
);

// ── Private Chat ─────────────────────────────────────────────────
function PrivateChat({ myId, other, onBack }: PrivateChatProps) {
  const [messages, setMessages] = useState<MsgItem[]>([
    { id: '1', sender_id: other.id, receiver_id: myId, message: 'مرحباً! كيف حالك؟',         read: true, created_at: new Date(Date.now() - 300000).toISOString() },
    { id: '2', sender_id: myId,    receiver_id: other.id, message: 'بخير الحمد لله، وأنت؟', read: true, created_at: new Date(Date.now() - 240000).toISOString() },
    { id: '3', sender_id: other.id, receiver_id: myId, message: 'تمام! سعيد بالتعرف عليك 😊', read: true, created_at: new Date(Date.now() - 60000).toISOString() },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const name = other.full_name || other.username || other.name || 'مستخدم';

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    inputRef.current?.focus();
    const msg: MsgItem = {
      id: crypto.randomUUID(),
      sender_id: myId,
      receiver_id: other.id,
      message: text,
      read: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06060f', display: 'flex', flexDirection: 'column', direction: 'rtl', fontFamily: 'inherit', color: '#f0f0ff', zIndex: 900 }}>
      <div style={{ padding: '12px 16px', background: 'rgba(10,10,22,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ width: 42, height: 42, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #00d4ff)', position: 'relative', flexShrink: 0 }}>
          {other.avatar_url
            ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
            : name[0].toUpperCase()}
          <div style={{ position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#4ade80', border: '2px solid #0a0a16' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: '0.7rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }} /> متصل الآن
          </div>
        </div>
        <button style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === myId;
          const showTime = i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id;
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: 18, fontSize: '0.87rem', lineHeight: 1.55, wordBreak: 'break-word', background: isMe ? 'linear-gradient(135deg,rgba(124,58,237,.85),rgba(0,212,255,.7))' : 'rgba(255,255,255,.07)', borderBottomRightRadius: isMe ? 4 : 18, borderBottomLeftRadius: isMe ? 18 : 4 }}>
                {msg.message}
              </div>
              {showTime && <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.22)', padding: '2px 4px' }}>{timeAgo(msg.created_at)}</div>}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 8, background: 'rgba(6,6,15,.98)', paddingBottom: 'max(10px,env(safe-area-inset-bottom))' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="اكتب رسالة…"
          style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: '11px 14px', color: '#f0f0ff', fontFamily: 'inherit', fontSize: '0.87rem', outline: 'none', direction: 'rtl' }}
        />
        <button onClick={send} style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Settings Panel ───────────────────────────────────────────────
function SettingsPanel({ onClose, myProfile, onLogout }: SettingsPanelProps) {
  const [notif,    setNotif]    = useState(true);
  const [sound,    setSound]    = useState(true);
  const [dark,     setDark]     = useState(true);
  const [discover, setDiscover] = useState(true);

  const Toggle = ({ value, onChange }: ToggleProps) => (
    <div
      onClick={() => onChange(!value)}
      style={{ width: 44, height: 26, borderRadius: 13, background: value ? 'linear-gradient(135deg,#7c3aed,#00d4ff)' : 'rgba(255,255,255,.1)', cursor: 'pointer', position: 'relative', transition: 'background .25s', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', top: 3, ...(value ? { right: 3 } : { left: 3 }), width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'all .25s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
    </div>
  );

  const Row = ({ icon, label, sub, children }: RowProps) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(0,212,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d4ff', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 800, backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', direction: 'rtl' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#0d0d1e', borderRadius: '24px 24px 0 0', padding: '0 0 max(24px,env(safe-area-inset-bottom)) 0', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)' }} />
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>الإعدادات</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.07)', border: 'none', color: 'rgba(255,255,255,.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Profile mini card */}
        <div style={{ margin: '0 20px 20px', padding: '16px', borderRadius: 18, background: 'linear-gradient(135deg,rgba(124,58,237,.15),rgba(0,212,255,.1))', border: '1px solid rgba(0,212,255,.15)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (myProfile?.full_name || 'أ')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{myProfile?.full_name || 'بدون اسم'}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.4)', marginTop: 2 }}>@{myProfile?.username || 'username'}</div>
          </div>
          <button style={{ padding: '7px 14px', borderRadius: 10, background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.25)', color: '#00d4ff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>تعديل</button>
        </div>

        <div style={{ padding: '0 20px' }}>
          <SectionLabel>الإشعارات</SectionLabel>
          <Row icon={<BellIcon />} label="إشعارات الرسائل" sub="تنبيه عند وصول رسالة جديدة"><Toggle value={notif} onChange={setNotif} /></Row>
          <Row icon={<SoundIcon />} label="الأصوات" sub="أصوات الإشعارات"><Toggle value={sound} onChange={setSound} /></Row>

          <SectionLabel style={{ marginTop: 20 }}>الخصوصية</SectionLabel>
          <Row icon={<UsersIcon />} label="الظهور للآخرين" sub="يسمح للناس باكتشافك"><Toggle value={discover} onChange={setDiscover} /></Row>
          <Row icon={<LockIcon />} label="الحساب المحظور" sub="0 أشخاص">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </Row>

          <SectionLabel style={{ marginTop: 20 }}>المظهر</SectionLabel>
          <Row icon={<MoonIcon />} label="الوضع الليلي"><Toggle value={dark} onChange={setDark} /></Row>

          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <button onClick={onLogout} style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.18)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LogoutIcon /> تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────
const SectionLabel = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.28)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4, ...style }}>{children}</div>
);
const BellIcon    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const SoundIcon   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
const UsersIcon   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const LockIcon    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const MoonIcon    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const LogoutIcon  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const VideoIcon   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
const GearIcon    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const BellNavIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;

type TabKey = 'home' | 'match' | 'chats' | 'profile';

interface NavItem {
  key: TabKey;
  label: string;
  badge?: number;
  icon: ReactNode;
}

// ── MAIN DASHBOARD ───────────────────────────────────────────────
export default function Dashboard({
  userId = 'me',
  onStartRandomMatch = () => {},
  onLogout = () => {},
}: DashboardProps) {
  const [tab, setTab]           = useState<TabKey>('home');
  const [conversations]         = useState<ConvUser[]>([
    { profile: { id: 'd1', full_name: 'لينا أحمد', username: 'lina',  avatar_url: undefined }, lastMessage: 'سعيدة بالتعرف عليك!', lastTime: new Date(Date.now() - 300000).toISOString(),  unread: 2 },
    { profile: { id: 'd3', full_name: 'نور محمد',  username: 'nour',  avatar_url: undefined }, lastMessage: 'إزيك؟',               lastTime: new Date(Date.now() - 3600000).toISOString(), unread: 0 },
  ]);
  const [myProfile]             = useState<Profile>({ id: userId, full_name: 'مستخدم', username: 'user123', gender: 'male', avatar_url: undefined });
  const [openChat, setOpenChat] = useState<ChatOther | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [onlineCount]           = useState(Math.floor(Math.random() * 300) + 180);
  const [activeCard, setActiveCard]     = useState<string | null>(null);
  const [showBuyCoins, setShowBuyCoins] = useState(false);
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  if (openChat)     return <PrivateChat myId={userId} other={openChat} onBack={() => setOpenChat(null)} />;
  if (showSettings) return <SettingsPanel onClose={() => setShowSettings(false)} myProfile={myProfile} onLogout={onLogout} />;
  if (showBuyCoins) return <BuyCoins onClose={() => setShowBuyCoins(false)} />;
  const MyAvatar = () => (
    <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', border: tab === 'profile' ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', fontSize: '0.65rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {myProfile?.avatar_url
        ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span>{initials(myProfile)}</span>}
    </div>
  );

  const NAV: NavItem[] = [
    { key: 'home',    label: 'الرئيسية', icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: 'match',   label: 'اكتشف',   icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: 'chats',   label: 'رسائل',   badge: totalUnread, icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { key: 'profile', label: 'أنا',      icon: null },
  ];

  const STATS: StatItem[] = [
    { num: '500K+', label: 'مستخدم' },
    { divider: true },
    { num: '80+',   label: 'دولة' },
    { divider: true },
    { num: '24/7',  label: 'على الهواء' },
  ];

  const PROFILE_STATS: StatItem[] = [
    { num: conversations.length, label: 'محادثة' },
    { divider: true },
    { num: onlineCount, label: 'أونلاين' },
    { divider: true },
    { num: 0, label: 'إعجاب' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06060f', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans Arabic',sans-serif", direction: 'rtl', color: '#f0f0ff', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:0}
        input::placeholder{color:rgba(255,255,255,.2)}
        input:focus{outline:none;border-color:rgba(0,212,255,.5)!important}
        @keyframes fadein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ring{0%{transform:scale(.85);opacity:.5}100%{transform:scale(1.9);opacity:0}}
        @keyframes floatdiamond{0%,100%{transform:translateY(0) rotate(45deg)}50%{transform:translateY(-10px) rotate(45deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(0,212,255,.3)}50%{box-shadow:0 0 40px rgba(0,212,255,.6)}}
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ padding: '13px 18px 10px', background: 'rgba(6,6,15,.97)', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(20px)', flexShrink: 0, zIndex: 20 }}>
        <SnorLiveLogo size={26} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: '0.62rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
            {onlineCount}
          </div>
          <button style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <BellNavIcon />
            {totalUnread > 0 && <div style={{ position: 'absolute', top: 6, left: 6, width: 7, height: 7, borderRadius: '50%', background: '#00d4ff', border: '2px solid #06060f' }} />}
          </button>
           <CoinsBalance userId={userId} />
<button
  onClick={() => setShowBuyCoins(true)}
  style={{
    padding: '6px 12px',
    borderRadius: 10,
    background: 'linear-gradient(135deg,#7c3aed,#00d4ff)',
    border: 'none',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }}
>
  + شحن
</button>
          <button onClick={() => setShowSettings(true)} style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GearIcon />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>

        {/* ══ HOME TAB ══ */}
        {tab === 'home' && (
          <div style={{ animation: 'fadein .35s ease' }}>
            {/* Hero */}
            <div style={{ position: 'relative', margin: '16px 16px 14px', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(135deg,#0a0a1f 0%,#0d0828 40%,#081520 100%)', border: '1px solid rgba(0,212,255,.15)' }}>
              <div style={{ position: 'absolute', top: 20, right: 20, width: 22, height: 22, background: 'rgba(0,212,255,.35)', transform: 'rotate(45deg)', animation: 'floatdiamond 3.5s ease-in-out infinite', borderRadius: 4 }} />
              <div style={{ position: 'absolute', bottom: 40, right: 50, width: 14, height: 14, background: 'rgba(0,212,255,.2)',  transform: 'rotate(45deg)', animation: 'floatdiamond 4.5s ease-in-out 1s infinite', borderRadius: 3 }} />
              <div style={{ position: 'absolute', top: 60, left: 24, width: 10, height: 10, background: 'rgba(124,58,237,.4)', transform: 'rotate(45deg)', animation: 'floatdiamond 3s ease-in-out .5s infinite', borderRadius: 2 }} />
              <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,212,255,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 2, padding: '28px 22px 8px' }}>
                <div style={{ fontSize: '0.68rem', color: 'rgba(0,212,255,.7)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4ff', animation: 'pulse 2s infinite' }} />
                  LIVE NOW
                </div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', marginBottom: 6 }}>
                  بث مباشر.<br /><span style={{ color: '#00d4ff' }}>بلا حدود.</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.4)', marginBottom: 22, lineHeight: 1.5 }}>تواصل مع آلاف الأشخاص فوراً</div>
                <button onClick={onStartRandomMatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', borderRadius: 16, padding: '14px 24px', color: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', animation: 'glow 3s infinite', letterSpacing: '-0.01em', marginBottom: 22 }}>
                  <VideoIcon /> ابدأ مكالمة الآن
                </button>
              </div>
              {/* Stats row */}
              <div style={{ position: 'relative', zIndex: 2, margin: '0 16px 20px', padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                {STATS.map((s, i) =>
                  s.divider
                    ? <div key={i} style={{ width: 1, height: 28, background: 'rgba(255,255,255,.07)' }} />
                    : <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#00d4ff', letterSpacing: '-0.03em' }}>{s.num}</div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.35)', marginTop: 1 }}>{s.label}</div>
                      </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setTab('match')} style={{ padding: '16px', borderRadius: 18, background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.2)', color: '#f0f0ff', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(124,58,237,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>اكتشف</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.35)' }}>تعرف على ناس جدد</div>
              </button>
              <button onClick={() => setTab('chats')} style={{ padding: '16px', borderRadius: 18, background: 'rgba(0,212,255,.07)', border: '1px solid rgba(0,212,255,.15)', color: '#f0f0ff', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(0,212,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                {totalUnread > 0 && <div style={{ position: 'absolute', top: 12, left: 12, background: '#00d4ff', borderRadius: 8, fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', color: '#06060f' }}>{totalUnread}</div>}
                <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>رسائلي</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.35)' }}>محادثاتك الخاصة</div>
              </button>
            </div>

            {/* Online strip */}
            <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>متصلون الآن</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.3)', cursor: 'pointer' }} onClick={() => setTab('match')}>عرض الكل</div>
            </div>
            <div style={{ display: 'flex', gap: 12, padding: '6px 16px 20px', overflowX: 'auto' }}>
              {DEMO_USERS.map(u => (
                <div key={u.id} onClick={() => setOpenChat({ id: u.id, full_name: u.name, username: u.name })} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: u.color + '22', border: `2.5px solid ${u.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>{u.flag}</div>
                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', background: '#4ade80', border: '2.5px solid #06060f' }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'rgba(255,255,255,.7)' }}>{u.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ MATCH TAB ══ */}
        {tab === 'match' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>اكتشف</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.35)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />{onlineCount} متصل
                </div>
              </div>
              <button onClick={onStartRandomMatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', borderRadius: 13, padding: '10px 16px', color: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                <VideoIcon /> ابدأ
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, padding: '0 16px 16px' }}>
              {DEMO_USERS.map((u, i) => (
                <div
                  key={u.id}
                  onClick={() => setOpenChat({ id: u.id, full_name: u.name, username: u.name })}
                  onMouseEnter={() => setActiveCard(u.id)}
                  onMouseLeave={() => setActiveCard(null)}
                  style={{ borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,.025)', border: `1px solid ${activeCard === u.id ? 'rgba(0,212,255,.4)' : 'rgba(255,255,255,.06)'}`, cursor: 'pointer', transition: 'all .2s', animation: `fadein .4s ${i * 0.07}s ease both` }}
                >
                  <div style={{ aspectRatio: '4/5', background: u.color + '10', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, color: u.match >= 90 ? '#4ade80' : '#f0f0ff', border: `1px solid ${u.match >= 90 ? 'rgba(74,222,128,.3)' : 'rgba(255,255,255,.1)'}` }}>{u.match}%</div>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', boxShadow: `0 0 28px ${u.color}50` }}>{u.flag}</div>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '3px 9px', fontSize: '0.62rem', color: '#4ade80', fontWeight: 600, border: '1px solid rgba(74,222,128,.15)' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />متصل
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.87rem', fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.3)', marginTop: 1 }}>{u.age} سنة</div>
                    </div>
                    <button style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)', color: '#00d4ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ CHATS TAB ══ */}
        {tab === 'chats' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ padding: '16px 16px 10px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 14 }}>الرسائل</div>
              <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.25)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ابحث…"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f0f0ff', fontFamily: 'inherit', fontSize: '0.87rem', direction: 'rtl' }}
                />
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conversations.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.22)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
                  مفيش محادثات بعد
                </div>
              )}
              {conversations
                .filter(c => !searchQuery || (c.profile.full_name || '').includes(searchQuery) || (c.profile.username || '').includes(searchQuery))
                .map((conv, i) => (
                  <div
                    key={conv.profile.id}
                    onClick={() => setOpenChat(conv.profile)}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', borderRadius: 18, background: 'rgba(255,255,255,.025)', border: `1px solid ${conv.unread ? 'rgba(0,212,255,.18)' : 'rgba(255,255,255,.05)'}`, cursor: 'pointer', animation: `fadein .35s ${i * 0.08}s ease both` }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 15, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.05rem', color: '#fff', overflow: 'hidden' }}>
                        {conv.profile.avatar_url
                          ? <img src={conv.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(conv.profile)}
                      </div>
                      <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#4ade80', border: '2.5px solid #06060f' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: conv.unread ? 700 : 500, marginBottom: 3 }}>{conv.profile.full_name || conv.profile.username || 'مستخدم'}</div>
                      <div style={{ fontSize: '0.76rem', color: conv.unread ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.lastMessage}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.22)' }}>{timeAgo(conv.lastTime)}</div>
                      {conv.unread > 0 && <div style={{ background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', borderRadius: 10, padding: '1px 7px', fontSize: '0.66rem', fontWeight: 700, color: '#fff' }}>{conv.unread}</div>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ══ PROFILE TAB ══ */}
        {tab === 'profile' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ position: 'relative', marginBottom: 64 }}>
              <div style={{ height: 130, background: 'linear-gradient(135deg,rgba(124,58,237,.3),rgba(0,212,255,.2),rgba(244,114,182,.15))', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg,transparent,transparent 30px,rgba(255,255,255,.015) 30px,rgba(255,255,255,.015) 60px)' }} />
                <div style={{ position: 'absolute', top: 12, right: 16, width: 18, height: 18, background: 'rgba(0,212,255,.4)', transform: 'rotate(45deg)', animation: 'floatdiamond 3.5s ease-in-out infinite', borderRadius: 3 }} />
              </div>
              <div style={{ position: 'absolute', bottom: -46, right: '50%', transform: 'translateX(50%)' }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', padding: 3, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#0d0d1e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {myProfile?.avatar_url
                      ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '2rem', fontWeight: 700 }}>{initials(myProfile)}</span>}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 20px 20px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{myProfile?.full_name || 'بدون اسم'}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,.35)', marginTop: 4 }}>@{myProfile?.username || 'username'}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {myProfile?.gender && (
                  <span style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '4px 12px', fontSize: '0.77rem' }}>
                    {myProfile.gender === 'male' ? '👨 ذكر' : '👩 أنثى'}
                  </span>
                )}
                <span style={{ background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 20, padding: '4px 12px', fontSize: '0.77rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />متصل
                </span>
              </div>
            </div>
            <div style={{ margin: '0 16px 16px', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {PROFILE_STATS.map((item, i) =>
                item.divider
                  ? <div key={i} style={{ width: 1, height: 36, background: 'rgba(255,255,255,.07)', margin: '0 20px' }} />
                  : <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(135deg,#a78bfa,#00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{item.num}</div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{item.label}</div>
                    </div>
              )}
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setShowSettings(true)} style={{ width: '100%', padding: '14px', borderRadius: 16, background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.18)', color: '#00d4ff', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <GearIcon /> الإعدادات
              </button>
              <button onClick={onLogout} style={{ width: '100%', padding: '14px', borderRadius: 16, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.18)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <LogoutIcon /> تسجيل الخروج
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 68, zIndex: 50, background: 'rgba(6,6,15,.97)', borderTop: '1px solid rgba(255,255,255,.06)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 'env(safe-area-inset-bottom,0)' }}>
        {NAV.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: tab === item.key ? '#00d4ff' : 'rgba(255,255,255,.28)', cursor: 'pointer', padding: '8px 20px', borderRadius: 14, fontFamily: 'inherit', transition: 'color .2s', position: 'relative' }}
          >
            {tab === item.key && (
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 2, borderRadius: '0 0 3px 3px', background: 'linear-gradient(90deg,#7c3aed,#00d4ff)' }} />
            )}
            <div style={{ position: 'relative' }}>
              {item.key === 'profile' ? <MyAvatar /> : item.icon}
              {(item.badge ?? 0) > 0 && (
                <div style={{ position: 'absolute', top: -5, left: -8, background: '#00d4ff', borderRadius: 8, fontSize: '0.58rem', fontWeight: 700, padding: '1px 4px', color: '#06060f', border: '2px solid #06060f' }}>
                  {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                </div>
              )}
            </div>
            <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
