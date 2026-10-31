import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabase';
import { createCallMessageSender } from '../../utils/callMessageSender';
import { createStreamLikeBatcher } from '../../utils/streamLikeBatcher';
import { addStreamLikeBatch, reconcileStreamLikeSnapshot, safeStreamLikeBatchCount } from '../../utils/streamLikeCounter';
import { acknowledgeStreamChatMessage, mergeStreamChatHistory } from '../../utils/mergeStreamChatHistory';
import { motion, AnimatePresence } from 'framer-motion';
// تم إزالة الأيقونة 'X' غير المستخدمة لتنظيف الكود
import { Heart, Users, Gift, Sparkles } from 'lucide-react';

// استيراد مكونات LiveKit الحديثة
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, useTracks, type TrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

// استيراد المكونات الفرعية التي قمنا بفصلها
import LiveHeader from './LiveHeader';
import LiveChat from './LiveChat';
import LiveGiftsPanel, { GiftDef } from './LiveGiftsPanel';

interface ViewerLiveRoomProps {
  streamId: string;
  title: string;
  streamerName: string;
  streamerId?: string;
  myUserId: string;
  myUsername: string;
  myAvatarUrl?: string;
  onExit: () => void;
}

interface ChatMessage {
  id: string;
  stream_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at?: string;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

interface GiftToast {
  id: number;
  senderName: string;
  emoji: string;
  giftName: string;
}

type RealtimeChatMessage = {
  id: string;
  stream_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at?: string;
};


const MESSAGES_LIMIT = 30;
const VIEWER_TOKEN_TIMEOUT_MS = 20_000;
const VIEWER_MEDIA_TIMEOUT_MS = 30_000;
const HEART_EMOJIS = ['💖', '🔥', '✨', '❤️', '😍'];

export default function ViewerLiveRoom({
  streamId, title, streamerName, streamerId, myUserId, myUsername, myAvatarUrl, onExit
}: ViewerLiveRoomProps) {

  // حالات الشات والتفاعل
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messageSender = useMemo(() => createCallMessageSender<ChatMessage>(async (message: string) => {
    // Return the saved row as well as the write result so our optimistic
    // bubble can acquire its permanent DB ID without waiting for Realtime.
    const { data, error } = await supabase.from('stream_chat').insert([{
      stream_id: streamId, user_id: myUserId,
      username: myUsername || 'متابع', message,
    }])
      .select('id, stream_id, user_id, username, message, created_at')
      .single();

    return {
      data,
      // Even a zero-row success cannot confirm the ID of a sent message.
      error: error ?? (!data?.id ? new Error('Missing persisted stream_chat ID') : null),
    };
  }), [streamId, myUserId, myUsername]);
  const [viewersCount, setViewersCount] = useState(1);
  const [likesCount, setLikesCount] = useState(0);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);

  // حالات المتابعة ونظام الهدايا والجواهر
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [gemsBalance, setGemsBalance] = useState<number | null>(null);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [giftToast, setGiftToast] = useState<GiftToast | null>(null);

