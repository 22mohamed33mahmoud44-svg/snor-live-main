import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { supabase } from './supabase';
import { createPortal } from 'react-dom';

// ── Components ──────────────────────────────────────────────────
import { CoinsBalance } from './components/CoinsBalance';
import BuyCoins from './BuyCoins';
import EditProfileModal from './components/EditProfileModal';
import LiveStreamGrid from './components/LiveStreamGrid';
import VideoCall from './VideoCall';
import RandomMatch from './RandomMatch';
import LiveStreamStudio from './components/LiveStreamStudio';
import ActiveLiveRoom from './components/ActiveLiveRoom';
import PrivateChat from './components/PrivateChat';
import SettingsPanel from './components/SettingsPanel';
import { SnorLiveLogo } from './components/icons/SnorLiveLogo';
import { GearIcon, VideoIcon, LogoutIcon, SearchIcon, HomeIcon, UsersIcon, ChatIcon } from './components/icons/Icons';

// ── Types, Utils & Constants ────────────────────────────────────
import type { Profile, ConvUser, ChatOther, DashboardProps, CallState, TabKey } from './types';
import { timeAgo, initials, playRadarSound } from './utils/helpers';
import { GLOBAL_CSS } from './constants/styles';

// ── MAIN DASHBOARD ───────────────────────────────────────────────
export default function Dashboard({ userId = 'me', onLogout = () => {} }: DashboardProps) {
  // ── Phase 11: New feature states ──
  useOnlineStatus();

  // ⚡ تم نقل الحالات (States) الفرعية للمكونات الخاصة بها، وبقيت الحالات العامة فقط هنا
  const [tab, setTab] = useState<TabKey>('home');
  const [myProfile, setMyProfile] = useState<Profile>({ id: userId, full_name: 'مستخدم سنور', username: 'snor_user' });
  
  const [openChat, setOpenChat] = useState<ChatOther | null>(null);
  const [activeCall, setActiveCall] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ id: string; callerId: string; type: 'video' | 'audio' } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ id: string; remoteId: string; type: 'video' | 'audio'; startedAt: number } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [showRandomMatch, setShowRandomMatch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showBuyCoins, setShowBuyCoins] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0); // للعداد أسفل الشاشة

  // 🆕 البث المباشر
  const [showLiveStudio, setShowLiveStudio] = useState(false);
  const [activeLiveStream, setActiveLiveStream] = useState<{ id: string, title: string; filterId: string; stream?: MediaStream | null } | null>(null);

  // ── Handlers ─────────────────────────────────────────────────
  // A direct call is a pending database invitation, not a client-generated LiveKit room.
  const handleStartCall = useCallback(async (remoteId: string, type: 'video' | 'audio') => {
    setCallError(null);
    const { data: matchId, error } = await supabase.rpc('create_direct_call', { p_callee: remoteId, p_type: type });
    if (error || !matchId) {
      console.error('Could not create direct call', error);
      setCallError('تعذر بدء المكالمة. تأكد من وجود محادثة سابقة مع المستخدم وأنه غير مشغول.');
      return;
    }
    playRadarSound();
    setOutgoingCall({ id: String(matchId), remoteId, type, startedAt: Date.now() });
  }, []);

  // Incoming invitations: filtered realtime plus polling if the websocket is unavailable.
  useEffect(() => {
    let cancelled = false;
    if (activeCall || outgoingCall) return;

    const checkIncoming = async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from('matches')
        .select('id, user1, call_type')
        .eq('kind', 'direct')
        .eq('status', 'pending')
        .eq('user2', userId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && !error) {
        setIncomingCall(data ? { id: data.id, callerId: data.user1, type: data.call_type === 'audio' ? 'audio' : 'video' } : null);
      }
    };

    void checkIncoming();
    const interval = setInterval(() => { void checkIncoming(); }, 4000);
    const channel = supabase.channel(`incoming-direct-calls-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'matches',
        filter: `user2=eq.${userId}`,
      }, () => { void checkIncoming(); })
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [userId, activeCall, outgoingCall]);

  // Do not request a LiveKit token until the recipient has explicitly accepted.
  useEffect(() => {
    if (!outgoingCall) return;
    let cancelled = false;
    const checkOutgoing = async () => {
      const { data, error } = await supabase.from('matches')
        .select('status')
        .eq('id', outgoingCall.id)
        .eq('kind', 'direct')
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.status === 'active') {
        setOutgoingCall(null);
        setOpenChat(null);
        setActiveCall({ matchId: outgoingCall.id, remoteUserId: outgoingCall.remoteId, type: outgoingCall.type });
      } else if (!error && (!data || data.status === 'ended')) {
        setOutgoingCall(null);
        setCallError('المكالمة رُفضت أو أُلغيت.');
      } else if (Date.now() - outgoingCall.startedAt > 2 * 60 * 1000) {
        setOutgoingCall(null);
        setCallError('انتهت مهلة انتظار الرد على المكالمة.');
        void supabase.from('matches').update({ status: 'ended' })
          .eq('id', outgoingCall.id).in('status', ['pending', 'active']);
      }
    };
    void checkOutgoing();
    const interval = setInterval(() => { void checkOutgoing(); }, 2000);
    const channel = supabase.channel(`outgoing-direct-call-${outgoingCall.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `id=eq.${outgoingCall.id}`,
      }, () => { void checkOutgoing(); })
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [outgoingCall]);

  const respondToCall = async (accept: boolean) => {
    const invitation = incomingCall;
    if (!invitation) return;
    setIncomingCall(null);
    const { data, error } = await supabase.rpc('respond_direct_call', {
      p_match_id: invitation.id,
      p_accept: accept,
    });
    if (error || !data) {
      setCallError('تعذر الرد على المكالمة؛ ربما انتهت المهلة.');
      return;
    }
    if (accept) {
      setOpenChat(null);
      setActiveCall({ matchId: invitation.id, remoteUserId: invitation.callerId, type: invitation.type });
    }
  };

  const cancelOutgoingCall = async () => {
    const invitation = outgoingCall;
    if (!invitation) return;
    setOutgoingCall(null);
    const { error } = await supabase.from('matches')
      .update({ status: 'ended' })
      .eq('id', invitation.id)
      .in('status', ['pending', 'active']);
    if (error) console.error('Could not cancel direct call', error);
  };

  const callOverlay = (incomingCall || outgoingCall || callError) && typeof document !== 'undefined'
    ? createPortal(
      <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div role="dialog" aria-modal="true" aria-label="المكالمات" style={{ width: 'min(420px,100%)', padding: 26, borderRadius: 22, background: '#17152b', color: 'white', textAlign: 'center', boxShadow: '0 15px 70px #0008' }}>
          {incomingCall ? (
            <>
              <h3>{incomingCall.type === 'audio' ? 'مكالمة صوتية واردة' : 'مكالمة فيديو واردة'}</h3>
              <p>هناك مستخدم يطلب مكالمة معك. هل تريد قبولها؟</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button type="button" onClick={() => { void respondToCall(true); }}>قبول</button>
                <button type="button" onClick={() => { void respondToCall(false); }}>رفض</button>
              </div>
            </>
          ) : outgoingCall ? (
            <>
              <h3>بانتظار رد الطرف الآخر</h3>
              <p>سيبدأ الاتصال بعد قبول الدعوة.</p>
              <button type="button" onClick={() => { void cancelOutgoingCall(); }}>إلغاء الاتصال</button>
            </>
          ) : (
            <>
              <p role="alert">{callError}</p>
              <button type="button" onClick={() => setCallError(null)}>حسناً</button>
            </>
          )}
        </div>
      </div>,
      document.body,
    ) : null;

  const handleLaunchLiveStream = async (title: string, filterId: string, _intensity?: number, stream?: MediaStream | null) => {
    const { data, error } = await supabase
      .from('live_streams')
      .insert([
        {
          user_id: String(userId),
          title: title || 'بث مباشر جديد',
          streamer_name: myProfile?.full_name || 'مستخدم سنور',
          is_live: true,
        }
      ]).select().single();

    if (error) {
      console.error("خطأ في تسجيل البث:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم. تأكد من جودة الإنترنت وحاول مجدداً.");
      return;
    }

    setShowLiveStudio(false);
    setActiveLiveStream({ id: data.id, title, filterId, stream });
  };

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) setMyProfile(data);
    });
  }, [userId]);

  // ── Screen Router ─────────────────────────────────────────────
  if (activeCall) return <VideoCall userId={userId} matchId={activeCall.matchId} callType={activeCall.type} onEnd={() => setActiveCall(null)} onNext={() => { setActiveCall(null); setShowRandomMatch(true); }} />;
  if (showRandomMatch) return <><RandomMatch userId={userId} onClose={() => setShowRandomMatch(false)} onMatch={(match) => { setShowRandomMatch(false); const remoteUserId = match.user1 === userId ? match.user2 : match.user1; setActiveCall({ matchId: match.id, remoteUserId, type: 'video' }); }} />{callOverlay}</>;
  if (openChat) return <><PrivateChat myId={userId} other={openChat} onBack={() => setOpenChat(null)} onStartCall={handleStartCall} />{callOverlay}</>;
  if (showSettings) return <><SettingsPanel onClose={() => setShowSettings(false)} myProfile={myProfile} onLogout={onLogout} onOpenEdit={() => { setShowSettings(false); setShowEditProfile(true); }} />{callOverlay}</>;
  if (showEditProfile) return <><EditProfileModal myProfile={myProfile} onClose={() => setShowEditProfile(false)} onProfileUpdated={(updated) => setMyProfile(updated)} />{callOverlay}</>;
  if (showBuyCoins) return <><BuyCoins onClose={() => setShowBuyCoins(false)} />{callOverlay}</>;
  
  if (activeLiveStream) {
    return (
      <>
      <ActiveLiveRoom streamId={activeLiveStream.id} title={activeLiveStream.title} filterId={activeLiveStream.filterId} initialStream={activeLiveStream.stream} myUserId={userId} myUsername={myProfile?.full_name || "مستضيف البث"}
        onEndStream={async () => {
          await supabase.from('live_streams').update({ is_live: false }).eq('id', activeLiveStream.id);
          setActiveLiveStream(null);
        }} 
      />
      {callOverlay}
      </>
    );
  }
  
  if (showLiveStudio) return <><LiveStreamStudio onClose={() => setShowLiveStudio(false)} onStart={handleLaunchLiveStream} />{callOverlay}</>;

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
    <div className="dashboard-shell">
      <style>{GLOBAL_CSS}</style>

      {/* ── Header ── */}
      <div className="dashboard-header">
        <SnorLiveLogo />
        <div className="glass-capsule-header">
          <CoinsBalance />
          <button type="button" onClick={() => setShowBuyCoins(true)} className="btn-charge-small">+ شحن</button>
          <button type="button" onClick={() => setShowSettings(true)} className="header-icon-btn" title="الإعدادات">
            <GearIcon />
          </button>
          <div onClick={() => setTab('profile')} className={`header-avatar-btn ${tab === 'profile' ? 'active-border' : ''}`} title="حسابي">
            {myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(myProfile)}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="dashboard-content">
        {tab === 'home' && <HomeTab />}
        {tab === 'match' && <MatchTab onStartRandomMatch={() => setShowRandomMatch(true)} />}
        {tab === 'chats' && <ChatsTab userId={userId} onOpenChat={setOpenChat} onUnreadUpdate={setTotalUnread} />}
        {tab === 'profile' && <ProfileTab myProfile={myProfile} onLogout={onLogout} onOpenSettings={() => setShowSettings(true)} />}
      </div>

      {/* ── FAB ── */}
      {tab === 'home' && (
        <button type="button" onClick={() => setShowLiveStudio(true)} className="fab-live-trigger-fixed" title="ابدأ بث مباشر الآن">
          <VideoIcon size={22} />
        </button>
      )}

      {/* ── Bottom Navigation ── */}
      <nav className="dashboard-bottom-nav">
        {[
          { key: 'home',  label: 'الرئيسية', icon: <HomeIcon /> },
          { key: 'match', label: 'اكتشف',    icon: <UsersIcon /> },
          { key: 'chats', label: 'رسائل',    icon: <ChatIcon />, badge: totalUnread },
        ].map(item => (
          <button key={item.key} type="button" onClick={() => setTab(item.key as TabKey)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: tab === item.key ? '#00d4ff' : 'rgba(255,255,255,.35)', cursor: 'pointer', padding: '8px 24px', position: 'relative', fontFamily: 'inherit' }}>
            {tab === item.key && <div className="nav-active-bar" />}
            <div style={{ position: 'relative' }}>
              {item.icon}
              {(item.badge ?? 0) > 0 && <div className="nav-badge-dot">{(item.badge ?? 0) > 9 ? '9+' : item.badge}</div>}
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
    {callOverlay}
    </>
  );
}


