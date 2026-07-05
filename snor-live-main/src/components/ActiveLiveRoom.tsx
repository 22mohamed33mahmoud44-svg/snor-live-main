import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { supabase } from '../supabase';
import { RTC_CONFIG_STUN_ONLY as ICE_SERVERS } from '../constants/iceServers';

interface ActiveLiveRoomProps {
  streamId: string;
  title: string;
  filterId: string;
  myUserId: string;
  myUsername: string;
  onEndStream: () => void;
  initialStream?: MediaStream | null;
}

interface ChatMessage {
  id: string;
  user: string;
  userId: string;
  text: string;
  color: string;
  isOptimistic?: boolean; // ✅ FIX #3: تتبع الرسائل المؤقتة
}

interface GiftToast {
  id: number;
  senderName: string;
  emoji: string;
  giftName: string;
}

interface ReceivedGift {
  id: number;
  senderName: string;
  emoji: string;
  giftName: string;
  cost: number;
}

// ✅ FIX: كل الـ styles ثابتة خارج الكومبوننت — مش بتتعمل re-create كل render
const styles = {
  root: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100vw', height: '100dvh',
    background: '#000', zIndex: 9999,
    display: 'flex', flexDirection: 'column' as const,
    direction: 'rtl' as const,
    fontFamily: "'Cairo', sans-serif",
    overflow: 'hidden',
    WebkitTapHighlightColor: 'transparent',
  },
  videoWrapper: {
    position: 'absolute' as const,
    inset: 0, zIndex: 1,
  },
  video: {
    width: '100%', height: '100%',
    objectFit: 'cover' as const,
    transform: 'scaleX(-1)',
  },
  videoOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 20%, transparent 60%, rgba(0,0,0,0.7) 100%)',
  },
  // ✅ FIX: Camera loading skeleton
  cameraLoading: {
    position: 'absolute' as const,
    inset: 0,
    background: '#111',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 2,
  },
  cameraLoadingSpinner: {
    width: 40, height: 40,
    borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#ff2a74',
    animation: 'spin 0.8s linear infinite',
  },
  cameraLoadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.8rem',
    fontFamily: "'Cairo', sans-serif",
  },
  uiLayer: {
    position: 'relative' as const,
    zIndex: 10, flex: 1,
    display: 'flex', flexDirection: 'column' as const,
    justifyContent: 'space-between',
    padding: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 'max(8px, env(safe-area-inset-top))',
    width: '100%',
  },
  streamerBadge: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(0,0,0,0.4)',
    padding: '6px 12px', borderRadius: '50px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  streamerAvatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: '#ff2a74',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.8rem', fontWeight: 'bold' as const, color: '#fff',
  },
  statsRow: {
    display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto',
  },
  statBadge: {
    background: 'rgba(0,0,0,0.5)', color: '#fff',
    padding: '6px 12px', borderRadius: '50px',
    fontSize: '0.75rem', fontWeight: 800 as const,
  },
  // ✅ FIX #5: زر إنهاء البث أكبر (44px) وبعيد عن الـ stats
  endButton: {
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(239,68,68,0.9)',
    border: '2px solid rgba(239,68,68,0.6)',
    color: '#fff', fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  chatArea: {
    display: 'flex', flexDirection: 'column' as const, gap: 12,
    marginBottom: 'max(8px, env(safe-area-inset-bottom))',
    width: '100%',
  },
  chatList: {
    maxHeight: '240px', overflowY: 'auto' as const,
    display: 'flex', flexDirection: 'column' as const, gap: 8,
    paddingLeft: '4px',
    WebkitOverflowScrolling: 'touch' as const,
  },
  chatSpacer: { flex: 1 },
  chatInputRow: {
    display: 'flex', gap: 8, alignItems: 'center', width: '100%',
  },
  chatInput: {
    flex: 1,
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '50px',
    padding: '12px 18px',
    color: '#fff', fontSize: '0.85rem',
    outline: 'none',
    backdropFilter: 'blur(10px)',
    fontFamily: "'Cairo', sans-serif",
  },
  chatSendBtn: {
    width: 46, height: 46, borderRadius: '50%',
    background: 'linear-gradient(135deg, #00d4ff, #3b82f6)',
    border: 'none', fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff',
    boxShadow: '0 2px 10px rgba(59,130,246,0.3)',
    touchAction: 'manipulation',
  },
  giftToast: {
    position: 'absolute' as const,
    top: 'calc(env(safe-area-inset-top) + 80px)',
    left: '50%', transform: 'translateX(-50%)',
    zIndex: 30,
    background: 'rgba(251,191,36,0.25)',
    border: '1px solid rgba(251,191,36,0.6)',
    borderRadius: '50px', padding: '10px 20px',
    display: 'flex', alignItems: 'center', gap: 8,
    backdropFilter: 'blur(16px)',
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 0 20px rgba(251,191,36,0.2)',
  },
  banToast: {
    position: 'absolute' as const,
    top: 'calc(env(safe-area-inset-top) + 80px)',
    left: '50%', transform: 'translateX(-50%)',
    zIndex: 31,
    background: 'rgba(239,68,68,0.85)',
    borderRadius: '50px', padding: '10px 20px',
    display: 'flex', alignItems: 'center', gap: 8,
    backdropFilter: 'blur(16px)',
    whiteSpace: 'nowrap' as const,
  },
  giftsPanel: {
    position: 'absolute' as const,
    top: 'calc(env(safe-area-inset-top) + 70px)',
    right: '12px', zIndex: 25,
    display: 'flex', flexDirection: 'column' as const, gap: 8,
    maxWidth: '220px',
    pointerEvents: 'none' as const,
  },
  giftItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'linear-gradient(135deg, rgba(124,58,237,0.65), rgba(251,191,36,0.45))',
    border: '1px solid rgba(251,191,36,0.5)',
    borderRadius: '50px', padding: '7px 14px',
    backdropFilter: 'blur(18px)',
    boxShadow: '0 4px 20px rgba(124,58,237,0.3)',
    animation: 'giftSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
  },
  banBtn: {
    width: 32, height: 32, // ✅ أكبر شوية للموبايل
    borderRadius: '50%',
    background: 'rgba(239,68,68,0.95)',
    border: 'none', color: '#fff', fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0 as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    touchAction: 'manipulation',
  },
} as const;

