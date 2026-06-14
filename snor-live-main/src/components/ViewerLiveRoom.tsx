import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Heart, Users, Gift, Sparkles, UserPlus, UserCheck, Gem } from 'lucide-react';

interface ViewerLiveRoomProps {
  streamId: string;
  title: string;
  streamerName: string;
  /** معرف صاحب البث - مطلوب لتفعيل زرار المتابعة */
  streamerId?: string;
  myUserId: string;
  myUsername: string;
  myAvatarUrl?: string;
  /** الفيديو الحقيقي القادم من اتصال WebRTC (يتم تمريره من المكون الأب الذي يدير الاتصال) */
  remoteStream?: MediaStream | null;
  onExit: () => void;
}

interface ChatMessage {
  id: string;
  stream_id: string;
  user_id: string;
  username: string;
  message: string;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

interface GiftDef {
  id: string;
  emoji: string;
  name: string;
  cost: number;
}

interface GiftToast {
  id: number;
  senderName: string;
  emoji: string;
  giftName: string;
}

const MESSAGES_LIMIT = 30;
const HEART_EMOJIS = ['💖', '🔥', '✨', '❤️', '😍'];

const GIFTS: GiftDef[] = [
  { id: 'rose', emoji: '🌹', name: 'وردة', cost: 10 },
  { id: 'heart_box', emoji: '💝', name: 'علبة قلوب', cost: 50 },
  { id: 'crown', emoji: '👑', name: 'تاج', cost: 200 },
  { id: 'diamond', emoji: '💎', name: 'ماسة', cost: 500 },
  { id: 'rocket', emoji: '🚀', name: 'صاروخ', cost: 1000 },
  { id: 'car', emoji: '🏎️', name: 'سيارة فخمة', cost: 5000 },
];

export default function ViewerLiveRoom({
  streamId, title, streamerName, streamerId, myUserId, myUsername, myAvatarUrl, remoteStream, onExit
}: ViewerLiveRoomProps) {

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [viewersCount, setViewersCount] = useState(1);
  const [likesCount, setLikesCount] = useState(0);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);

  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  const [gemsBalance, setGemsBalance] = useState<number | null>(null);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [giftToast, setGiftToast] = useState<GiftToast | null>(null);

  const [sparkleBurstKey, setSparkleBurstKey] = useState(0);