// ─────────────────────────────────────────────────────────────────
// 🚀 المكونات المعزولة (لضمان السلاسة ومنع الـ Re-render الشامل)
// ─────────────────────────────────────────────────────────────────

const HomeTab = memo(() => {
  const [category, setCategory] = useState<string>('all');
  return (
    <div className="tab-fadein" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: '14px', marginBottom: '8px' }}>
        {[
          { key: 'all', label: '🔥 الكل' },
          { key: 'hd', label: '🎥 كاميرا HD' },
          { key: 'global', label: '🌍 دولي' }
        ].map(cat => (
          <button key={cat.key} onClick={() => setCategory(cat.key)} className={`category-badge ${category === cat.key ? 'active' : ''}`}>
            {cat.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>بث مباشر الآن 🔥</h3>
      </div>
      <LiveStreamGrid />
    </div>
  );
});

const MatchTab = memo(({ onStartRandomMatch }: { onStartRandomMatch: () => void }) => {
  const [matchGender, setMatchGender] = useState<string>('all');
  const [autoConnect, setAutoConnect] = useState<boolean>(false);
  return (
    <div className="tab-fadein match-centered-container">
      <div className="gender-selector-bar">
        {[
          { key: 'all', label: '🌍 الكل' },
          { key: 'female', label: '👩 إناث' },
          { key: 'male', label: '👨 ذكور' }
        ].map(g => (
          <button key={g.key} onClick={() => setMatchGender(g.key)} className={`gender-btn ${matchGender === g.key ? 'active' : ''}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="radar-glow-container">
        <div className="pulse-ring ring-1" />
        <div className="pulse-ring ring-2" />
        <div className="pulse-ring ring-3" />
        <button type="button" onClick={onStartRandomMatch} className="btn-match-giant">
          <div className="inner-glow-circle">
            <VideoIcon size={36} />
            <span style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 10 }}>ابدأ المطابقة</span>
          </div>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, background: 'rgba(255,255,255,0.02)', padding: '10px 16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>تخطي تلقائي للمخدم التالي</span>
        <input type="checkbox" checked={autoConnect} onChange={() => setAutoConnect(!autoConnect)} className="ios-switch" />
      </div>
    </div>
  );
});

const ChatsTab = memo(({ userId, onOpenChat, onUnreadUpdate }: { userId: string, onOpenChat: (p: any) => void, onUnreadUpdate: (u: number) => void }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<ConvUser[]>([]);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🚀 السحب الخارق للأداء باستخدام الدالة (RPC) الجديدة
  const fetchConversations = useCallback(async () => {
    const { data: convStats, error } = await supabase.rpc('get_user_conversations', { p_user_id: String(userId) });

    if (error || !convStats || convStats.length === 0) {
      setConversations([]);
      onUnreadUpdate(0);
      return;
    }

    const partnerIds = convStats.map((c: { partner_id: string }) => c.partner_id);
    // H4: قراءة بيانات المستخدمين الآخرين تتم عبر view الأعمدة الآمنة فقط
    const { data: profiles } = await supabase.from('public_profiles').select('id, username, full_name, avatar_url, gender').in('id', partnerIds);

    if (profiles) {
      const convList: ConvUser[] = profiles.map(p => {
        const stat = convStats.find((s: { partner_id: string }) => s.partner_id === p.id);
        return {
          profile: p,
          lastMessage: stat?.last_message ?? '',
          lastTime: stat?.last_time ?? new Date().toISOString(),
          unread: Number(stat?.unread_count || 0)
        };
      }).sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());

      setConversations(convList);
      onUnreadUpdate(convList.reduce((acc, c) => acc + c.unread, 0));
    }
  }, [userId, onUnreadUpdate]);

  useEffect(() => {
    fetchConversations();

    // 🚀 مرشح على مستوى السيرفر: نستقبل فقط الرسائل الواردة إليّ أنا،
    // بدلاً من الاستماع لكل رسائل التطبيق وإعادة الجلب عند كل رسالة عالمية.
    // (رسائلي المُرسلة لا تحتاج استماعاً هنا: التبويب يُعاد تحميله عند العودة من الشات)
    const scheduleRefetch = () => {
      // ⏱️ Debounce: دفعة رسائل متتالية = عملية جلب واحدة فقط
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(fetchConversations, 400);
    };

    const channel = supabase.channel(`chats-tracker-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${String(userId)}` },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, userId]);

  const filteredConvs = conversations.filter(c => !searchQuery || (c.profile.full_name || '').includes(searchQuery) || (c.profile.username || '').includes(searchQuery));

  return (
    <div className="tab-fadein" style={{ padding: '16px 0' }}>
      <div style={{ padding: '0 16px 16px' }}>
        <div className="search-box">
          <SearchIcon />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ابحث في محادثاتك الخاصة..." />
        </div>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {conversations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,.2)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>💬</div>
            صندوق الرسائل فارغ حالياً.
          </div>
        )}
        {filteredConvs.map((conv) => (
          <div key={conv.profile.id} onClick={() => onOpenChat(conv.profile)} className="chat-row-card" style={{ borderLeft: conv.unread ? '3px solid #00d4ff' : '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {conv.profile.avatar_url ? <img src={conv.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(conv.profile)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>{conv.profile.full_name || conv.profile.username || 'مستخدم'}</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.lastMessage}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>{timeAgo(conv.lastTime)}</span>
              {conv.unread > 0 && <span className="unread-badge-counter">جديد</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const ProfileTab = memo(({ myProfile, onLogout, onOpenSettings }: { myProfile: Profile, onLogout: () => void, onOpenSettings: () => void }) => (
  <div className="tab-fadein">
    <div style={{ position: 'relative', marginBottom: 64 }}>
      <div className="profile-banner" />
      <div className="profile-avatar-outer">
        <div className="avatar-core">
          {myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{initials(myProfile)}</span>}
        </div>
      </div>
    </div>
    <div style={{ textAlign: 'center', padding: '0 20px' }}>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{myProfile?.full_name || 'عضو سنور'}</h2>
      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,.4)', marginTop: 4 }}>@{myProfile?.username}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
        <span className="profile-tag">{myProfile?.gender === 'female' ? '👩 أنثى' : '👨 ذكر'}</span>
      </div>
    </div>
    <div className="profile-stats-grid">
      <div><div className="val">0</div><div className="lbl">دقيقة بث</div></div>
      <div className="line" />
      <div><div className="val">0</div><div className="lbl">شاهدوا ملفك</div></div>
    </div>
    <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" onClick={onOpenSettings} className="profile-btn primary"><GearIcon /> إعدادات الحساب والمظهر</button>
      <button type="button" onClick={onLogout} className="profile-btn danger"><LogoutIcon /> تسجيل الخروج من التطبيق</button>
    </div>
  </div>
));
