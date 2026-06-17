import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

interface ActiveLiveRoomProps {
  streamId: string;
  title: string;
  filterId: string;
  myUserId: string;
  myUsername: string;
  onEndStream: () => void;
}

interface ChatMessage {
  id: string;
  user: string;
  userId: string;
  text: string;
  color: string;
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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const giftAnimationStyle = `
  @keyframes giftSlideIn {
    from { opacity: 0; transform: translateY(-16px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  @keyframes giftFadeOut {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  .gift-item {
    animation: giftSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }
  .gift-item-exit {
    animation: giftFadeOut 0.4s ease forwards;
  }
`;

const HEARTBEAT_INTERVAL_MS = 20_000;

export default function ActiveLiveRoom({ streamId, title, filterId, myUserId, myUsername, onEndStream }: ActiveLiveRoomProps) {
  const [viewers, setViewers]             = useState(1);
  const [likesCount, setLikesCount]       = useState(0);
  const [uptime, setUptime]               = useState(0);
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [giftToast, setGiftToast]         = useState<GiftToast | null>(null);
  const [receivedGifts, setReceivedGifts] = useState<ReceivedGift[]>([]);
  const [bannedUsers, setBannedUsers]     = useState<Set<string>>(new Set());
  const [banToast, setBanToast]           = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null); // بديل للـ Hover عشان الموبايل باللمس

  const videoRef            = useRef<HTMLVideoElement>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const peerConnectionsRef  = useRef<Map<string, RTCPeerConnection>>(new Map());
  const roomChannelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  const filtersList = [
    { id: 'natural',    effect: 'none' },
    { id: 'beauty',     effect: 'blur(0.4px) brightness(1.02) contrast(0.98)' },
    { id: 'brightness', effect: 'brightness(1.15)' },
    { id: 'blush',      effect: 'hue-rotate(350deg) saturate(1.2)' },
    { id: 'cinema',     effect: 'sepia(0.2) contrast(1.05)' },
    { id: 'cyberpunk',  effect: 'hue-rotate(300deg) saturate(1.25)' },
  ];
  const activeFilterEffect = filtersList.find(f => f.id === filterId)?.effect || 'none';

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  const sendHeartbeat = useCallback(async () => {
    const { error } = await supabase.rpc('update_stream_heartbeat', { p_stream_id: streamId });
    if (error) console.warn('Heartbeat error:', error.message);
  }, [streamId]);

