
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { supabase } from '../supabase';
import { LiveKitRoom, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';

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
  isOptimistic?: boolean;
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
    width: 32, height: 32,
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

// ── LiveKit Publisher (يقوم بنشر الكاميرا بأمان) ──
const StreamPublisher = memo(({ stream }: { stream: MediaStream | null }) => {
  const room = useRoomContext();
  
  useEffect(() => {
    if (!room || !stream) return;
    const publishTracks = async () => {
      try {
        for (const track of stream.getTracks()) {
          await room.localParticipant.publishTrack(track, {
            simulcast: true,
            source: track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone
          });
        }
      } catch (e) {
        console.error("خطأ في نشر البث لخوادم LiveKit:", e);
      }
    };
    publishTracks();
    
    return () => {
      // إيقاف النشر عند الخروج لتنظيف الذاكرة
      stream.getTracks().forEach(track => {
        const source = track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone;
        const publication = room.localParticipant.getTrackPublication(source);
        if (publication && publication.track) {
          room.localParticipant.unpublishTrack(publication.track);
        }
      });
    };
  }, [room, stream]);

  return null;
});

// ── ChatMessageList (تم عزله لضمان السلاسة وعدم إعادة تحميل الشاشة بأكملها) ──
const ChatMessageList = memo(({ 
  messages, myUserId, bannedUsers, selectedMsgId, onSelectMsg, onBanUser 
}: { 
  messages: ChatMessage[]; myUserId: string; bannedUsers: Set<string>; 
  selectedMsgId: string | null; onSelectMsg: (id: string | null) => void; 
  onBanUser: (id: string, name: string) => void; 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll الذكي
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div style={styles.chatList} ref={scrollRef}>
      <div style={styles.chatSpacer} />
      {messages.map(msg => (
        <div
          key={msg.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            alignSelf: 'flex-start', maxWidth: '85%',
            opacity: msg.isOptimistic ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
          onClick={() => onSelectMsg(selectedMsgId === msg.id ? null : msg.id)}
        >
          <div style={{
            display: 'inline-block',
            background: bannedUsers.has(msg.userId) ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.45)',
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
                onBanUser(msg.userId, msg.user);
                onSelectMsg(null);
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
  );
});

// ── ChatInputArea ──
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
        maxLength={500}
        placeholder="تحدث مع المتابعين..."
        style={styles.chatInput}
      />
      <button onClick={handleSubmit} style={styles.chatSendBtn} aria-label="إرسال">💬</button>
    </div>
  );
});

// ── EndStreamModal ──
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
        <button onClick={onCancel} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", touchAction: 'manipulation' }}>تراجع</button>
        <button onClick={onConfirm} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", boxShadow: '0 4px 15px rgba(239,68,68,0.35)', touchAction: 'manipulation' }}>إنهاء البث</button>
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
  const [showEndModal, setShowEndModal]     = useState(false);
  const [cameraReady, setCameraReady]       = useState(false);
  const [liveKitToken, setLiveKitToken]     = useState<string | null>(null);

  const videoRef            = useRef<HTMLVideoElement>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const roomChannelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRunning    = useRef(false);

  const filtersList = [
    { id: 'natural',    effect: 'none' },
    { id: 'beauty',     effect: 'blur(0.4px) brightness(1.02) contrast(0.98)' },
    { id: 'brightness', effect: 'brightness(1.15)' },
    { id: 'blush',      effect: 'hue-rotate(350deg) saturate(1.2)' },
    { id: 'cinema',     effect: 'sepia(0.2) contrast(1.05)' },
    { id: 'cyberpunk',  effect: 'hue-rotate(300deg) saturate(1.25)' },
  ];
  const activeFilterEffect = filtersList.find(f => f.id === filterId)?.effect ?? 'none';

  // ── جلب توكن LiveKit للمذيع ──
  useEffect(() => {
    let isCancelled = false;
    async function fetchToken() {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { room: streamId, username: myUsername || 'المذيع', isStreamer: true }
        });
        if (!isCancelled && data?.token) setLiveKitToken(data.token);
      } catch (e) {
        console.error("LiveKit Token error", e);
      }
    }
    fetchToken();
    return () => { isCancelled = true; };
  }, [streamId, myUsername]);

  // ── Heartbeat ──
  const sendHeartbeat = useCallback(async () => {
    const { error } = await supabase.rpc('update_stream_heartbeat', { p_stream_id: streamId });
    if (error) console.warn('Heartbeat error:', error.message);
  }, [streamId]);

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
        setCameraReady(true);
      }
    } else {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', aspectRatio: 9 / 16, width: { ideal: 720, max: 1080 }, height: { ideal: 1280, max: 1920 }, frameRate: { ideal: 24, max: 30 } },
        audio: true,
      }).then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      }).catch(err => {
        console.error('الكاميرا غير متاحة:', err);
        setCameraReady(true);
      });
    }

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [initialStream]);

  // ── Wake Lock ──
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;
    const requestLock = async () => {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not supported */ }
    };
    requestLock();
    const onVisibility = () => { if (document.visibilityState === 'visible' && !cancelled) requestLock(); };
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

  // ── دورة حياة البث + Realtime ──
  useEffect(() => {
    if (!streamId) return;
    startHeartbeat();

    supabase.from('stream_chat').select('*').eq('stream_id', streamId).order('created_at', { ascending: true }).limit(MESSAGES_LIMIT)
      .then(({ data }) => {
        if (data) setChatMessages(data.map(m => ({ id: m.id, user: m.username, userId: m.user_id, text: m.message, color: m.user_id === myUserId ? '#ff2a74' : '#00d4ff' })));
      });

    const roomChannel = supabase.channel(`room-${streamId}`, { config: { presence: { key: myUserId } } });
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat', filter: `stream_id=eq.${streamId}` }, (payload) => {
        const newMsg = payload.new as any;
        setChatMessages(prev => {
          const optimisticIdx = prev.findIndex(m => m.isOptimistic && m.userId === newMsg.user_id && m.text === newMsg.message);
          const withoutOptimistic = optimisticIdx >= 0 ? prev.filter((_, i) => i !== optimisticIdx) : prev;
          if (withoutOptimistic.some(m => m.id === newMsg.id)) return prev;

          return [...withoutOptimistic.slice(-(MESSAGES_LIMIT - 1)), {
            id: newMsg.id, user: newMsg.username, userId: newMsg.user_id, text: newMsg.message,
            color: newMsg.user_id === myUserId ? '#ff2a74' : '#60a5fa', isOptimistic: false,
          }];
        });
      })
      .on('broadcast', { event: 'like' }, () => setLikesCount(prev => prev + 1))
      .on('broadcast', { event: 'like_batch' }, ({ payload }) => setLikesCount(prev => prev + (payload?.count || 1)))
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        setGiftToast({ id: Date.now() + Math.random(), senderName: payload?.senderName, emoji: payload?.emoji, giftName: payload?.giftName });
      })
      .on('broadcast', { event: 'gift_sent' }, ({ payload }) => {
        if (!payload) return;
        const id = Date.now() + Math.random();
        setReceivedGifts(prev => [{ id, senderName: payload.senderName || 'متابع', emoji: payload.emoji || '🎁', giftName: payload.giftName || 'هدية', cost: payload.cost || 0 }, ...prev].slice(0, 5));
        setTimeout(() => setReceivedGifts(prev => prev.filter(g => g.id !== id)), 4000);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        setViewers(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') roomChannel.track({ user_id: myUserId, role: 'streamer', online_at: new Date().toISOString() });
      });

    supabase.from('live_streams').select('likes_count').eq('id', streamId).maybeSingle().then(({ data }) => {
      if (data?.likes_count != null) setLikesCount(data.likes_count);
    });

    const handleVisibilityChange = () => {
      // Do not end the stream just because the page/app becomes hidden.
      // Backgrounded tabs may temporarily pause/throttle timers; the
      // server-side cleanup/heartbeat logic decides when a stream is dead.
      if (document.visibilityState === 'visible') {
        startHeartbeat();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', stopHeartbeat);

    return () => {
      stopHeartbeat();
      supabase.removeChannel(roomChannel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', stopHeartbeat);
    };
  }, [streamId, myUserId, startHeartbeat, stopHeartbeat]);

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

  // ── القضاء على مشكلة الـ IDs ──
  const handleSendMessage = useCallback(async (text: string) => {
    const optimisticId = `opt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    setChatMessages(prev => [
      ...prev.slice(-(MESSAGES_LIMIT - 1)),
      { id: optimisticId, user: myUsername || 'المذيع', userId: myUserId, text, color: '#ff2a74', isOptimistic: true },
    ]);

    const { error } = await supabase.from('stream_chat').insert([{
      stream_id: streamId, user_id: myUserId, username: myUsername || 'المذيع', message: text,
    }]);

    if (error) {
      setChatMessages(prev => prev.filter(m => m.id !== optimisticId));
      console.error('فشل إرسال الرسالة:', error.message);
    }
  }, [streamId, myUserId, myUsername]);

  const handleBanUser = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (targetUserId === myUserId || bannedUsers.has(targetUserId)) {
      if (bannedUsers.has(targetUserId)) setBanToast(`${targetUsername} محظور بالفعل`);
      return;
    }
    const { data, error } = await supabase.rpc('ban_user_from_stream', { p_stream_id: streamId, p_user_id: targetUserId, p_reason: 'banned by streamer' });
    if (error || !data?.success) {
      setBanToast('تعذر حظر المستخدم');
    } else {
      setBannedUsers(prev => new Set([...prev, targetUserId]));
      setChatMessages(prev => prev.filter(m => m.userId !== targetUserId));
      setBanToast(`تم حظر ${targetUsername} ✅`);
    }
  }, [streamId, myUserId, bannedUsers]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const roomContent = (
    <div style={styles.root}>
      <style>{globalStyles}</style>

      {/* فيديو */}
      <div style={styles.videoWrapper}>
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
          style={{ ...styles.video, filter: activeFilterEffect, opacity: cameraReady ? 1 : 0, transition: 'opacity 0.4s ease' }}
          onCanPlay={() => setCameraReady(true)}
        />
        <div style={styles.videoOverlay} />
      </div>

      {giftToast && (
        <div style={styles.giftToast}>
          <span style={{ fontSize: '1.6rem' }}>{giftToast.emoji}</span>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>{giftToast.senderName} أرسل لك {giftToast.giftName} 🎉</span>
        </div>
      )}

      {banToast && (
        <div style={styles.banToast}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>🚫 {banToast}</span>
        </div>
      )}

      {receivedGifts.length > 0 && (
        <div style={styles.giftsPanel}>
          {receivedGifts.map(gift => (
            <div key={gift.id} style={styles.giftItem}>
              <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{gift.emoji}</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fde68a', fontSize: '0.7rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gift.senderName}</span>
                <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>{gift.giftName}<span style={{ color: '#fbbf24', fontWeight: 900 }}>+{gift.cost} 🪙</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UI layer */}
      <div style={styles.uiLayer}>
        <div style={styles.header}>
          <div style={styles.streamerBadge}>
            <div style={styles.streamerAvatar}>أنت</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{myUsername || title}</span>
              <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>LIVE {formatTime(uptime)}</span>
            </div>
          </div>
          <div style={styles.statsRow}>
            <div style={styles.statBadge}>👁️ {viewers}</div>
            <div style={styles.statBadge}>❤️ {likesCount}</div>
            <div style={{ width: 8 }} />
            <button onClick={() => setShowEndModal(true)} style={styles.endButton} aria-label="إنهاء البث">✕</button>
          </div>
        </div>

        <div style={styles.chatArea}>
          {/* المكون المعزول للرسائل */}
          <ChatMessageList 
            messages={chatMessages} myUserId={myUserId} bannedUsers={bannedUsers}
            selectedMsgId={selectedMsgId} onSelectMsg={setSelectedMsgId} onBanUser={handleBanUser} 
          />
          <ChatInputArea onSendMessage={handleSendMessage} />
        </div>
      </div>

      {showEndModal && (
        <EndStreamModal
          onConfirm={() => { setShowEndModal(false); endStreamSafely(); }}
          onCancel={() => setShowEndModal(false)}
        />
      )}
    </div>
  );

  // إذا تم استلام مفتاح LiveKit، نقوم بتغليف الواجهة به للاتصال بالخادم
  if (liveKitToken) {
    return (
      <LiveKitRoom token={liveKitToken} serverUrl={import.meta.env.VITE_LIVEKIT_URL} connect={true}>
        <StreamPublisher stream={streamRef.current} />
        {roomContent}
      </LiveKitRoom>
    );
  }

  // في حالة انتظار التوكن، نعرض الواجهة محلياً فقط مؤقتاً
  return roomContent;
};
