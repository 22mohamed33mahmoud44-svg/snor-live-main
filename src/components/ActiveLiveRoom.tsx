
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { supabase } from '../supabase';
import { endLiveStreamOnServer } from '../utils/endLiveStreamOnServer';
import { createCallMessageSender } from '../utils/callMessageSender';
import { createCancelableMediaCapture } from '../utils/cancelableMediaCapture';
import { addStreamLikeBatch, reconcileStreamLikeSnapshot } from '../utils/streamLikeCounter';
import { mergeStreamChatHistory, acknowledgeStreamChatMessage } from '../utils/mergeStreamChatHistory';
import { LiveKitRoom, useRoomContext, useConnectionState } from '@livekit/components-react';
import { Track, ConnectionState } from 'livekit-client';

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
  created_at?: string;
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

type StreamChatMessage = {
  id: string;
  stream_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at?: string;
};

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
const StreamPublisher = memo(({
  stream, onPublished, onPublishError,
}: {
  stream: MediaStream | null;
  onPublished: () => void;
  onPublishError: (error: Error) => void;
}) => {
  const room = useRoomContext();
  const connectionState = useConnectionState();

  useEffect(() => {
    // A LiveKitRoom can render before its websocket is connected. Publishing
    // there fails and does not automatically retry without this state check.
    if (!stream || connectionState !== ConnectionState.Connected) return;
    let disposed = false;

    const publishTracks = async () => {
      try {
        const liveTracks = stream.getTracks().filter(track => track.readyState === 'live');
        if (!liveTracks.length) throw new Error('No active broadcaster media tracks');
        for (const track of liveTracks) {
          if (disposed || track.readyState !== 'live') return;
          const source = track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone;
          // LiveKit may restore publications itself after reconnecting.
          if (room.localParticipant.getTrackPublication(source)) continue;
          await room.localParticipant.publishTrack(track, {
            simulcast: track.kind === 'video',
            source,
          });
          if (disposed) {
            const pub = room.localParticipant.getTrackPublication(source);
            if (pub?.track?.mediaStreamTrack === track) {
              await room.localParticipant.unpublishTrack(pub.track, false);
            }
            return;
          }
        }
        if (!disposed) onPublished();
      } catch (error) {
        if (!disposed) {
          console.error('تعذر نشر كاميرا أو ميكروفون البث:', error);
          onPublishError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    void publishTracks();
    return () => {
      disposed = true;
      for (const track of stream.getTracks()) {
        const source = track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone;
        const pub = room.localParticipant.getTrackPublication(source);
        if (pub?.track?.mediaStreamTrack === track) {
          // The studio owns this MediaStream. Do not stop its device tracks
          // during a temporary reconnect or effect teardown.
          void room.localParticipant.unpublishTrack(pub.track, false).catch(error => {
            console.error('تعذر إلغاء نشر مسار البث:', error);
          });
        }
      }
    };
  }, [room, stream, connectionState, onPublished, onPublishError]);

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
// Keep an unsent draft in place until Supabase acknowledges the write.
const ChatInputArea = memo(({ onSendMessage }: { onSendMessage: (text: string) => Promise<boolean> }) => {
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const draft = chatInput;
    if (!draft.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      if (await onSendMessage(draft)) {
        // If the streamer typed more while the insert was pending, keep it.
        setChatInput(current => current === draft ? '' : current);
      } else {
        setSendError('تعذر إرسال الرسالة. النص محفوظ هنا لإعادة المحاولة.');
      }
    } catch (error) {
      console.error('Stream chat submission failed:', error);
      setSendError('تعذر إرسال الرسالة. النص محفوظ هنا لإعادة المحاولة.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <form style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }} onSubmit={e => { void handleSubmit(e); }}>
      <div style={styles.chatInputRow}>
        <input
          type="text"
          value={chatInput}
          onChange={e => { setChatInput(e.target.value); if (sendError) setSendError(null); }}
          placeholder="تحدث مع المتابعين..."
          style={styles.chatInput}
        />
        <button type="submit" disabled={sending || !chatInput.trim()} style={{ ...styles.chatSendBtn, opacity: sending ? 0.5 : 1 }} aria-label="إرسال">
          {sending ? '…' : '💬'}
        </button>
      </div>
      {sendError && <p role="alert" style={{ color: '#fecaca', background: 'rgba(127,29,29,.6)', borderRadius: 8, padding: '6px 10px', fontSize: '.75rem', margin: 0 }}>{sendError}</p>}
    </form>
  );
});

// ── EndStreamModal ──
const EndStreamModal = memo(({ onConfirm, onCancel, pending, error }: { onConfirm: () => void; onCancel: () => void; pending: boolean; error: string | null }) => (
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
      {error && <p role="alert" style={{ color: '#fecaca', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button disabled={pending} onClick={onCancel} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", touchAction: 'manipulation' }}>تراجع</button>
        <button disabled={pending} onClick={onConfirm} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", boxShadow: '0 4px 15px rgba(239,68,68,0.35)', touchAction: 'manipulation' }}>{pending ? 'جاري تأكيد الإنهاء...' : 'إنهاء البث'}</button>
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
  const [endingStream, setEndingStream]     = useState(false);
  const [endError, setEndError]             = useState<string | null>(null);
  const [cameraReady, setCameraReady]       = useState(false);
  const [captureError, setCaptureError]     = useState<string | null>(null);
  const [cameraAttempt, setCameraAttempt]   = useState(0);
  const [liveKitToken, setLiveKitToken]     = useState<string | null>(null);
  const [liveKitError, setLiveKitError]     = useState<string | null>(null);
  const [mediaPublished, setMediaPublished] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  // Room events and publisher callbacks belong to a specific attempt.
  // Reconnection must never let stale events mark the new room LIVE/failed.
  const roomAttemptId = `${streamId}-${connectionAttempt}`;
  const activeRoomAttemptRef = useRef(roomAttemptId);
  activeRoomAttemptRef.current = roomAttemptId;

  const videoRef            = useRef<HTMLVideoElement>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const roomChannelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRunning    = useRef(false);
  const endingRef          = useRef(false);

  const filtersList = [
    { id: 'natural',    effect: 'none' },
    { id: 'beauty',     effect: 'blur(0.4px) brightness(1.02) contrast(0.98)' },
    { id: 'brightness', effect: 'brightness(1.15)' },
    { id: 'blush',      effect: 'hue-rotate(350deg) saturate(1.2)' },
    { id: 'cinema',     effect: 'sepia(0.2) contrast(1.05)' },
    { id: 'cyberpunk',  effect: 'hue-rotate(300deg) saturate(1.25)' },
  ];
  const activeFilterEffect = filtersList.find(f => f.id === filterId)?.effect ?? 'none';

  // A missing LiveKit token must not leave the broadcaster looking LIVE.
  useEffect(() => {
    let cancelled = false;
    setLiveKitToken(null);
    setLiveKitError(null);
    setMediaPublished(false);

    const tokenTimeout = window.setTimeout(() => {
      cancelled = true;
      setLiveKitError('انتهت مهلة الاتصال بخادم البث. أعد المحاولة أو أنهِ البث.');
    }, 20_000);

    async function fetchToken() {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { room: streamId, username: myUsername || 'المذيع', isStreamer: true },
        });
        if (cancelled) return;
        if (error || !data?.token) throw error ?? new Error('Missing broadcaster LiveKit token');
        setLiveKitToken(data.token);
      } catch (error) {
        if (!cancelled) {
          console.error('Broadcaster LiveKit token failed:', error);
          setLiveKitError('تعذر تجهيز البث على الخادم. أعد المحاولة أو أنهِ البث.');
        }
      } finally {
        window.clearTimeout(tokenTimeout);
      }
    }

    void fetchToken();
    return () => {
      cancelled = true;
      window.clearTimeout(tokenTimeout);
    };
  }, [streamId, myUsername, connectionAttempt]);

  const handleMediaPublished = useCallback((attemptId: string) => {
    if (activeRoomAttemptRef.current !== attemptId || endingRef.current) return;
    setMediaPublished(true);
    setLiveKitError(null);
  }, []);

  const handleMediaFailure = useCallback((attemptId: string, error: Error) => {
    if (activeRoomAttemptRef.current !== attemptId || endingRef.current) return;
    console.error('Broadcaster LiveKit media failure:', error);
    setMediaPublished(false);
    setLiveKitError('تعذر توصيل الصوت أو الصورة للمشاهدين. أعد الاتصال أو أنهِ البث.');
  }, []);

  // Publisher effects depend on callback identity. Stable callbacks prevent
  // a one-second uptime/chat/like re-render from unpublishing and republishing
  // camera/mic tracks over and over during a healthy connection.
  const onPublishedForAttempt = useCallback(() => {
    handleMediaPublished(roomAttemptId);
  }, [handleMediaPublished, roomAttemptId]);
  const onPublishErrorForAttempt = useCallback((error: Error) => {
    handleMediaFailure(roomAttemptId, error);
  }, [handleMediaFailure, roomAttemptId]);

  // Waiting for a token, a WebSocket, or a track publish must be bounded.
  useEffect(() => {
    if (!liveKitToken || mediaPublished || liveKitError) return;
    const watchdog = window.setTimeout(() => {
      if (activeRoomAttemptRef.current !== roomAttemptId || endingRef.current) return;
      setLiveKitError('تأخر نشر البث للمشاهدين. جرّب إعادة الاتصال.');
    }, 35_000);
    return () => window.clearTimeout(watchdog);
  }, [liveKitToken, mediaPublished, liveKitError, roomAttemptId]);

  const retryMediaConnection = useCallback(() => {
    // Invalidate old LiveKitRoom/StreamPublisher callbacks BEFORE the old
    // room is unmounted and its onDisconnected fires.
    activeRoomAttemptRef.current = `${streamId}-${connectionAttempt + 1}`;
    setMediaPublished(false);
    setLiveKitError(null);
    setCaptureError(null);
    setLiveKitToken(null);
    // Refresh device permissions as well as the LiveKit connection when
    // the camera itself failed. A token-only retry could never fix it.
    if (!initialStream && !cameraReady) setCameraAttempt(attempt => attempt + 1);
    setConnectionAttempt(attempt => attempt + 1);
  }, [initialStream, cameraReady, streamId, connectionAttempt]);

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
    if (endingRef.current) return;
    endingRef.current = true;
    setEndingStream(true);
    setEndError(null);
    try {
      // Keep publishing and heartbeating until the server confirms the end.
      // If the write fails or affects zero rows, the broadcaster must be
      // able to retry instead of leaving a ghost live_streams record.
      if (!(await endLiveStreamOnServer(streamId, String(myUserId)))) {
        setEndError('لم يتم تأكيد إنهاء البث على الخادم. تحقق من الإنترنت وحاول مرة أخرى.');
        return;
      }
      stopHeartbeat();
      streamRef.current?.getTracks().forEach(track => track.stop());
      onEndStream();
    } catch (error) {
      console.error('Stream shutdown failed:', error);
      setEndError('تعذر تأكيد إنهاء البث. أعد المحاولة.');
    } finally {
      endingRef.current = false;
      setEndingStream(false);
    }
  }, [streamId, myUserId, stopHeartbeat, onEndStream]);

  // ── الكاميرا ──
  useEffect(() => {
    setCameraReady(false);
    setCaptureError(null);

    if (initialStream) {
      streamRef.current = initialStream;
      if (videoRef.current) videoRef.current.srcObject = initialStream;
      const hasLiveTracks = initialStream.getTracks().some(track => track.readyState === 'live');
      setCameraReady(hasLiveTracks);
      if (!hasLiveTracks) {
        setCaptureError('انتهت صلاحية الكاميرا أو الميكروفون. أنهِ البث وأعد المحاولة.');
      }

      return () => {
        initialStream.getTracks().forEach(track => track.stop());
        if (streamRef.current === initialStream) streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      };
    }

    const capture = createCancelableMediaCapture(
      () => navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', aspectRatio: 9 / 16, width: { ideal: 720, max: 1080 }, height: { ideal: 1280, max: 1920 }, frameRate: { ideal: 24, max: 30 } },
        audio: true,
      }),
      stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      },
      error => {
        console.error('تعذر تشغيل كاميرا أو ميكروفون البث:', error);
        setCameraReady(false);
        setCaptureError('تعذر تشغيل الكاميرا أو الميكروفون. تحقق من أذونات المتصفح وأعد المحاولة.');
      },
    );
    void capture.start();

    return () => {
      // Dispose first: a pending getUserMedia may resolve after this cleanup.
      // The helper stops every late track and ignores old permission errors.
      capture.dispose();
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [initialStream, cameraAttempt]);

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
    let isMounted = true;
    startHeartbeat();

    const fetchOldMessages = async () => {
      try {
        const { data, error } = await supabase.from('stream_chat')
          .select('*').eq('stream_id', streamId)
          .order('created_at', { ascending: false }).limit(MESSAGES_LIMIT);
        if (!isMounted) return;
        if (error) {
          console.warn('Unable to load broadcaster chat history:', error);
          return;
        }
        if (!data) return;
        const recentHistory: ChatMessage[] = data.slice().reverse().map(m => ({
          id: m.id, user: m.username, userId: m.user_id, text: m.message,
          color: m.user_id === myUserId ? '#ff2a74' : '#00d4ff',
          created_at: m.created_at,
        }));
        // A message may arrive from Realtime while history is in flight.
        setChatMessages(current => mergeStreamChatHistory(recentHistory, current, MESSAGES_LIMIT));
      } catch (error) {
        if (isMounted) console.warn('Broadcaster chat history request failed:', error);
      }
    };

    const roomChannel = supabase.channel(`room-${streamId}`, { config: { presence: { key: myUserId } } });
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat', filter: `stream_id=eq.${streamId}` }, (payload) => {
        if (!isMounted) return;
        const newMsg = payload.new as StreamChatMessage;
        // Our own inserts are acknowledged with their real DB IDs below.
        // Avoid guessing which pending bubble matches a repeated text.
        if (newMsg.user_id === myUserId) return;
        setChatMessages(prev => mergeStreamChatHistory([{
          id: newMsg.id, user: newMsg.username, userId: newMsg.user_id, text: newMsg.message,
          color: '#60a5fa', created_at: newMsg.created_at, isOptimistic: false,
        }], prev, MESSAGES_LIMIT));
      })
      .on('broadcast', { event: 'like' }, () => {
        if (isMounted) setLikesCount(prev => addStreamLikeBatch(prev, 1));
      })
      .on('broadcast', { event: 'like_batch' }, ({ payload }) => {
        if (isMounted) setLikesCount(prev => addStreamLikeBatch(prev, payload?.count));
      })
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
        if (status === 'SUBSCRIBED' && isMounted) {
          // Backfill after subscription, including each Realtime reconnect,
          // so there is no SELECT-before-subscribe gap for incoming messages.
          void roomChannel.track({ user_id: String(myUserId), role: 'streamer', online_at: new Date().toISOString() });
          void fetchOldMessages();
        }
      });

    supabase.from('live_streams').select('likes_count').eq('id', streamId).maybeSingle().then(({ data }) => {
      if (isMounted && data?.likes_count != null) {
        // A delayed initial snapshot can be older than realtime like events.
        setLikesCount(current => reconcileStreamLikeSnapshot(current, data.likes_count));
      }
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
      isMounted = false;
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

  // ── حفظ شات المذيع بأمان مع منع الطلبات المكررة ──
  const messageSender = useMemo(() => createCallMessageSender<StreamChatMessage>(async (message: string) => {
    // The returned row acknowledges delivery even without a Realtime echo.
    const { data, error } = await supabase.from('stream_chat').insert([{
      stream_id: streamId, user_id: String(myUserId),
      username: myUsername || 'المذيع', message,
    }])
      .select('id, stream_id, user_id, username, message, created_at')
      .single();
    return {
      data,
      error: error ?? (!data?.id ? new Error('Missing persisted broadcaster chat ID') : null),
    };
  }), [streamId, myUserId, myUsername]);

  const handleSendMessage = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim() || messageSender.isSending()) return false;
    const optimisticId = `opt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    setChatMessages(prev => [
      ...prev.slice(-(MESSAGES_LIMIT - 1)),
      { id: optimisticId, user: myUsername || 'المذيع', userId: myUserId, text: text.trim(), color: '#ff2a74', isOptimistic: true },
    ]);

    const result = await messageSender.send(text);
    if (result.status !== 'sent' || !result.data?.id) {
      setChatMessages(prev => prev.filter(message => message.id !== optimisticId));
      return false;
    }
    // Reconcile the exact pending bubble by ID; an identical new draft or
    // delayed history event cannot steal another message's acknowledgement.
    const saved = result.data;
    setChatMessages(prev => acknowledgeStreamChatMessage(prev, optimisticId, {
      id: saved.id, user: saved.username, userId: saved.user_id,
      text: saved.message, color: '#ff2a74', created_at: saved.created_at,
      isOptimistic: false,
    }, MESSAGES_LIMIT));
    return true;
  }, [messageSender, myUserId, myUsername]);

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

  const broadcastProblem = captureError || liveKitError;

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
              <span style={{ fontSize: '0.65rem', color: mediaPublished ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>{mediaPublished ? `LIVE ${formatTime(uptime)}` : 'جاري تجهيز البث'}</span>
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

      {!mediaPublished && (
        <div
          onClick={event => event.stopPropagation()}
          role={broadcastProblem ? 'alert' : 'status'}
          style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3, 7, 18, 0.92)', color: '#fff', padding: 22, textAlign: 'center' }}
        >
          <div style={{ maxWidth: 340, display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 14 }}>
            <strong>{broadcastProblem ? 'تعذر تجهيز البث للمشاهدين' : 'جاري تجهيز الاتصال بالبث...'}</strong>
            {broadcastProblem && <p style={{ color: '#fecaca', fontSize: '0.87rem', margin: 0 }}>{broadcastProblem}</p>}
            {broadcastProblem && <button type="button" onClick={retryMediaConnection} style={{ border: 0, borderRadius: 10, background: '#0e7490', color: '#fff', padding: '12px 18px', fontWeight: 700 }}>إعادة الاتصال</button>}
            <button type="button" onClick={() => setShowEndModal(true)} style={{ border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, background: 'rgba(255,255,255,.12)', color: '#fff', padding: '10px 16px' }}>إنهاء البث</button>
          </div>
        </div>
      )}

      {showEndModal && (
        <EndStreamModal
          onConfirm={() => { void endStreamSafely(); }}
          onCancel={() => { if (!endingStream) { setEndError(null); setShowEndModal(false); } }}
          pending={endingStream}
          error={endError}
        />
      )}
    </div>
  );

  // إذا تم استلام مفتاح LiveKit، نقوم بتغليف الواجهة به للاتصال بالخادم
  if (liveKitToken && !broadcastProblem) {
    return (
      <LiveKitRoom
        key={roomAttemptId}
        token={liveKitToken}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        connect={true}
        video={false}
        audio={false}
        onError={(error) => handleMediaFailure(roomAttemptId, error)}
        onDisconnected={() => {
          handleMediaFailure(roomAttemptId, new Error('Broadcaster disconnected from LiveKit'));
        }}
      >
        <StreamPublisher
          stream={streamRef.current}
          onPublished={onPublishedForAttempt}
          onPublishError={onPublishErrorForAttempt}
        />
        {roomContent}
      </LiveKitRoom>
    );
  }

  // Remain in the safe local preview with a retry/exit overlay if token fails.
  return roomContent;
};