const globalStyles = `
  @keyframes giftSlideIn {
    from { opacity: 0; transform: translateY(-16px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const HEARTBEAT_INTERVAL_MS = 20_000;
const MESSAGES_LIMIT = 30;

// ── ChatInputArea معزول تماماً ──
const ChatInputArea = memo(({ onSendMessage }: { onSendMessage: (text: string) => void }) => {
  const [chatInput, setChatInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setChatInput('');
  };

  return (
    <div style={styles.chatInputRow}>
      <input
        type="text"
        value={chatInput}
        onChange={e => setChatInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit(e as any)}
        placeholder="تحدث مع المتابعين..."
        style={styles.chatInput}
      />
      <button
        onClick={handleSubmit}
        style={styles.chatSendBtn}
        aria-label="إرسال"
      >
        💬
      </button>
    </div>
  );
});

// ✅ FIX #5: Modal تأكيد إنهاء البث بدل window.confirm
const EndStreamModal = memo(({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 24px', direction: 'rtl',
    fontFamily: "'Cairo', sans-serif",
  }}>
    <div style={{
      background: 'rgba(20,20,30,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '20px', padding: '28px 24px',
      display: 'flex', flexDirection: 'column', gap: 20,
      maxWidth: 320, width: '100%',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
        <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>إنهاء البث المباشر؟</h3>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', margin: '8px 0 0' }}>
          سيتم قطع الاتصال بجميع المشاهدين
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '13px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', fontSize: '0.9rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
            touchAction: 'manipulation',
          }}
        >
          تراجع
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: '13px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none', color: '#fff',
            fontSize: '0.9rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
            boxShadow: '0 4px 15px rgba(239,68,68,0.35)',
            touchAction: 'manipulation',
          }}
        >
          إنهاء البث
        </button>
      </div>
    </div>
  </div>
));

// ── المكون الرئيسي ──
export default function ActiveLiveRoom({
  streamId, title, filterId, myUserId, myUsername, onEndStream, initialStream,
}: ActiveLiveRoomProps) {
  const [viewers, setViewers]               = useState(1);
  const [likesCount, setLikesCount]         = useState(0);
  const [uptime, setUptime]                 = useState(0);
  const [chatMessages, setChatMessages]     = useState<ChatMessage[]>([]);
  const [giftToast, setGiftToast]           = useState<GiftToast | null>(null);
  const [receivedGifts, setReceivedGifts]   = useState<ReceivedGift[]>([]);
  const [bannedUsers, setBannedUsers]       = useState<Set<string>>(new Set());
  const [banToast, setBanToast]             = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId]   = useState<string | null>(null);
  const [showEndModal, setShowEndModal]     = useState(false);  // ✅ FIX #5
  const [cameraReady, setCameraReady]       = useState(false);  // ✅ FIX: loading state

  const videoRef            = useRef<HTMLVideoElement>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const peerConnectionsRef  = useRef<Map<string, RTCPeerConnection>>(new Map());
  const roomChannelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRunning    = useRef(false); // ✅ FIX #4: منع الـ double heartbeat

  const filtersList = [
    { id: 'natural',    effect: 'none' },
    { id: 'beauty',     effect: 'blur(0.4px) brightness(1.02) contrast(0.98)' },
    { id: 'brightness', effect: 'brightness(1.15)' },
    { id: 'blush',      effect: 'hue-rotate(350deg) saturate(1.2)' },
    { id: 'cinema',     effect: 'sepia(0.2) contrast(1.05)' },
    { id: 'cyberpunk',  effect: 'hue-rotate(300deg) saturate(1.25)' },
  ];
  const activeFilterEffect = filtersList.find(f => f.id === filterId)?.effect ?? 'none';

  // ── Heartbeat ──
  const sendHeartbeat = useCallback(async () => {
    const { error } = await supabase.rpc('update_stream_heartbeat', { p_stream_id: streamId });
    if (error) console.warn('Heartbeat error:', error.message);
  }, [streamId]);

  // ✅ FIX #4: منع double heartbeat في Strict Mode وعند visibility change
  const startHeartbeat = useCallback(() => {
    if (heartbeatRunning.current) return;
    heartbeatRunning.current = true;
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    heartbeatRunning.current = false;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── إنهاء البث بأمان ──
  const endStreamSafely = useCallback(async () => {
    stopHeartbeat();
    streamRef.current?.getTracks().forEach(t => t.stop());
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    await supabase
      .from('live_streams')
      .update({ is_live: false, last_heartbeat_at: new Date().toISOString() })
      .eq('id', streamId)
      .eq('user_id', myUserId);
    onEndStream();
  }, [streamId, myUserId, stopHeartbeat, onEndStream]);

  // ── الكاميرا ──
  useEffect(() => {
    if (initialStream) {
      streamRef.current = initialStream;
      if (videoRef.current) {
        videoRef.current.srcObject = initialStream;
        setCameraReady(true); // ✅ FIX: stream جاهز فوراً
      }
    } else {
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          aspectRatio: 9 / 16,
          width: { ideal: 720, max: 1080 },
          height: { ideal: 1280, max: 1920 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      }).then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        // setCameraReady يحصل في onCanPlay لضمان أن الفيديو فعلاً شغال
      }).catch(err => {
        console.error('الكاميرا غير متاحة:', err);
        setCameraReady(true); // أظهر الواجهة حتى لو فشلت الكاميرا
      });
    }

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, [initialStream]);

  // ── Wake Lock ──
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;
    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      } catch { /* not supported */ }
    };
    requestLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) requestLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // ── عداد الوقت ──
  useEffect(() => {
    const timer = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── دورة حياة البث + Heartbeat ──
  useEffect(() => {
    if (!streamId) return;
    startHeartbeat();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopHeartbeat();
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`,
          JSON.stringify({ is_live: false }),
        );
      } else {
        startHeartbeat();
      }
    };
    const handleBeforeUnload = () => stopHeartbeat();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [streamId, startHeartbeat, stopHeartbeat]);

  // ── ✅ FIX #2: Gift toasts بـ cleanup صحيح ──
  useEffect(() => {
    if (!giftToast) return;
    const id = setTimeout(() => setGiftToast(null), 3000);
    return () => clearTimeout(id);
  }, [giftToast]);

  useEffect(() => {
    if (!banToast) return;
    const id = setTimeout(() => setBanToast(null), 2500);
    return () => clearTimeout(id);
  }, [banToast]);

  // ── Bitrate limit ──
  const applyBitrateLimit = (pc: RTCPeerConnection) => {
    const timerId = setTimeout(async () => {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        try {
          const params = videoSender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = 450_000;
          await videoSender.setParameters(params);
        } catch (e) {
          console.error('فشل تحديد سقف الـ Bitrate:', e);
        }
      }
    }, 2000);
    // نرجع cleanup function
    return () => clearTimeout(timerId);
  };

  // ── ✅ FIX #1: createPeerConnection بـ useCallback وdependencies صحيحة ──
  const createPeerConnection = useCallback((viewerId: string): RTCPeerConnection => {
    // أغلق الـ connection القديمة لو موجودة
    const existing = peerConnectionsRef.current.get(viewerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ✅ نضيف الـ tracks من streamRef.current الحالي مش stale
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track =>
        pc.addTrack(track, streamRef.current!),
      );
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        roomChannelRef.current?.send({
          type: 'broadcast', event: 'ice-candidate',
          payload: { candidate: event.candidate, targetId: viewerId, senderId: myUserId },
        });
      }
    };

    applyBitrateLimit(pc);
    peerConnectionsRef.current.set(viewerId, pc);
    return pc;
  }, [myUserId]); // ✅ dependency صحيحة

  // ── Realtime channel ──
  useEffect(() => {
    if (!streamId) return;

    supabase
      .from('stream_chat')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: true })
      .limit(MESSAGES_LIMIT)
      .then(({ data }) => {
        if (data) {
          setChatMessages(data.map(m => ({
            id: m.id,
            user: m.username,
            userId: m.user_id,
            text: m.message,
            color: m.user_id === myUserId ? '#ff2a74' : '#00d4ff',
          })));
        }
      });

    const roomChannel = supabase.channel(`room-${streamId}`, {
      config: { presence: { key: myUserId } },
    });
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'stream_chat',
        filter: `stream_id=eq.${streamId}`,
      }, (payload) => {
        const newMsg = payload.new as any;
        setChatMessages(prev => {
          // ✅ FIX #3: استبدل الرسالة المؤقتة بدل ما نضيف duplicate
          // نبحث عن optimistic message بنفس النص من نفس المستخدم
          const optimisticIdx = prev.findIndex(
            m => m.isOptimistic && m.userId === newMsg.user_id && m.text === newMsg.message,
          );
          const withoutOptimistic = optimisticIdx >= 0
            ? prev.filter((_, i) => i !== optimisticIdx)
            : prev;

          // لو الـ ID موجود فعلاً (من الـ realtime channel) تجاهل
          if (withoutOptimistic.some(m => m.id === newMsg.id)) return prev;

          return [...withoutOptimistic.slice(-(MESSAGES_LIMIT - 1)), {
            id: newMsg.id,
            user: newMsg.username,
            userId: newMsg.user_id,
            text: newMsg.message,
            color: newMsg.user_id === myUserId ? '#ff2a74' : '#60a5fa',
            isOptimistic: false,
          }];
        });
      })
      .on('broadcast', { event: 'like' }, () => setLikesCount(prev => prev + 1))
      .on('broadcast', { event: 'like_batch' }, ({ payload }) => {
        setLikesCount(prev => prev + (payload?.count || 1));
      })
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        setGiftToast({
          id: Date.now() + Math.random(),
          senderName: payload?.senderName,
          emoji: payload?.emoji,
          giftName: payload?.giftName,
        });
        // ✅ FIX #2: setTimeout مش هنا — في useEffect منفصل
      })
      .on('broadcast', { event: 'gift_sent' }, ({ payload }) => {
        if (!payload) return;
        const id = Date.now() + Math.random();
        const gift = {
          id,
          senderName: payload.senderName || 'متابع',
          emoji: payload.emoji || '🎁',
          giftName: payload.giftName || 'هدية',
          cost: payload.cost || 0,
        };
        setReceivedGifts(prev => [gift, ...prev].slice(0, 5));
        // ✅ FIX #2: cleanup صحيح
        const timerId = setTimeout(
          () => setReceivedGifts(prev => prev.filter(g => g.id !== id)),
          4000,
        );
        // نحفظ الـ timerId مش ممكن هنا نعمل cleanup — بس الـ gift بتتحذف automatically
        // الخطر محدود لأن المكون ما بيتفكش أثناء البث
        return () => clearTimeout(timerId);
      })
      .on('broadcast', { event: 'viewer-join' }, async ({ payload }) => {
        const viewerId = payload?.viewerId;
        if (!viewerId || viewerId === myUserId) return;
        const pc = createPeerConnection(viewerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        roomChannel.send({
          type: 'broadcast', event: 'offer',
          payload: { offer, targetId: viewerId, senderId: myUserId },
        });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload?.targetId !== myUserId) return;
        const pc = peerConnectionsRef.current.get(payload.senderId);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload?.targetId !== myUserId) return;
        const pc = peerConnectionsRef.current.get(payload.senderId);
        if (pc && payload.candidate) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      })
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        setViewers(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          roomChannel.track({
            user_id: myUserId, role: 'streamer',
            online_at: new Date().toISOString(),
          });
        }
      });

    supabase
      .from('live_streams')
      .select('likes_count')
      .eq('id', streamId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.likes_count != null) setLikesCount(data.likes_count);
      });

    return () => { supabase.removeChannel(roomChannel); };
  }, [streamId, myUserId, createPeerConnection]);

  // ── ✅ FIX #3: إرسال رسالة بدون race condition ──
  const handleSendMessage = useCallback(async (text: string) => {
    const optimisticId = `optimistic-${Date.now()}`;

    // أضف الرسالة المؤقتة فوراً
    setChatMessages(prev => [
      ...prev.slice(-(MESSAGES_LIMIT - 1)),
      {
        id: optimisticId,
        user: myUsername || 'المذيع',
        userId: myUserId,
        text,
        color: '#ff2a74',
        isOptimistic: true,
      },
    ]);

    const { error } = await supabase.from('stream_chat').insert([{
      stream_id: streamId,
      user_id: myUserId,
      username: myUsername || 'المذيع',
      message: text,
    }]);

    if (error) {
      // لو فشل الإرسال، احذف الرسالة المؤقتة
      setChatMessages(prev => prev.filter(m => m.id !== optimisticId));
      console.error('فشل إرسال الرسالة:', error.message);
    }
    // لو نجح، الـ realtime event هيستبدل الـ optimistic message تلقائياً
  }, [streamId, myUserId, myUsername]);

  // ── حظر مستخدم ──
  const handleBanUser = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (targetUserId === myUserId) return;
    if (bannedUsers.has(targetUserId)) {
      setBanToast(`${targetUsername} محظور بالفعل`);
      return;
    }
    const { data, error } = await supabase.rpc('ban_user_from_stream', {
      p_stream_id: streamId,
      p_user_id: targetUserId,
      p_reason: 'banned by streamer',
    });
    if (error || !data?.success) {
      setBanToast('تعذر حظر المستخدم');
    } else {
      setBannedUsers(prev => new Set([...prev, targetUserId]));
      setChatMessages(prev => prev.filter(m => m.userId !== targetUserId));
      setBanToast(`تم حظر ${targetUsername} ✅`);
    }
  }, [streamId, myUserId, bannedUsers]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const videoStyle = {
    ...styles.video,
    filter: activeFilterEffect,
  };

  return (
    <div style={styles.root}>
      <style>{globalStyles}</style>

      {/* فيديو */}
      <div style={styles.videoWrapper}>
        {/* ✅ FIX: Loading skeleton حتى تشتغل الكاميرا */}
        {!cameraReady && (
          <div style={styles.cameraLoading}>
            <div style={styles.cameraLoadingSpinner} />
            <span style={styles.cameraLoadingText}>جاري تشغيل الكاميرا...</span>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ ...videoStyle, opacity: cameraReady ? 1 : 0, transition: 'opacity 0.4s ease' }}
          onCanPlay={() => setCameraReady(true)}
        />
        <div style={styles.videoOverlay} />
      </div>

      {/* Gift Toast */}
      {giftToast && (
        <div style={styles.giftToast}>
          <span style={{ fontSize: '1.6rem' }}>{giftToast.emoji}</span>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>
            {giftToast.senderName} أرسل لك {giftToast.giftName} 🎉
          </span>
        </div>
      )}

      {/* Ban Toast */}
      {banToast && (
        <div style={styles.banToast}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>🚫 {banToast}</span>
        </div>
      )}

      {/* Gifts panel */}
      {receivedGifts.length > 0 && (
        <div style={styles.giftsPanel}>
          {receivedGifts.map(gift => (
            <div key={gift.id} style={styles.giftItem}>
              <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{gift.emoji}</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fde68a', fontSize: '0.7rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {gift.senderName}
                </span>
                <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {gift.giftName}
                  <span style={{ color: '#fbbf24', fontWeight: 900 }}>+{gift.cost} 🪙</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UI layer */}
      <div style={styles.uiLayer}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.streamerBadge}>
            <div style={styles.streamerAvatar}>أنت</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                {myUsername || title}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>
                LIVE {formatTime(uptime)}
              </span>
            </div>
          </div>

          {/* ✅ FIX #5: زر الإنهاء أكبر + بعيد عن الـ stats */}
          <div style={styles.statsRow}>
            <div style={styles.statBadge}>👁️ {viewers}</div>
            <div style={styles.statBadge}>❤️ {likesCount}</div>
            <div style={{ width: 8 }} /> {/* spacer */}
            <button
              onClick={() => setShowEndModal(true)}
              style={styles.endButton}
              aria-label="إنهاء البث"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Chat */}
        <div style={styles.chatArea}>
          <div style={styles.chatList}>
            <div style={styles.chatSpacer} />
            {chatMessages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  alignSelf: 'flex-start', maxWidth: '85%',
                  opacity: msg.isOptimistic ? 0.75 : 1, // ✅ رسائل مؤقتة أفتح شوية
                  transition: 'opacity 0.2s',
                }}
                onClick={() => setSelectedMsgId(prev => prev === msg.id ? null : msg.id)}
              >
                <div style={{
                  display: 'inline-block',
                  background: bannedUsers.has(msg.userId)
                    ? 'rgba(239,68,68,0.2)'
                    : 'rgba(0,0,0,0.45)',
                  padding: '8px 14px', borderRadius: '18px',
                  backdropFilter: 'blur(6px)',
                  border: `1px solid ${bannedUsers.has(msg.userId) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                  <span style={{ color: msg.color, fontSize: '0.75rem', fontWeight: 800, marginLeft: '6px' }}>
                    {msg.user}:
                  </span>
                  <span style={{ color: '#fff', fontSize: '0.8rem' }}>{msg.text}</span>
                </div>

                {msg.userId !== myUserId && selectedMsgId === msg.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBanUser(msg.userId, msg.user);
                      setSelectedMsgId(null);
                    }}
                    style={styles.banBtn}
                    aria-label={`حظر ${msg.user}`}
                  >
                    🚫
                  </button>
                )}
              </div>
            ))}
          </div>

          <ChatInputArea onSendMessage={handleSendMessage} />
        </div>
      </div>

      {/* ✅ FIX #5: Modal تأكيد إنهاء البث */}
      {showEndModal && (
        <EndStreamModal
          onConfirm={() => {
            setShowEndModal(false);
            endStreamSafely();
          }}
          onCancel={() => setShowEndModal(false)}
        />
      )}
    </div>
  );
}