  // تأثيرات بصرية وتنبيهات
  const [sparkleBurstKey, setSparkleBurstKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // 🔑 حالة توكن LiveKit الجديد
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [mediaConnected, setMediaConnected] = useState(false);
  const suppressDisconnectRef = useRef(false);

  // مراجع لتحسين الأداء (Ref)
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  // A failed database write must keep the pending count for a later attempt.
  const likeBatcher = useMemo(() => createStreamLikeBatcher(async (count: number) => {
    const channelAtFlush = roomChannelRef.current;
    const { error } = await supabase.rpc('increment_stream_likes', {
      target_stream_id: streamId,
      increment_count: count,
    });
    if (error) {
      console.error('فشل إرسال الإعجابات:', error);
      return false;
    }
    // Notify other viewers only after the database confirmed the count.
    // Never post an old stream's likes into a newly mounted room channel.
    if (channelAtFlush && roomChannelRef.current === channelAtFlush) {
      try {
        void channelAtFlush.send({
          type: 'broadcast', event: 'like_batch', payload: { count },
        }).catch(error => {
          console.warn('Like broadcast notification failed after saving:', error);
        });
      } catch (error) {
        // Broadcast is cosmetic: a notification failure must not retry a
        // database write that already succeeded and double-count likes.
        console.warn('Like broadcast unavailable after saving:', error);
      }
    }
    return true;
  }), [streamId]);

  const identityRef = useRef({ myUserId, myUsername, streamerId });
  useEffect(() => {
    identityRef.current = { myUserId, myUsername, streamerId };
  }, [myUserId, myUsername, streamerId]);

  const safeTimeout = useCallback((cb: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      cb();
      timeoutsRef.current = timeoutsRef.current.filter(tId => tId !== id);
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    safeTimeout(() => setToast(null), 2500);
  }, [safeTimeout]);

  // A token failure must not leave the viewer on an endless spinner.
  // Old requests are ignored if the viewer retries or changes streams.
  useEffect(() => {
    let isCancelled = false;
    setLiveKitToken(null);
    setMediaConnected(false);
    setConnectionError(null);

    const tokenTimeout = window.setTimeout(() => {
      isCancelled = true;
      setConnectionError('انتهت مهلة تجهيز البث. تأكد من الإنترنت وأعد المحاولة.');
    }, VIEWER_TOKEN_TIMEOUT_MS);

    async function fetchLiveKitToken() {
      try {
        const { data, error: funcError } = await supabase.functions.invoke('livekit-token', {
          body: {
            room: streamId,
            username: myUsername || 'متابع',
            isStreamer: false,
          },
        });
        if (isCancelled) return;
        if (funcError || !data?.token) {
          throw funcError ?? new Error('No live stream token returned');
        }
        // The old room was unmounted before this new token can connect.
        // Re-enable error handling so retry attempts fail promptly if needed.
        suppressDisconnectRef.current = false;
        setLiveKitToken(data.token);
      } catch (error) {
        if (isCancelled) return;
        console.error('LiveKit viewer token request failed:', error);
        setConnectionError('تعذر تجهيز اتصال البث. تأكد من الإنترنت وأعد المحاولة.');
      } finally {
        window.clearTimeout(tokenTimeout);
      }
    }

    void fetchLiveKitToken();
    return () => {
      isCancelled = true;
      window.clearTimeout(tokenTimeout);
    };
  }, [streamId, myUsername, connectionAttempt]);

  const handleMediaConnected = useCallback(() => {
    suppressDisconnectRef.current = false;
    setMediaConnected(true);
    setConnectionError(null);
  }, []);

  const handleMediaError = useCallback((error: Error) => {
    console.error('LiveKit viewer connection failed:', error);
    if (!suppressDisconnectRef.current) {
      setConnectionError('تعذر الاتصال بخادم البث. حاول إعادة الاتصال.');
    }
  }, []);

  const handleMediaDisconnected = useCallback(() => {
    if (!suppressDisconnectRef.current) {
      setMediaConnected(false);
      setConnectionError('انقطع الاتصال بالبث. حاول إعادة الاتصال.');
    }
  }, []);

  // Catch silent room-connection stalls that emit no error event.
  useEffect(() => {
    if (!liveKitToken || mediaConnected || connectionError) return;
    const timeout = window.setTimeout(() => {
      setConnectionError('تأخر الاتصال بالبث. جرّب إعادة الاتصال.');
    }, VIEWER_MEDIA_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [liveKitToken, mediaConnected, connectionError]);

  const retryConnection = useCallback(() => {
    suppressDisconnectRef.current = true;
    setConnectionError(null);
    setMediaConnected(false);
    setLiveKitToken(null);
    setConnectionAttempt(attempt => attempt + 1);
  }, []);

  const spawnHeart = useCallback((clientX?: number, emoji?: string) => {
    const heart: FloatingHeart = {
      id: Date.now() + Math.random(),
      // تحسين للموبايل: استخدام النسبة المئوية للعرض بدلاً من البيكسل الثابت
      x: clientX !== undefined ? (clientX / window.innerWidth) * 100 : 75 + Math.random() * 10,
      y: Math.random() * 20,
      emoji: emoji ?? HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
    };
    setFloatingHearts(prev => [...prev, heart]);
    safeTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== heart.id)), 2000);
  }, [safeTimeout]);