  const [toast, setToast] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  // ── دالة موحّدة لإطلاق setTimeout مع تنظيفه تلقائيًا عند الخروج ──
  const safeTimeout = useCallback((cb: () => void, ms: number) => {
    const id = window.setTimeout(cb, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    safeTimeout(() => setToast(null), 2500);
  }, [safeTimeout]);

  // ── ربط الفيديو الحقيقي القادم من WebRTC ──
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream ?? null;
    }
  }, [remoteStream]);

  // ── جلب الرسائل القديمة + الاشتراك في الشات اللايف + عدد المشاهدين الحقيقي ──
  useEffect(() => {
    let isMounted = true;

    const fetchOldMessages = async () => {
      const { data, error } = await supabase
        .from('stream_chat')
        .select('*')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true })
        .limit(MESSAGES_LIMIT);

      if (error) {
        if (isMounted) showToast('تعذر تحميل الرسائل');
        return;
      }
      if (data && isMounted) {
        setMessages(data as ChatMessage[]);
        safeTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
      }
    };

    fetchOldMessages();

    // قناة الشات (Postgres Changes)
    const chatChannel = supabase.channel(`live-chat-${streamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat', filter: `stream_id=eq.${streamId}` }, (payload) => {
        if (isMounted) {
          setMessages(prev => [...prev.slice(-(MESSAGES_LIMIT - 1)), payload.new as ChatMessage]);
          safeTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      })
      .subscribe();

    // قناة الحضور (Presence) لحساب عدد المشاهدين الحقيقي
    const presenceChannel = supabase.channel(`presence-${streamId}`, {
      config: { presence: { key: myUserId } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (!isMounted) return;
        const state = presenceChannel.presenceState();
        setViewersCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          presenceChannel.track({ user_id: myUserId, username: myUsername, online_at: new Date().toISOString() });
        }
      });

    // قناة التفاعلات المشتركة (لايكات + هدايا + ردود فعل خاصة) عبر Broadcast
    const roomChannel = supabase.channel(`room-${streamId}`, {
      config: { broadcast: { self: true } },
    });

    roomChannel
      .on('broadcast', { event: 'like' }, ({ payload }) => {
        if (!isMounted) return;
        setLikesCount(prev => prev + 1);
        spawnHeart(payload?.x);
      })
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        if (!isMounted) return;
        showGiftToast(payload?.senderName, payload?.emoji, payload?.giftName);
        spawnHeart(undefined, payload?.emoji);
      })
      .on('broadcast', { event: 'super' }, () => {
        if (!isMounted) return;
        triggerSparkleBurst();
      })
      .subscribe();

    roomChannelRef.current = roomChannel;

    // جلب عدد اللايكات الابتدائي من جدول البث (إن وُجد عمود likes_count)
    supabase
      .from('live_streams')
      .select('likes_count')
      .eq('id', streamId)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted && data?.likes_count != null) setLikesCount(data.likes_count);
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(roomChannel);
      timeoutsRef.current.forEach(id => window.clearTimeout(id));
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  // ── جلب رصيد الجواهر وحالة المتابعة ──
  useEffect(() => {
    let isMounted = true;

    supabase
      .from('users_coins')
      .select('coins')
      .eq('user_id', myUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) setGemsBalance(data?.coins ?? 0);
      });

    if (streamerId && streamerId !== myUserId) {
      supabase
        .from('follows')
        .select('id')
        .eq('follower_id', myUserId)
        .eq('following_id', streamerId)
        .maybeSingle()
        .then(({ data }) => {
          if (isMounted) setIsFollowing(!!data);
        });
    }

    return () => { isMounted = false; };
  }, [myUserId, streamerId]);

  // ── إرسال رسالة في الشات ──
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    setNewMessage('');

    const { error } = await supabase
      .from('stream_chat')
      .insert([{ stream_id: streamId, user_id: myUserId, username: myUsername || 'متابع', message: text }]);

    setSending(false);

    if (error) {
      showToast('فشل إرسال الرسالة، حاول مرة أخرى');
      setNewMessage(text); // رجّع النص للمستخدم عشان يحاول تاني
    }
  };

  // ── إضافة قلب طائر على الشاشة (تأثير بصري فقط) ──
  const spawnHeart = useCallback((clientX?: number, emoji?: string) => {
    const heart: FloatingHeart = {
      id: Date.now() + Math.random(),
      x: clientX !== undefined ? (clientX / window.innerWidth) * 100 : 75 + Math.random() * 10,
      y: Math.random() * 20,
      emoji: emoji ?? HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
    };
    setFloatingHearts(prev => [...prev, heart]);
    safeTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== heart.id)), 2000);
  }, [safeTimeout]);

  // ── إرسال لايك (متزامن مع جميع المشاهدين) ──
  const sendLike = useCallback((clientX?: number) => {
    roomChannelRef.current?.send({ type: 'broadcast', event: 'like', payload: { x: clientX } });
    // تحديث تراكمي بسيط لعدد اللايكات في الباك إند (best effort)
    supabase.rpc('increment_stream_likes', { stream_id_input: streamId }).then(() => {});
  }, [streamId]);

  // الضغط في أي مكان في الشاشة = لايك
  const handleScreenTap = (e: React.MouseEvent) => {
    sendLike(e.clientX);
  };

  // ── المتابعة / إلغاء المتابعة ──
  const toggleFollow = async () => {
    if (!streamerId || streamerId === myUserId || followLoading) return;
    setFollowLoading(true);

    if (isFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', myUserId)
        .eq('following_id', streamerId);
      if (!error) setIsFollowing(false);
      else showToast('تعذر إلغاء المتابعة');
    } else {
      const { error } = await supabase
        .from('follows')
        .insert([{ follower_id: myUserId, following_id: streamerId }]);
      if (!error) {
        setIsFollowing(true);
        showToast(`تمت متابعة ${streamerName}`);
      } else {
        showToast('تعذر إتمام المتابعة');
      }
    }

    setFollowLoading(false);
  };

  // ── إظهار بانر الهدية لكل المشاهدين ──
  const showGiftToast = (senderName: string, emoji: string, giftName: string) => {
    const id = Date.now() + Math.random();
    setGiftToast({ id, senderName, emoji, giftName });
    safeTimeout(() => setGiftToast(prev => (prev?.id === id ? null : prev)), 3000);
  };

  // ── إرسال هدية ──
  const sendGift = async (gift: GiftDef) => {
    if (gemsBalance === null) {
      showToast('جاري تحميل رصيدك...');
      return;
    }
    if (gemsBalance < gift.cost) {
      showToast('رصيدك من الجواهر غير كافٍ');
      setShowGiftPanel(false);
      return;
    }

    setShowGiftPanel(false);

    // خصم محلي فوري (Optimistic) + خصم فعلي عبر RPC
    setGemsBalance(prev => (prev !== null ? prev - gift.cost : prev));

    const { error } = await supabase.rpc('send_stream_gift', {
      stream_id_input: streamId,
      receiver_id_input: streamerId ?? null,
      gift_type_input: gift.id,
      coins_cost_input: gift.cost,
    });

    if (error) {
      // رجّع الرصيد لو فشلت العملية
      setGemsBalance(prev => (prev !== null ? prev + gift.cost : prev));
      showToast('تعذر إرسال الهدية، حاول مرة أخرى');
      return;
    }

    roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'gift',
      payload: { senderName: myUsername, emoji: gift.emoji, giftName: gift.name },
    });
  };

  // ── تأثير خاص (Super Reaction) يُبث لكل المشاهدين ──
  const triggerSparkleBurst = useCallback(() => {
    setSparkleBurstKey(k => k + 1);
    safeTimeout(() => setSparkleBurstKey(0), 1600);
  }, [safeTimeout]);

  const sendSparkle = () => {
    roomChannelRef.current?.send({ type: 'broadcast', event: 'super', payload: {} });
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh', margin: 0, padding: 0,
        background: '#05050c', zIndex: 2147483647,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        direction: 'rtl', fontFamily: "'Cairo', sans-serif"
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px', height: '100%', background: '#000', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}>

        {/* ── فيديو البث الحقيقي ── */}
        <div onClick={handleScreenTap} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer', background: '#000' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              display: remoteStream ? 'block' : 'none',
            }}
          />

          {!remoteStream && (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(to bottom, #110e26, #03030a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}
                style={{ width: 85, height: 85, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Users size={32} style={{ color: '#00d4ff' }} />
              </motion.div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 14, fontWeight: 700 }}>جاري الاتصال بالبث...</span>
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 20%, transparent 50%, rgba(0,0,0,0.95) 100%)', pointerEvents: 'none' }} />
        </div>

        {/* ── طبقة القلوب المتطايرة ── */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' }}>
          <AnimatePresence>
            {floatingHearts.map((heart) => (
              <motion.div key={heart.id}
                initial={{ opacity: 1, y: 0, scale: 0.5, x: 0 }}
                animate={{ opacity: 0, y: -400 - heart.y, scale: 1.5, x: (Math.random() - 0.5) * 60 }}
                transition={{ duration: 1.2 + Math.random() * 0.5, ease: "easeOut" }}
                style={{ position: 'absolute', bottom: '15%', left: `${heart.x}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 10px rgba(255,42,116,0.8))' }}
              >
                {heart.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ── تأثير خاص (Super Reaction) ── */}
        <AnimatePresence>
          {sparkleBurstKey > 0 && (
            <motion.div
              key={sparkleBurstKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6 }}
              style={{ position: 'absolute', inset: 0, zIndex: 25, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 1.4, 1.1], opacity: [0, 1, 0] }}
                transition={{ duration: 1.6, ease: 'easeOut' }}
                style={{ fontSize: '6rem', filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.9))' }}
              >
                ✨🎉✨
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── بانر الهدية ── */}
        <AnimatePresence>
          {giftToast && (
            <motion.div
              key={giftToast.id}
              initial={{ opacity: 0, y: -40, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -40, x: '-50%' }}
              style={{
                position: 'absolute', top: 'calc(env(safe-area-inset-top) + 70px)', left: '50%',
                zIndex: 30, background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(168,85,247,0.5)',
                borderRadius: '50px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8,
                backdropFilter: 'blur(16px)', whiteSpace: 'nowrap'
              }}
            >
              <span style={{ fontSize: '1.4rem' }}>{giftToast.emoji}</span>
              <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}>
                {giftToast.senderName} أرسل/ت {giftToast.giftName}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── توست الأخطاء/الإشعارات ── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 20, x: '-50%' }}
              style={{
                position: 'absolute', bottom: '230px', left: '50%', zIndex: 30,
                background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                padding: '8px 16px', borderRadius: '50px', backdropFilter: 'blur(10px)', whiteSpace: 'nowrap'
              }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── الواجهة العائمة ── */}
        <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box', pointerEvents: 'none' }}>

          {/* الهيدر العلوي */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'env(safe-area-inset-top)', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.45)', padding: '4px 14px 4px 4px', borderRadius: '50px', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>
                {streamerName?.[0]?.toUpperCase() ?? '🎙️'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{streamerName}</span>
              </div>

              {streamerId && streamerId !== myUserId && (
                <button
                  onClick={toggleFollow}
                  disabled={followLoading || isFollowing === null}
                  style={{
                    marginLeft: 4,
                    background: isFollowing ? 'rgba(255,255,255,0.12)' : '#ff2a74',
                    border: isFollowing ? '1px solid rgba(255,255,255,0.25)' : 'none',
                    color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                    cursor: followLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    opacity: followLoading ? 0.6 : 1,
                  }}
                >
                  {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
                  {isFollowing ? 'متابع' : 'متابعة'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 14px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(20px)' }}>
                <Users size={12} style={{ color: '#00d4ff' }} /> {viewersCount}
              </div>
              <div style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 14px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(20px)' }}>
                <Heart size={12} style={{ color: '#ff2a74' }} fill="currentColor" /> {likesCount}
              </div>
              <button onClick={onExit} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* القسم السفلي */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', paddingBottom: 'env(safe-area-inset-bottom)', pointerEvents: 'auto' }}>
            <h1 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 900, padding: '0 6px', margin: 0 }}>{title}</h1>

            <div style={{ height: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: '4px' }} className="custom-scrollbar cursor-default">
              <div style={{ flex: 1 }} />
              {messages.map((msg) => (
                <div key={msg.id} style={{ alignSelf: 'flex-start', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '14px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '85%' }}>
                  {msg.user_id === myUserId && myAvatarUrl ? (
                    <img src={myAvatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : null}
                  <span style={{ color: msg.user_id === myUserId ? '#ff2a74' : '#00d4ff', fontSize: '0.75rem', fontWeight: 900 }}>{msg.username}:</span>
                  <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{msg.message}</span>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <form onSubmit={handleSendMessage} style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="شارك في البث..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50px', padding: '12px 40px 12px 46px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                />
                <button type="submit" disabled={sending} style={{ position: 'absolute', left: 6, background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', border: 'none', width: 36, height: 36, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}>
                  <Send size={15} />
                </button>
              </form>

              <button type="button" onClick={() => setShowGiftPanel(v => !v)} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Gift size={20} />
              </button>

              <button type="button" onClick={sendSparkle} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Sparkles size={20} />
              </button>

              <button type="button" onClick={() => sendLike()} style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #ff2a74, #ff5388)', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Heart size={18} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>

        {/* ── لوحة الهدايا ── */}
        <AnimatePresence>
          {showGiftPanel && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowGiftPanel(false)}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
              />
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 41,
                  background: '#0f0e1c', borderTopLeftRadius: 22, borderTopRightRadius: 22,
                  padding: '18px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)',
                  border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>الهدايا</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 12px' }}>
                    <Gem size={14} style={{ color: '#00d4ff' }} />
                    <span style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 800 }}>{gemsBalance ?? '...'}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {GIFTS.map(gift => {
                    const affordable = gemsBalance !== null && gemsBalance >= gift.cost;
                    return (
                      <button
                        key={gift.id}
                        onClick={() => sendGift(gift)}
                        disabled={!affordable}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 14, padding: '12px 6px', cursor: affordable ? 'pointer' : 'default',
                          opacity: affordable ? 1 : 0.4,
                        }}
                      >
                        <span style={{ fontSize: '1.8rem' }}>{gift.emoji}</span>
                        <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 800 }}>{gift.name}</span>
                        <span style={{ color: '#00d4ff', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Gem size={10} /> {gift.cost}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </motion.div>,
    document.body
  );
}