  const startHeartbeat = useCallback(() => {
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── إنهاء البث بأمان ──────────────────────────────────────────────────────

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

  // ── الكاميرا (تعديل الأبعاد لتناسب شاشات الموبايل الرأسية 9:16) ──────────────

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'user', 
        aspectRatio: 9 / 16, // إجبار المتصفح على الأبعاد العمودية
        width: { ideal: 720, max: 1080 }, // أبعاد مثالية للموبايل لمنع استهلاك الباقة
        height: { ideal: 1280, max: 1920 },
        frameRate: { ideal: 24, max: 30 } 
      },
      audio: true,
    }).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(err => console.error('الكاميرا غير متاحة:', err));

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, []);

  // ── عداد الوقت ────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Heartbeat lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    if (!streamId) return;
    startHeartbeat();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopHeartbeat();
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`,
          JSON.stringify({ is_live: false })
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

  // ── دالة لتحديد سقف الـ Bitrate للموبايل لمنع تشنج البث والتهنيج ──────────────

  const applyBitrateLimit = async (pc: RTCPeerConnection) => {
    // ننتظر حتى يبدأ تبادل التراكات
    setTimeout(async () => {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender) {
        try {
          const parameters = videoSender.getParameters();
          if (!parameters.encodings) parameters.encodings = [{}];
          
          // وضع سقف 450kbps؛ جودة خرافية وموفرة جداً للموبايل
          parameters.encodings[0].maxBitrate = 450_000; 
          await videoSender.setParameters(parameters);
          console.log('✅ تم تحديد سقف الـ Bitrate بنجاح للمشاهد');
        } catch (e) {
          console.error('فشل تحديد سقف الـ Bitrate:', e);
        }
      }
    }, 2000);
  };

  // ── Realtime channel ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!streamId) return;

    supabase
      .from('stream_chat')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: true })
      .limit(30)
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
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev.slice(-25), {
            id: newMsg.id,
            user: newMsg.username,
            userId: newMsg.user_id,
            text: newMsg.message,
            color: newMsg.user_id === myUserId ? '#ff2a74' : '#60a5fa',
          }];
        });
      })
      .on('broadcast', { event: 'like' }, () => {
        setLikesCount(prev => prev + 1);
      })
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        const id = Date.now() + Math.random();
        setGiftToast({ id, senderName: payload?.senderName, emoji: payload?.emoji, giftName: payload?.giftName });
        setTimeout(() => setGiftToast(null), 3000);
      })
      .on('broadcast', { event: 'gift_sent' }, ({ payload }) => {
        if (!payload) return;
        const id = Date.now() + Math.random();
        const gift = { id, senderName: payload.senderName || 'متابع', emoji: payload.emoji || '🎁', giftName: payload.giftName || 'هدية', cost: payload.cost || 0 };
        setReceivedGifts(prev => [gift, ...prev].slice(0, 5));
        setTimeout(() => setReceivedGifts(prev => prev.filter(g => g.id !== id)), 4000);
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
          roomChannel.track({ user_id: myUserId, role: 'streamer', online_at: new Date().toISOString() });
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
  }, [streamId, myUserId]);

  // ── WebRTC ────────────────────────────────────────────────────────────────

  const createPeerConnection = (viewerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current!));
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        roomChannelRef.current?.send({
          type: 'broadcast', event: 'ice-candidate',
          payload: { candidate: event.candidate, targetId: viewerId, senderId: myUserId },
        });
      }
    };
    
    // تطبيق سقف الـ Bitrate للاتصال الجديد فوراً لتوفير الباقة والحرارة
    applyBitrateLimit(pc);
    
    peerConnectionsRef.current.set(viewerId, pc);
    return pc;
  };

  // ── ✅ حظر مستخدم ─────────────────────────────────────────────────────────

  const handleBanUser = async (targetUserId: string, targetUsername: string) => {
    if (targetUserId === myUserId) return;
    if (bannedUsers.has(targetUserId)) {
      setBanToast(`${targetUsername} محظور بالفعل`);
      setTimeout(() => setBanToast(null), 2000);
      return;
    }

    const { data, error } = await supabase.rpc('ban_user_from_stream', {
      p_stream_id: streamId,
      p_user_id:   targetUserId,
      p_reason:    'banned by streamer',
    });

    if (error || !data?.success) {
      setBanToast('تعذر حظر المستخدم');
    } else {
      setBannedUsers(prev => new Set([...prev, targetUserId]));
      setChatMessages(prev => prev.filter(m => m.userId !== targetUserId));
      setBanToast(`تم حظر ${targetUsername} ✅`);
    }
    setTimeout(() => setBanToast(null), 2500);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    const localId = Date.now().toString();
    setChatMessages(prev => [...prev, { id: localId, user: myUsername || 'المذيع', userId: myUserId, text, color: '#ff2a74' }]);
    await supabase.from('stream_chat').insert([{
      stream_id: streamId,
      user_id:   myUserId,
      username:  myUsername || 'المذيع',
      message:   text,
    }]);
  };

  // ── End stream ────────────────────────────────────────────────────────────

  const handleEndStream = () => {
    if (window.confirm('هل أنت متأكد أنك تريد إنهاء البث المباشر؟')) {
      endStreamSafely();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', direction: 'rtl', fontFamily: "'Cairo', sans-serif", overflow: 'hidden' }}>

      <style>{giftAnimationStyle}</style>

      {/* فيديو الكاميرا بأبعاد موبايل رأسية كاملة */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilterEffect, transform: 'scaleX(-1)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 20%, transparent 60%, rgba(0,0,0,0.7) 100%)' }} />
      </div>

      {/* Toast هدية مستلمة */}
      {giftToast && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 80px)', left: '50%', transform: 'translateX(-50%)', zIndex: 30, background: 'rgba(251,191,36,0.25)', border: '1px solid rgba(251,191,36,0.6)', borderRadius: '50px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(16px)', whiteSpace: 'nowrap', boxShadow: '0 0 20px rgba(251,191,36,0.2)' }}>
          <span style={{ fontSize: '1.6rem' }}>{giftToast.emoji}</span>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>{giftToast.senderName} أرسل لك {giftToast.giftName} 🎉</span>
        </div>
      )}

      {/* Toast الحظر */}
      {banToast && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 80px)', left: '50%', transform: 'translateX(-50%)', zIndex: 31, background: 'rgba(239,68,68,0.85)', borderRadius: '50px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(16px)', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>🚫 {banToast}</span>
        </div>
      )}

      {/* شريط الهدايا التراكمي العائم للمذيع */}
      {receivedGifts.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 70px)', right: '12px', zIndex: 25, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '220px', pointerEvents: 'none' }}>
          {receivedGifts.map(gift => (
            <div key={gift.id} className="gift-item" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, rgba(124,58,237,0.65), rgba(251,191,36,0.45))', border: '1px solid rgba(251,191,36,0.5)', borderRadius: '50px', padding: '7px 14px', backdropFilter: 'blur(18px)', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>
              <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{gift.emoji}</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fde68a', fontSize: '0.7rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gift.senderName}</span>
                <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {gift.giftName}
                  <span style={{ color: '#fbbf24', fontWeight: 900 }}>+{gift.cost} 🪙</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* واجهة التحكم الأساسية للموبايل */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' }}>

        {/* هيدر البث العلوي */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 'max(8px, env(safe-area-inset-top))', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '50px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ff2a74', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: '#fff' }}>أنت</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{myUsername || title}</span>
              <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>LIVE {formatTime(uptime)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto' }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '6px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800 }}>👁️ {viewers}</div>
            <div style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '6px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800 }}>❤️ {likesCount}</div>
            <button onClick={handleEndStream} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(239,68,68,0.85)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* منطقة شاشة الشات المدمجة العائمة للموبايل */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 'max(8px, env(safe-area-inset-bottom))', width: '100%' }}>
          <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: '4px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ flex: 1 }} />

            {chatMessages.map(msg => (
              <div
                key={msg.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '85%' }}
                onClick={() => setSelectedMsgId(prev => prev === msg.id ? null : msg.id)} // الضغط يظهر زر الحظر للموبايل
              >
                <div style={{ display: 'inline-block', background: bannedUsers.has(msg.userId) ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.45)', padding: '8px 14px', borderRadius: '18px', backdropFilter: 'blur(6px)', border: `1px solid ${bannedUsers.has(msg.userId) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                  <span style={{ color: msg.color, fontSize: '0.75rem', fontWeight: 800, marginLeft: '6px' }}>{msg.user}:</span>
                  <span style={{ color: '#fff', fontSize: '0.8rem' }}>{msg.text}</span>
                </div>

                {/* زر الحظر باللمس يظهر للمذيع فور الضغط على رسالة المستخدم */}
                {msg.userId !== myUserId && selectedMsgId === msg.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBanUser(msg.userId, msg.user);
                    }}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(239,68,68,0.95)',
                      border: 'none', color: '#fff', fontSize: '0.8rem',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  >
                    🚫
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* صندوق إدخال الشات العريض والمريح لإصبع الإبهام */}
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="تحدث مع المتابعين..."
              style={{ flex: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50px', padding: '12px 18px', color: '#fff', fontSize: '0.85rem', outline: 'none', backdropFilter: 'blur(10px)' }}
            />
            <button type="submit" style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #3b82f6)', border: 'none', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 2px 10px rgba(59,130,246,0.3)' }}>💬</button>
          </form>
        </div>
      </div>
    </div>
  );
}