  const showGiftToast = useCallback((senderName: string, emoji: string, giftName: string) => {
    const id = Date.now() + Math.random();
    setGiftToast({ id, senderName, emoji, giftName });
    safeTimeout(() => setGiftToast(prev => (prev?.id === id ? null : prev)), 3000);
  }, [safeTimeout]);

  const triggerSparkleBurst = useCallback(() => {
    setSparkleBurstKey(k => k + 1);
    safeTimeout(() => setSparkleBurstKey(0), 1600);
  }, [safeTimeout]);

  // لإعادة المزامنة عند عودة المستخدم للتطبيق
  const [reconnectKey, setReconnectKey] = useState(0);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setReconnectKey(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // إدارة قنوات الشات والـ Realtime
  useEffect(() => {
    let isMounted = true;
    const currentMyUserId = identityRef.current.myUserId;

    const fetchOldMessages = async () => {
      const { data, error } = await supabase
        .from('stream_chat')
        .select('*')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_LIMIT);

      if (error) {
        if (isMounted) showToast('تعذر تحميل الرسائل القديمة');
        return;
      }
      if (data && isMounted) {
        const recentHistory: ChatMessage[] = data.slice().reverse().map(m => ({
          id: m.id, stream_id: m.stream_id, user_id: m.user_id,
          username: m.username, message: m.message, created_at: m.created_at,
        }));
        // A Realtime INSERT or local pending send can arrive before the
        // historical query resolves. Do not overwrite those messages.
        setMessages(current => mergeStreamChatHistory(recentHistory, current, MESSAGES_LIMIT));
      }
    };

    fetchOldMessages();

    const roomChannel = supabase.channel(`room-${streamId}`, {
      config: { presence: { key: currentMyUserId }, broadcast: { self: false } },
    });

    roomChannelRef.current = roomChannel;

    roomChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat', filter: `stream_id=eq.${streamId}` }, (payload) => {
        if (!isMounted) return;
        const newMsg = payload.new as RealtimeChatMessage;
        if (newMsg.user_id === currentMyUserId) return;
        setMessages(prev => prev.some(m => m.id === newMsg.id)
          ? prev
          : [...prev.slice(-(MESSAGES_LIMIT - 1)), newMsg]);
      })
      // استقبال دفعة الإعجابات (Batching) لحماية الواجهة من الانهيار
      .on('broadcast', { event: 'like_batch' }, ({ payload }) => {
        if (!isMounted) return;
        const count = safeStreamLikeBatchCount(payload?.count);
        if (count === 0) return;
        setLikesCount(prev => addStreamLikeBatch(prev, count));

        // Spawn at most two hearts; never allocate animations according to
        // an untrusted broadcast payload.
        const heartsToSpawn = Math.min(count, 2);
        for (let i = 0; i < heartsToSpawn; i++) {
          safeTimeout(() => { if (isMounted) spawnHeart(); }, i * 200);
        }
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
      .on('presence', { event: 'sync' }, () => {
        if (!isMounted) return;
        const state = roomChannel.presenceState();
        setViewersCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isMounted) {
          roomChannel.track({ 
            user_id: currentMyUserId, username: identityRef.current.myUsername, role: 'viewer', online_at: new Date().toISOString() 
          });
        }
      });

    supabase.from('live_streams').select('likes_count').eq('id', streamId).maybeSingle().then(({ data }) => {
      if (isMounted && data?.likes_count != null) {
        // A late snapshot must not overwrite newer local taps/broadcasts.
        setLikesCount(current => reconcileStreamLikeSnapshot(current, data.likes_count));
      }
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(roomChannel);
      timeoutsRef.current.forEach(id => window.clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, [streamId, safeTimeout, showToast, spawnHeart, showGiftToast, triggerSparkleBurst, reconnectKey]);

  // Periodic batches are single-flight. Failed writes remain buffered for
  // a later tick, and cleanup attempts one final best-effort flush.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void likeBatcher.flush();
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
      void likeBatcher.finish();
    };
  }, [likeBatcher]);

