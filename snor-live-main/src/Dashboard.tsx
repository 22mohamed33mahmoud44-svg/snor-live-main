import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ── Components ──────────────────────────────────────────────────
import { CoinsBalance } from './components/CoinsBalance';
import BuyCoins from './BuyCoins';
import EditProfileModal from './components/EditProfileModal';
import LiveStreamGrid from './components/LiveStreamGrid';
import VideoCall from './VideoCall';
import LiveStreamStudio from './components/LiveStreamStudio';
import ActiveLiveRoom from './components/ActiveLiveRoom';
import PrivateChat from './components/PrivateChat';
import SettingsPanel from './components/SettingsPanel';
import { SnorLiveLogo } from './components/icons/SnorLiveLogo';
import { GearIcon, VideoIcon, LogoutIcon, SearchIcon, HomeIcon, UsersIcon, ChatIcon } from './components/icons/Icons';

// ── Types, Utils & Constants ────────────────────────────────────
import type { Profile, ConvUser, ChatOther, MsgItem, DashboardProps, CallState, TabKey } from './types';
import { timeAgo, initials, playRadarSound } from './utils/helpers';
import { GLOBAL_CSS } from './constants/styles';

// ── MAIN DASHBOARD ───────────────────────────────────────────────
export default function Dashboard({ userId = 'me', onLogout = () => {} }: DashboardProps) {
  const [tab, setTab] = useState<TabKey>('home');
  const [category, setCategory] = useState<string>('all');
  const [conversations, setConversations] = useState<ConvUser[]>([]);
  const [myProfile, setMyProfile] = useState<Profile>({ id: userId, full_name: 'مستخدم سنور', username: 'snor_user' });
  const [openChat, setOpenChat] = useState<ChatOther | null>(null);
  const [activeCall, setActiveCall] = useState<CallState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuyCoins, setShowBuyCoins] = useState(false);
  const [matchGender, setMatchGender] = useState<string>('all');
  const [autoConnect, setAutoConnect] = useState<boolean>(false);

  // 🆕 البث المباشر (تم إضافة streamId لحفظ رقم البث على السيرفر)
  const [showLiveStudio, setShowLiveStudio] = useState(false);
  const [activeLiveStream, setActiveLiveStream] = useState<{ id: string, title: string; filterId: string } | null>(null);

  // ── Handlers ─────────────────────────────────────────────────
  const handleStartCall = useCallback((remoteId: string, type: 'video' | 'audio') => {
    playRadarSound();
    const GeneratedMatchId = `snor_call_${userId}_${remoteId}_${Date.now()}`;
    setActiveCall({ matchId: GeneratedMatchId, remoteUserId: remoteId, type });
  }, [userId]);

  // 🚀 دالة إطلاق البث المطورة للربط بقاعدة البيانات
  const handleLaunchLiveStream = async (title: string, filterId: string) => {
    // 1. تسجيل البث في Supabase عشان يظهر لكل المستخدمين في الرئيسية
    const { data, error } = await supabase
      .from('live_streams')
      .insert([
        { 
          user_id: userId, 
          title: title || 'بث مباشر جديد', 
          streamer_name: myProfile?.full_name || 'مستخدم سنور',
          is_live: true 
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("خطأ في تسجيل البث:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم. تأكد من جودة الإنترنت وحاول مجدداً.");
      return;
    }

    // 2. قفل الاستوديو وفتح غرفة البث الحقيقية بالـ ID الجديد
    setShowLiveStudio(false);
    setActiveLiveStream({ id: data.id, title, filterId });
  };

  // ── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) setMyProfile(data);
    });
  }, [userId]);

  const fetchConversations = useCallback(async () => {
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error || !msgs) return;

    const uniquePartnerIds = new Set<string>();
    const lastMessagesMap = new Map<string, MsgItem>();

    msgs.forEach((m) => {
      const partnerId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (!uniquePartnerIds.has(partnerId)) {
        uniquePartnerIds.add(partnerId);
        lastMessagesMap.set(partnerId, m);
      }
    });

    if (uniquePartnerIds.size === 0) { setConversations([]); return; }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, gender')
      .in('id', Array.from(uniquePartnerIds));

    if (profiles) {
      const convList: ConvUser[] = profiles.map((p) => {
        const lastMsgObj = lastMessagesMap.get(p.id);
        return {
          profile: p,
          lastMessage: lastMsgObj?.message ?? '',
          lastTime: lastMsgObj?.created_at ?? new Date().toISOString(),
          unread: lastMsgObj?.sender_id !== userId && !lastMsgObj?.read ? 1 : 0,
        };
      });
      setConversations(convList);
    }
  }, [userId]);

  useEffect(() => {
    fetchConversations();
    const channel = supabase
      .channel('dashboard-chats-tracker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  // ── Screen Router ─────────────────────────────────────────────
  if (activeCall) return <VideoCall userId={userId} matchId={activeCall.matchId} remoteUserId={activeCall.remoteUserId} onEnd={() => setActiveCall(null)} onNext={() => setActiveCall(null)} />;
  if (openChat) return <PrivateChat myId={userId} other={openChat} onBack={() => setOpenChat(null)} onStartCall={handleStartCall} />;
  if (showSettings) return <SettingsPanel onClose={() => setShowSettings(false)} myProfile={myProfile} onLogout={onLogout} onOpenEdit={() => { setShowSettings(false); setShowEditProfile(true); }} />;
  if (showEditProfile) return <EditProfileModal myProfile={myProfile} onClose={() => setShowEditProfile(false)} onProfileUpdated={(updated) => setMyProfile(updated)} />;
  if (showBuyCoins) return <BuyCoins onClose={() => setShowBuyCoins(false)} />;
  
  // 🚀 الغرفة الحية: تحديث السيرفر عند الإغلاق لتختفي من الشاشة الرئيسية
  if (activeLiveStream) {
    return (
      <ActiveLiveRoom 
        title={activeLiveStream.title} 
        filterId={activeLiveStream.filterId} 
        onEndStream={async () => {
          // إنهاء البث من الداتا بيس
          await supabase
            .from('live_streams')
            .update({ is_live: false })
            .eq('id', activeLiveStream.id);
            
          setActiveLiveStream(null);
        }} 
      />
    );
  }
  
  if (showLiveStudio) return <LiveStreamStudio onClose={() => setShowLiveStudio(false)} onStart={handleLaunchLiveStream} />;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#03030a', display: 'flex', flexDirection: 'column', direction: 'rtl', color: '#f0f0ff', overflow: 'hidden' }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Header ── */}
      <div style={{ padding: '0 16px', height: '64px', background: 'rgba(5,5,12,.5)', backdropFilter: 'blur(30px)', borderBottom: '1px solid rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 20 }}>
        <SnorLiveLogo />
        <div className="glass-capsule-header">
          <CoinsBalance />
          <button type="button" onClick={() => setShowBuyCoins(true)} className="btn-charge-small">+ شحن</button>
          <button type="button" onClick={() => setShowSettings(true)} className="header-icon-btn" title="الإعدادات">
            <GearIcon />
          </button>
          <div onClick={() => setTab('profile')} className={`header-avatar-btn ${tab === 'profile' ? 'active-border' : ''}`} title="حسابي">
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials(myProfile)
            }
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 95 }}>

        {/* HOME TAB */}
        {tab === 'home' && (
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
        )}

        {/* MATCH TAB */}
        {tab === 'match' && (
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
              <button type="button" onClick={() => handleStartCall('random_user', 'video')} className="btn-match-giant">
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
        )}

        {/* CHATS TAB */}
        {tab === 'chats' && (
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
              {conversations
                .filter(c => !searchQuery || (c.profile.full_name || '').includes(searchQuery) || (c.profile.username || '').includes(searchQuery))
                .map((conv) => (
                  <div key={conv.profile.id} onClick={() => setOpenChat(conv.profile)} className="chat-row-card" style={{ borderLeft: conv.unread ? '3px solid #00d4ff' : '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                      {conv.profile.avatar_url
                        ? <img src={conv.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initials(conv.profile)
                      }
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
                ))
              }
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <div className="tab-fadein">
            <div style={{ position: 'relative', marginBottom: 64 }}>
              <div className="profile-banner" />
              <div className="profile-avatar-outer">
                <div className="avatar-core">
                  {myProfile?.avatar_url
                    ? <img src={myProfile.avatar_url} alt="" />
                    : <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{initials(myProfile)}</span>
                  }
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 20px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{myProfile?.full_name || 'عضو سنور'}</h2>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,.4)', marginTop: 4 }}>@{myProfile?.username}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
                <span className="profile-tag">ذكر 👨</span>
                <span className="profile-tag active"><div className="dot" />حساب موثق</span>
              </div>
            </div>
            <div className="profile-stats-grid">
              <div><div className="val">2,450</div><div className="lbl">دقيقة بث</div></div>
              <div className="line" />
              <div><div className="val">540</div><div className="lbl">شاهدوا ملفك</div></div>
            </div>
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" onClick={() => setShowSettings(true)} className="profile-btn primary"><GearIcon /> إعدادات الحساب والمظهر</button>
              <button type="button" onClick={onLogout} className="profile-btn danger"><LogoutIcon /> تسجيل الخروج من التطبيق</button>
            </div>
          </div>
        )}
      </div>

      {/* ── FAB: زر البث العائم ── */}
      {tab === 'home' && (
        <button type="button" onClick={() => setShowLiveStudio(true)} className="fab-live-trigger-fixed" title="ابدأ بث مباشر الآن">
          <VideoIcon size={22} />
        </button>
      )}

      {/* ── Bottom Navigation ── */}
      <nav style={{ position: 'fixed', bottom: 12, left: 16, right: 16, height: 68, zIndex: 100, background: 'rgba(10,10,22,0.8)', backdropFilter: 'blur(30px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
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
  );
}