  // جلب رصيد الجواهر والمتابعة
  useEffect(() => {
    let isMounted = true;
    supabase.from('users_coins').select('coins').eq('user_id', myUserId).maybeSingle().then(({ data }) => {
      if (isMounted) setGemsBalance(data?.coins ?? 0);
    });

    if (streamerId && streamerId !== myUserId) {
      supabase.from('follows').select('id').eq('follower_id', myUserId).eq('following_id', streamerId).maybeSingle().then(({ data }) => {
        if (isMounted) setIsFollowing(!!data);
      });
    }
    return () => { isMounted = false; };
  }, [myUserId, streamerId]);

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const draft = newMessage;
    const text = draft.trim();
    if (!text || messageSender.isSending()) return;

    setSending(true);
    const localId = `pending-${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev.slice(-(MESSAGES_LIMIT - 1)), {
      id: localId, stream_id: streamId, user_id: myUserId, username: 'أنت', message: text,
    }]);

    try {
      const result = await messageSender.send(text);
      if (result.status === 'sent' && result.data?.id) {
        // Replace only this outgoing pending bubble with the saved server
        // message ID. Future history refreshes now deduplicate it correctly.
        setMessages(current => acknowledgeStreamChatMessage(
          current, localId, result.data!, MESSAGES_LIMIT,
        ));
        // Never wipe more recent text typed while the server was working.
        setNewMessage(current => current === draft ? '' : current);
      } else {
        setMessages(prev => prev.filter(message => message.id !== localId));
        // The input was never cleared, so an unsuccessful message remains.
        showToast('تعذر إرسال الرسالة. النص محفوظ لإعادة المحاولة.');
      }
    } finally {
      setSending(false);
    }
  };

  // 🚀 دالة الإعجاب المحسنة (لا ترسل للسيرفر، تضيف للذاكرة فقط)
  const sendLike = useCallback((clientX?: number) => {
    setLikesCount(prev => addStreamLikeBatch(prev, 1));
    spawnHeart(clientX);
    likeBatcher.add();
  }, [spawnHeart, likeBatcher]);

  const handleScreenTap = (e: React.MouseEvent) => { sendLike(e.clientX); };

  // ⚡ تم التحديث: إضافة Optimistic UI لتجربة موبايل أسرع
  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!streamerId || streamerId === myUserId || followLoading) return;

    const previousIsFollowing = isFollowing;

    // تغيير حالة الزر فوراً لإعطاء المستخدم إحساس بالسرعة
    setIsFollowing(!previousIsFollowing);
    setFollowLoading(true);

    try {
      if (previousIsFollowing) {
        // إلغاء المتابعة
        const { error } = await supabase.from('follows').delete().eq('follower_id', myUserId).eq('following_id', streamerId);
        if (error) throw error;
      } else {
        // متابعة جديدة
        const { error } = await supabase.from('follows').insert([{ follower_id: myUserId, following_id: streamerId }]);
        if (error) throw error;
        showToast(`تمت متابعة ${streamerName}`);
      }
    } catch (error) {
      // التراجع عن التغيير بصمت لو حدث خطأ في الاتصال
      setIsFollowing(previousIsFollowing);
      showToast('فشلت المتابعة، يرجى التأكد من اتصالك بالإنترنت');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSendGift = async (gift: GiftDef) => {
    if (gemsBalance === null || gemsBalance < gift.cost || !streamerId) return;
    setShowGiftPanel(false);

    try {
      const { data, error } = await supabase.rpc('send_gift_safe', {
        p_stream_id: streamId, p_receiver_id: streamerId, p_gift_type: gift.id, p_coin_cost: gift.cost,
      });

      if (!error && data?.success) {
        setGemsBalance(prev => (prev !== null ? prev - gift.cost : prev));
        showGiftToast('أنت', gift.emoji, gift.name);
        spawnHeart(undefined, gift.emoji);
        roomChannelRef.current?.send({
          type: 'broadcast', event: 'gift', payload: { senderName: myUsername || 'متابع', emoji: gift.emoji, giftName: gift.name }
        });
      } else {
        const reason = data?.error;
        if (reason === 'gift_price_changed' || reason === 'gift_unavailable') {
          showToast('تم تحديث أسعار الهدايا. افتح لوحة الهدايا مجدداً.');
        } else if (reason === 'insufficient_coins') {
          showToast('الرصيد غير كافٍ لإرسال هذه الهدية.');
        } else {
          console.error('Gift purchase failed', error ?? reason);
          showToast('تعذر إرسال الهدية. حاول مرة أخرى.');
        }
      }
    } catch (err) {
      console.error('Gift purchase failed', err);
      showToast('حدث خطأ غير متوقع');
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
      // استخدام 100dvh لضمان التوافق مع متصفحات الموبايل (مثل سفاري)
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', background: '#05050c', zIndex: 2147483647, display: 'flex', justifyContent: 'center', alignItems: 'center', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}
    >
      <div style={{ width: '100%', maxWidth: '440px', height: '100%', background: '#000', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}>
        
        {/* 📺 طبقة مشغل البث والتفاعل */}
        {/* تم إضافة WebkitTapHighlightColor لمنع ظهور المربع الأزرق المزعج عند النقر المستمر على الموبايل */}
        <div onClick={handleScreenTap} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer', background: '#000', WebkitTapHighlightColor: 'transparent' }}>
          {connectionError ? (
            <div
              role="alert"
              onClick={e => e.stopPropagation()}
              style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center', gap: 16,
                padding: 24, textAlign: 'center', color: '#fff',
                background: 'linear-gradient(to bottom, #110e26, #03030a)',
              }}
            >
              <Users size={46} style={{ color: '#fca5a5' }} />
              <strong style={{ fontSize: '1.1rem' }}>تعذر تشغيل البث</strong>
              <p style={{ color: '#e2e8f0', fontSize: '.85rem', margin: 0 }}>{connectionError}</p>
              <button type="button" onClick={retryConnection} style={{ padding: '12px 22px', borderRadius: 12, background: '#0e7490', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' }}>إعادة الاتصال</button>
              <button type="button" onClick={onExit} style={{ padding: '10px 20px', borderRadius: 12, color: '#e2e8f0', background: 'rgba(255,255,255,.12)', border: 0, cursor: 'pointer' }}>الرجوع</button>
            </div>
          ) : liveKitToken ? (
            <LiveKitRoom
              key={`${streamId}-${connectionAttempt}`}
              onConnected={handleMediaConnected}
              onDisconnected={handleMediaDisconnected}
              onError={handleMediaError}
              video={false}
              // Viewers subscribe to broadcaster tracks; they must never
              // request/publish microphone or camera tracks themselves.
              audio={false}
              token={liveKitToken}
              serverUrl={import.meta.env.VITE_LIVEKIT_URL}
              connect={true}
              style={{ width: '100%', height: '100%' }}
            >
              <LiveStreamVideoRenderer />
              <RoomAudioRenderer />
              {/* Browsers may block remote audio until a viewer clicks. */}
              <StartAudio
                label="اضغط لتشغيل صوت البث"
                style={{
                  position: 'absolute',
                  top: '42%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 30,
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 12,
                  background: '#0e7490',
                  color: '#fff',
                  fontFamily: 'Cairo, sans-serif',
                  fontSize: 14,
                  fontWeight: 700,
                  padding: '12px 16px',
                  cursor: 'pointer',
                }}
              />
            </LiveKitRoom>
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(to bottom, #110e26, #03030a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}
                style={{ width: 85, height: 85, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Users size={32} style={{ color: '#00d4ff' }} />
              </motion.div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 14, fontWeight: 700 }}>جاري الاتصال بخادم البث...</span>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 20%, transparent 50%, rgba(0,0,0,0.95) 100%)', pointerEvents: 'none' }} />
        </div>

        {/* التأثيرات المتحركة العائمة (قلوب، هدايا، بريق) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' }}>
          <AnimatePresence>
            {floatingHearts.map(heart => (
              <motion.div key={heart.id} initial={{ opacity: 1, y: 0, scale: 0.5, x: 0 }} animate={{ opacity: 0, y: -400 - heart.y, scale: 1.5, x: (Math.random() - 0.5) * 60 }} transition={{ duration: 1.2 + Math.random() * 0.5, ease: "easeOut" }} style={{ position: 'absolute', bottom: '15%', left: `${heart.x}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 10px rgba(255,42,116,0.8))' }}>
                {heart.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {sparkleBurstKey > 0 && (
            <motion.div key={sparkleBurstKey} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.6 }} style={{ position: 'absolute', inset: 0, zIndex: 25, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.4, 1.1], opacity: [0, 1, 0] }} transition={{ duration: 1.6, ease: 'easeOut' }} style={{ fontSize: '6rem', filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.9))' }}>✨🎉✨</motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {giftToast && (
            <motion.div key={giftToast.id} initial={{ opacity: 0, y: -40, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -40, x: '-50%' }} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 70px)', left: '50%', zIndex: 30, background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(168,85,247,0.5)', borderRadius: '50px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(16px)', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '1.4rem' }}>{giftToast.emoji}</span>
              <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}>{giftToast.senderName} أرسل/ت {giftToast.giftName}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} style={{ position: 'absolute', bottom: '230px', left: '50%', zIndex: 30, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, padding: '8px 16px', borderRadius: '50px', backdropFilter: 'blur(10px)', whiteSpace: 'nowrap' }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🎛️ واجهة التحكم الرئيسية */}
        <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box', pointerEvents: 'none' }}>
          
          <LiveHeader 
            streamerName={streamerName} streamerId={streamerId} myUserId={myUserId}
            isFollowing={isFollowing} followLoading={followLoading} viewersCount={viewersCount}
            likesCount={likesCount} onToggleFollow={handleToggleFollow} onExit={onExit}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', paddingBottom: 'env(safe-area-inset-bottom)', pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h1 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 900, padding: '0 6px', margin: 0 }}>{title}</h1>
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
              <div style={{ flex: 1 }}>
                <LiveChat 
                  messages={messages} newMessage={newMessage} sending={sending}
                  myUserId={myUserId} myAvatarUrl={myAvatarUrl}
                  onNewMessageChange={setNewMessage} onSendMessage={handleSendMessage}
                />
              </div>

              {/* أزرار التفاعل السريع بحجم 44x44 بيكسل لسهولة اللمس على الموبايل */}
              <button type="button" onClick={() => setShowGiftPanel(true)} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Gift size={20} /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); triggerSparkleBurst(); roomChannelRef.current?.send({ type: 'broadcast', event: 'super', payload: {} }); }} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Sparkles size={20} /></button>
              <button type="button" onClick={() => sendLike()} style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #ff2a74, #ff5388)', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Heart size={18} fill="currentColor" /></button>
            </div>
          </div>
        </div>

        <LiveGiftsPanel 
          showGiftPanel={showGiftPanel} setShowGiftPanel={setShowGiftPanel}
          gemsBalance={gemsBalance} onSendGift={handleSendGift}
        />

      </div>
    </motion.div>,
    document.body
  );
}

// 🎞️ مكون داخلي ذكي لجلب وعرض تراك الكاميرا
function LiveStreamVideoRenderer() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const cameraTrack = tracks.find(t => t.source === Track.Source.Camera);

  if (!cameraTrack) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(to bottom, #110e26, #03030a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: 700 }}>بانتظار صورة البث...</span>
      </div>
    );
  }

  return <VideoTrack trackRef={cameraTrack as TrackReference} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}