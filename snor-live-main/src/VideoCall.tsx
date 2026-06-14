import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';

type Props = {
  userId: string;
  matchId: string;
  remoteUserId: string;
  onEnd: () => void;
  onNext: () => void;
};

// ── CONSTANTS & AUDIO FX ──
const SFX_CONNECTING = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav'; 
const SFX_END = 'https://assets.mixkit.co/active_storage/sfx/2564/2564-84.wav';    

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443',
    ],
    username: '33c573ac1dd5ec4a29556327',
    credential: 'UuRkAsEjWoPrAG8Y',
  },
];

type ErrorType = 'camera_denied' | 'camera_not_found' | 'connection_timeout' | 'connection_failed' | null;

// ── MODERN SVG ICONS ──
const MicIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>;
const MicOffIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 10.8 5.84"/><path d="M12 2a3 3 0 0 0-3 3v1.17M10.34 5.34A3 3 0 0 0 15 8v1.17"/><line x1="12" x2="12" y1="19" y2="22"/></svg>;
const VideoIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>;
const VideoOffIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" x2="22" y1="2" y2="22"/></svg>;
const FlipIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 16a9 9 0 0 1 15-6.73L21 12"/><path d="M21 8v4h-4"/><path d="M21 8a9 9 0 0 1-15 6.73L3 12"/><path d="M3 16v-4h4"/></svg>;
const ChatIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const NextIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>;
const EndIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="2" x2="22" y1="2" y2="22"/></svg>;
const SendIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;

export default function VideoCall({ userId, matchId, remoteUserId, onEnd, onNext }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef        = useRef<RTCPeerConnection | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const sigChannelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMounted      = useRef(true);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sfxRef         = useRef<HTMLAudioElement | null>(null);

  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet     = useRef(false);
  const offerSent         = useRef(false);
  const isOfferer         = useRef(false);

  const [muted,        setMuted]        = useState(false);
  const [camOff,       setCamOff]       = useState(false);
  const [mirrored,     setMirrored]     = useState(true);
  const [duration,     setDuration]     = useState(0);
  const [messages,     setMessages]     = useState<{ id: string; sender_id: string; message: string }[]>([]);
  const [input,        setInput]        = useState('');
  const [showChat,     setShowChat]     = useState(false);
  const [connected,    setConnected]    = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [newMsg,       setNewMsg]       = useState(false);
  const [error,        setError]        = useState<ErrorType>(null);
  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => console.log('🎥 [VideoCall PRO]:', msg), []);

  const playSFX = useCallback((src: string, loop = false) => {
    if (sfxRef.current) { sfxRef.current.pause(); sfxRef.current = null; }
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = 0.4;
    audio.play().catch(() => {});
    sfxRef.current = audio;
  }, []);

  const stopSFX = useCallback(() => {
    if (sfxRef.current) { sfxRef.current.pause(); sfxRef.current = null; }
  }, []);

  const sendSignal = useCallback(async (type: string, data: unknown) => {
    const { error } = await supabase.from('signals').insert({
      match_id: matchId, type, data, sender: userId,
    });
    if (error) log(`send ${type} failed: ${error.message}`);
  }, [matchId, userId, log]);

  const flushIceCandidates = useCallback(async () => {
    const peer  = peerRef.current;
    const queue = iceCandidateQueue.current.splice(0);
    if (!peer || queue.length === 0) return;
    for (const c of queue) {
      try { await peer.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('ICE flush error:', e); }
    }
  }, []);

  const applyRemoteDescription = useCallback(async (peer: RTCPeerConnection, sdp: RTCSessionDescriptionInit) => {
    if (remoteDescSet.current) return;
    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet.current = true;
    await flushIceCandidates();
  }, [flushIceCandidates]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!showChat) setShowControls(false);
    }, 5000); 
  }, [showChat]);

  // تنظيف كامل ومطلق للذاكرة والقنوات لمنع أي تعليق (حل المشكلة 9)
  const cleanupConnections = useCallback(async () => {
    stopSFX();
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    
    peerRef.current?.close();
    peerRef.current = null;
    
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    if (sigChannelRef.current)  { await supabase.removeChannel(sigChannelRef.current);  sigChannelRef.current  = null; }
    if (chatChannelRef.current) { await supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null; }
  }, [stopSFX]);

  const endMatch = useCallback(async () => {
    playSFX(SFX_END);
    await supabase.from('matches').update({ status: 'ended' }).eq('id', matchId);
    await supabase.from('signals').insert({ match_id: matchId, type: 'end', data: {}, sender: userId });
    await cleanupConnections();
  }, [matchId, userId, playSFX, cleanupConnections]);

  const handleEnd = useCallback(async () => {
    await endMatch();
    onEnd();
  }, [endMatch, onEnd]);

  const handleNext = useCallback(async () => {
    await endMatch();
    onNext(); // الـ Next سيعمل الآن فوراً ومن أول ضغطة بدون تعليق (حل المشكلة 8)
  }, [endMatch, onNext]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); stopSFX(); };
  }, [resetControlsTimer, stopSFX]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    isMounted.current         = true;
    remoteDescSet.current     = false;
    offerSent.current         = false;
    isOfferer.current         = false;
    iceCandidateQueue.current = [];
    
    if (!connected) playSFX(SFX_CONNECTING, true);

    const start = async () => {
      try {
        // طلب الكاميرا والميكروفون بأبعاد فخمة متناسقة مع التابلت والموبايل
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            facingMode: 'user',
            frameRate: { ideal: 30 }
          },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        if (!isMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        connectionTimer.current = setTimeout(() => {
          if (!isMounted.current || connected) return;
          setError('connection_timeout');
        }, 30000);

        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerRef.current = peer;

        peer.onconnectionstatechange = () => {
          if (!isMounted.current) return;
          const state = peer.connectionState;
          log(`حالة بروتوكول الاتصال: ${state}`);
          if (state === 'connected') {
            setConnected(true);
            setError(null);
            stopSFX();
            if (connectionTimer.current) clearTimeout(connectionTimer.current);
          }
          if (state === 'failed') {
            setError('connection_failed');
            peer.restartIce();
          }
          if (state === 'disconnected') setConnected(false);
        };

        peer.oniceconnectionstatechange = () => {
          if (peer.iceConnectionState === 'failed') {
            peer.restartIce();
          }
        };

        stream.getTracks().forEach(t => peer.addTrack(t, stream));

        peer.ontrack = e => {
          if (remoteVideoRef.current && e.streams[0])
            remoteVideoRef.current.srcObject = e.streams[0];
        };

        peer.onicecandidate = e => {
          if (!e.candidate || !isMounted.current) return;
          sendSignal('candidate', e.candidate.toJSON());
        };

        const channelName = `vc-${matchId}-${Date.now()}`;
        const sigChannel = supabase
          .channel(channelName)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'signals', filter: `match_id=eq.${matchId}` },
            async payload => {
              if (!isMounted.current) return;
              const msg = payload.new as { sender: string; type: string; data: any };
              if (msg.sender === userId) return;
              const p = peerRef.current;
              if (!p || p.signalingState === 'closed') return;
              try {
                if (msg.type === 'offer') {
                  if (isOfferer.current || p.signalingState !== 'stable') return;
                  await applyRemoteDescription(p, msg.data);
                  const answer = await p.createAnswer();
                  await p.setLocalDescription(answer);
                  await sendSignal('answer', answer);
                  return;
                }
                if (msg.type === 'answer') {
                  if (!isOfferer.current || p.signalingState !== 'have-local-offer') return;
                  await applyRemoteDescription(p, msg.data);
                  return;
                }
                if (msg.type === 'candidate') {
                  if (remoteDescSet.current) {
                    await p.addIceCandidate(new RTCIceCandidate(msg.data));
                  } else {
                    iceCandidateQueue.current.push(msg.data);
                  }
                  return;
                }
                if (msg.type === 'end') {
                  if (isMounted.current) onEnd();
                  return;
                }
              } catch (err: any) { log(`خطأ في الإشارة السلكية: ${err.message}`); }
            })
          .subscribe(status => {
            if (status !== 'SUBSCRIBED' || !isMounted.current) return;
            if (offerSent.current) return;

            const shouldOffer = !!remoteUserId && userId < remoteUserId;
            isOfferer.current = shouldOffer;

            if (!shouldOffer) {
              const POLL_INTERVAL = 1500;
              const POLL_TIMEOUT  = 30000;
              const pollStart     = Date.now();
              const pollForOffer  = async () => {
                if (!isMounted.current || remoteDescSet.current) return;
                if (Date.now() - pollStart > POLL_TIMEOUT) return;
                const p = peerRef.current;
                if (!p || p.signalingState === 'closed') return;
                try {
                  const { data, error } = await supabase
                    .from('signals').select('*')
                    .eq('match_id', matchId).eq('type', 'offer').neq('sender', userId)
                    .order('created_at', { ascending: false }).limit(1).single();
                  if (error || !data) { setTimeout(pollForOffer, POLL_INTERVAL); return; }
                  if (remoteDescSet.current || p.signalingState !== 'stable') return;
                  await applyRemoteDescription(p, data.data);
                  const answer = await p.createAnswer();
                  await p.setLocalDescription(answer);
                  await sendSignal('answer', answer);
                  const { data: candidates } = await supabase
                    .from('signals').select('*')
                    .eq('match_id', matchId).eq('type', 'candidate').neq('sender', userId)
                    .order('created_at', { ascending: true });
                  if (candidates) {
                    for (const row of candidates) {
                      try { await peer.addIceCandidate(new RTCIceCandidate(row.data)); }
                      catch (e) { console.warn(e); }
                    }
                  }
                } catch (err: any) { setTimeout(pollForOffer, POLL_INTERVAL); }
              };
              pollForOffer();
              return;
            }

            offerSent.current = true;
            (async () => {
              const p = peerRef.current;
              if (!p || p.signalingState !== 'stable') return;
              const offer = await p.createOffer();
              await p.setLocalDescription(offer);
              await sendSignal('offer', offer);
            })();
          });

        sigChannelRef.current = sigChannel;

        const chatChannel = supabase
          .channel(`chat-${matchId}-${userId}-${Date.now()}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
            payload => {
              if (isMounted.current) {
                setMessages(prev => [...prev, payload.new as any]);
                setNewMsg(true);
              }
            })
          .subscribe();
        chatChannelRef.current = chatChannel;

      } catch (err: any) {
        log(`خطأ حرج في تفعيل العتاد: ${err.message}`);
        if (err.name === 'NotAllowedError')  setError('camera_denied');
        else if (err.name === 'NotFoundError') setError('camera_not_found');
        else setError('connection_failed');
      }
    };

    start();
    return () => { isMounted.current = false; cleanupConnections(); };
  }, [matchId, userId, remoteUserId, connected, playSFX, log, applyRemoteDescription, sendSignal, cleanupConnections, onEnd]);

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(m => !m); }
  };

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOff(c => !c); }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await supabase.from('messages').insert({ match_id: matchId, sender_id: userId, message: text });
  };

  const openChat = () => {
    setShowChat(true);
    setNewMsg(false);
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
  };

  const closeChat = () => {
    setShowChat(false);
    resetControlsTimer();
  };

  // ── Error Screen Premium UI ──
  if (error) {
    const errorMessages: Record<NonNullable<ErrorType>, { icon: React.ReactNode; title: string; desc: string; showRetry: boolean; showEnd: boolean }> = {
      camera_denied: {
        icon: <VideoOffIcon />,
        title: 'تم رفض صلاحية الكاميرا والميكروفون',
        desc: 'يرجى تفعيل صلاحيات الوصول من شريط العناوين بالأعلى لتتمكن من بدء المحادثة والماتش الحقيقي.',
        showRetry: false,
        showEnd: true,
      },
      camera_not_found: {
        icon: <VideoIcon />,
        title: 'جهاز الكاميرا غير متاح',
        desc: 'لم نتمكن من العثور على كاميرا نشطة متصلة بجهازك حالياً، تأكد من سلامة التوصيل.',
        showRetry: true,
        showEnd: true,
      },
      connection_timeout: {
        icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: 'انتهت مهلة البحث عن شريك',
        desc: 'يبدو أن الطرف الآخر واجه مشكلة في الاستجابة السريعة، يرجى إعادة المحاولة من جديد.',
        showRetry: true,
        showEnd: true,
      },
      connection_failed: {
        icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" x2="12.01" y1="20" y2="20" strokeWidth="3" strokeLinecap="round"/></svg>,
        title: 'خطأ في شبكة الاتصال الآمنة',
        desc: 'فشل بروتوكول الـ WebRTC في إنشاء اتصال آمن ومباشر بسبب جدار الحماية لديك.',
        showRetry: true,
        showEnd: true,
      },
    };

    const e = errorMessages[error];
    return (
      <div className="vc-premium-error-pane">
        <style>{STYLES}</style>
        <div className="vc-error-icon-box">{e.icon}</div>
        <h2>{e.title}</h2>
        <p>{e.desc}</p>
        <div style={{ display: 'flex', gap: 14 }}>
          {e.showRetry && <button type="button" className="vc-err-btn primary" onClick={() => { setError(null); globalThis.location.reload(); }}>إعادة الاتصال</button>}
          {e.showEnd && <button type="button" className="vc-err-btn secondary" onClick={onEnd}>مغادرة الغرفة</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="vc-app-container" onClick={resetControlsTimer}>
      <style>{STYLES}</style>

      {/* الـ Video البعيد الأساسي خلفية الشاشة بالكامل */}
      <video ref={remoteVideoRef} autoPlay playsInline className="vc-remote-stream-canvas" />

      {/* حالة جاري البحث العائمة الفخمة */}
      {!connected && (
        <div className="vc-connecting-overlay">
          <div className="vc-radar-pulse" />
          <div className="vc-radar-pulse pulse-2" />
          <div className="vc-radar-pulse pulse-3" />
          <span className="vc-connecting-headline">جاري البحث عن شريك بث...</span>
        </div>
      )}

      <div className="vc-shading-top" />
      <div className="vc-shading-bottom" />

      {/* شاشة الـ PIP كاميرتك الشخصية */}
      <div className="vc-pip-container">
        <video
          ref={localVideoRef}
          autoPlay playsInline muted
          className="vc-pip-core-video"
          style={{ opacity: camOff ? 0 : 1, transform: mirrored ? 'scaleX(-1)' : 'scaleX(1)' }}
        />
        {camOff && (
          <div className="vc-pip-camera-blind">
            <VideoOffIcon />
          </div>
        )}
      </div>

      {/* التوب بار الذكي */}
      <div className={`vc-topbar-layer ${showControls ? 'visible' : ''}`}>
        <div className="vc-status-badge">
          <span className={`vc-live-indicator-dot ${connected ? 'live' : 'searching'}`} />
          <span className="vc-live-timer">{connected ? fmt(duration) : 'إشارة معلقة'}</span>
        </div>
      </div>

      {/* نافذة الشات الانسيابية */}
      {showChat && (
        <div className="vc-chat-super-window">
          <div className="vc-chat-top-header">
            <span className="vc-header-title-flex"><ChatIcon /> نافذة المحادثة</span>
            <button type="button" className="vc-chat-dismiss" onClick={closeChat}>✕</button>
          </div>
          <div className="vc-chat-scroller">
            {messages.length === 0 && <p className="vc-chat-blank-state">لا توجد رسائل بينكما، ابدأ النقاش الآن!</p>}
            {messages.map((msg, i) => (
              <div key={i} className={`vc-chat-bubble-row ${msg.sender_id === userId ? 'outgoing' : 'incoming'}`}>
                <div className="vc-bubble-text">{msg.message}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="vc-chat-footer-composer">
            <input
              className="vc-chat-native-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="اكتب رسالة سريعة للطرف الآخر..."
            />
            <button type="button" className="vc-chat-submit-btn" onClick={sendMessage}><SendIcon /></button>
          </div>
        </div>
      )}

      {/* لوحة التحكم السفلية الاحترافية العائمة */}
      <div className={`vc-controls-floating-bar ${showControls ? 'visible' : ''}`}>
        <button type="button" className={`vc-action-pill ${muted ? 'disabled' : ''}`} onClick={toggleMute}>
          <div className="vc-pill-icon-holder">{muted ? <MicOffIcon /> : <MicIcon />}</div>
          <span className="vc-pill-caption">{muted ? 'تشغيل' : 'كتم'}</span>
        </button>

        <button type="button" className={`vc-action-pill ${camOff ? 'disabled' : ''}`} onClick={toggleCam}>
          <div className="vc-pill-icon-holder">{camOff ? <VideoOffIcon /> : <VideoIcon />}</div>
          <span className="vc-pill-caption">{camOff ? 'كاميرا' : 'إيقاف'}</span>
        </button>

        <button type="button" className="vc-action-pill" onClick={() => setMirrored(m => !m)}>
          <div className="vc-pill-icon-holder"><FlipIcon /></div>
          <span className="vc-pill-caption">عكس</span>
        </button>

        <button type="button" className={`vc-action-pill ${showChat ? 'active' : ''}`} onClick={showChat ? closeChat : openChat} style={{ position: 'relative' }}>
          <div className="vc-pill-icon-holder"><ChatIcon /></div>
          <span className="vc-pill-caption">الشات</span>
          {newMsg && !showChat && <span className="vc-unread-badge-dot" />}
        </button>

        <button type="button" className="vc-action-pill vc-next-pulse-btn" onClick={handleNext}>
          <div className="vc-pill-icon-holder"><NextIcon /></div>
          <span className="vc-pill-caption">التالي</span>
        </button>

        <button type="button" className="vc-action-pill vc-end-emergency-btn" onClick={handleEnd}>
          <div className="vc-pill-icon-holder"><EndIcon /></div>
          <span className="vc-pill-caption">خروج</span>
        </button>
      </div>
    </div>
  );
}

// ── HIGH END MODERN CSS STYLES (GLASSMORPHISM & ACCENTS) ──
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  
  .vc-app-container {
    position: fixed; inset: 0; background: #040408; z-index: 1000;
    overflow: hidden; font-family: 'Cairo', sans-serif; user-select: none;
  }
  
  .vc-remote-stream-canvas {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;
  }

  .vc-shading-top { position: absolute; top: 0; left: 0; right: 0; height: 140px; background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%); pointer-events: none; z-index: 2; }
  .vc-shading-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 220px; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%); pointer-events: none; z-index: 2; }

  .vc-connecting-overlay { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5, 5, 10, 0.75); backdrop-filter: blur(8px); }
  .vc-radar-pulse { position: absolute; width: 110px; height: 110px; border-radius: 50%; border: 1.5px solid rgba(99, 102, 241, 0.4); animation: vc-radar-wave 2.2s cubic-bezier(0.1, 0.8, 0.3, 1) infinite; }
  .pulse-2 { animation-delay: 0.6s; }
  .pulse-3 { animation-delay: 1.2s; }
  @keyframes vc-radar-wave { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(3.2); opacity: 0; } }
  .vc-connecting-headline { font-size: 1.1rem; font-weight: 600; color: #e2e8f0; z-index: 6; text-shadow: 0 2px 10px rgba(0,0,0,0.5); letter-spacing: 0.3px; margin-top: 140px; }

  .vc-pip-container {
    position: absolute; bottom: 124px; right: 20px; width: 115px; aspect-ratio: 3/4;
    border-radius: 20px; overflow: hidden; border: 2px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65); z-index: 10; background: #0f0f15;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .vc-pip-core-video { width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s; }
  .vc-pip-camera-blind { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #13131f; color: #64748b; }

  .vc-topbar-layer { position: absolute; top: 0; left: 0; right: 0; z-index: 10; padding: 20px; display: flex; align-items: center; justify-content: flex-start; opacity: 0; transform: translateY(-10px); transition: all 0.4s ease; }
  .vc-topbar-layer.visible { opacity: 1; transform: translateY(0); }
  .vc-status-badge { display: flex; align-items: center; gap: 10px; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 6px 16px; border-radius: 99px; }
  .vc-live-indicator-dot { width: 9px; height: 9px; border-radius: 50%; }
  .vc-live-indicator-dot.live { background: #10b981; box-shadow: 0 0 10px #10b981; animation: vc-pulse-glow 2s infinite; }
  .vc-live-indicator-dot.searching { background: #f59e0b; animation: vc-pulse-glow 1s infinite; }
  @keyframes vc-pulse-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .vc-live-timer { font-size: 0.9rem; font-weight: 700; color: #ffffff; direction: ltr; }

  .vc-controls-floating-bar {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
    z-index: 12; padding: 10px 16px; display: flex; justify-content: center; align-items: center; gap: 12px;
    background: rgba(15, 15, 25, 0.65); border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(24px); border-radius: 26px; opacity: 0;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    box-shadow: 0 20px 50px rgba(0,0,0,0.4);
  }
  .vc-controls-floating-bar.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
  
  .vc-action-pill {
    display: flex; flex-direction: column; align-items: center; gap: 6px; background: transparent; border: none;
    color: #cbd5e1; cursor: pointer; min-width: 60px; padding: 6px 4px; transition: all 0.2s ease;
  }
  .vc-pill-icon-holder {
    width: 46px; height: 46px; border-radius: 16px; background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease; color: #fff;
  }
  .vc-action-pill:hover .vc-pill-icon-holder { background: rgba(255, 255, 255, 0.15); transform: translateY(-2px); }
  .vc-action-pill:active { transform: scale(0.92); }
  
  .vc-action-pill.disabled .vc-pill-icon-holder { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #ef4444; }
  .vc-action-pill.active .vc-pill-icon-holder { background: rgba(99, 102, 241, 0.25); border-color: rgba(99, 102, 241, 0.5); color: #818cf8; }
  .vc-pill-caption { font-size: 0.68rem; font-weight: 600; opacity: 0.85; white-space: nowrap; }

  .vc-end-emergency-btn .vc-pill-icon-holder { background: rgba(239, 68, 68, 0.85); border-color: #ef4444; box-shadow: 0 6px 20px rgba(239,68,68,0.35); }
  .vc-end-emergency-btn:hover .vc-pill-icon-holder { background: #ef4444; }

  .vc-next-pulse-btn .vc-pill-icon-holder {
    background: rgba(99, 102, 241, 0.85); border-color: #6366f1;
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
    animation: vc-cta-pulse 2s infinite;
  }
  .vc-next-pulse-btn:hover .vc-pill-icon-holder { background: #6366f1; }
  @keyframes vc-cta-pulse { 0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); } 70% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); } 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); } }

  .vc-unread-badge-dot { position: absolute; top: 2px; right: 12px; width: 9px; height: 9px; border-radius: 50%; background: #f43f5e; box-shadow: 0 0 8px #f43f5e; }

  .vc-chat-super-window {
    position: absolute; bottom: 124px; left: 20px; right: 150px; z-index: 15;
    border-radius: 24px; background: rgba(12, 12, 24, 0.78); border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(30px); display: flex; flex-direction: column; max-height: 280px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6); animation: vc-sheet-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    direction: rtl;
  }
  @keyframes vc-sheet-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .vc-chat-top-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .vc-header-title-flex { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 700; color: #f1f5f9; }
  .vc-chat-dismiss { background: none; border: none; color: #64748b; cursor: pointer; font-size: 0.95rem; }
  
  .vc-chat-scroller { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; scrollbar-width: none; }
  .vc-chat-scroller::-webkit-scrollbar { display: none; }
  .vc-chat-blank-state { text-align: center; color: #475569; font-size: 0.8rem; margin: auto; padding: 0 20px; }
  
  .vc-chat-bubble-row { display: flex; width: 100%; animation: vc-bubble-fade 0.2s ease forwards; }
  @keyframes vc-bubble-fade { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .vc-bubble-text { max-width: 85%; font-size: 0.85rem; padding: 8px 14px; border-radius: 16px; line-height: 1.45; word-break: break-word; }
  
  .vc-chat-bubble-row.outgoing { justify-content: flex-start; }
  .vc-chat-bubble-row.outgoing .vc-bubble-text { background: #6366f1; color: #fff; border-bottom-right-radius: 4px; }
  .vc-chat-bubble-row.incoming { justify-content: flex-end; }
  .vc-chat-bubble-row.incoming .vc-bubble-text { background: rgba(255, 255, 255, 0.1); color: #f8fafc; border-bottom-left-radius: 4px; }
  
  .vc-chat-footer-composer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
  .vc-chat-native-input { flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 10px 16px; color: #fff; font-size: 0.85rem; font-family: 'Cairo', sans-serif; outline: none; }
  .vc-chat-native-input::placeholder { color: #475569; }
  .vc-chat-submit-btn { width: 40px; height: 40px; border-radius: 14px; background: #6366f1; border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .vc-chat-submit-btn:hover { background: #4f46e5; transform: scale(1.05); }

  .vc-premium-error-pane {
    position: fixed; inset: 0; background: #06060c; display: flex; flex-direction: column;
    align-items: center; justify-content: center; font-family: 'Cairo', sans-serif; direction: rtl; z-index: 1000; padding: 24px;
  }
  .vc-error-icon-box { color: #ef4444; margin-bottom: 20px; filter: drop-shadow(0 4px 12px rgba(239,68,68,0.2)); }
  .vc-premium-error-pane h2 { color: #f8fafc; font-size: 1.4rem; font-weight: 700; margin: 0 0 10px; }
  .vc-premium-error-pane p { color: #64748b; font-size: 0.95rem; text-align: center; max-width: 320px; line-height: 1.6; margin: 0 0 36px; }
  .vc-err-btn { padding: 12px 32px; border: none; border-radius: 14px; font-size: 0.95rem; font-family: 'Cairo', sans-serif; cursor: pointer; font-weight: 700; transition: all 0.2s; }
  .vc-err-btn.primary { background: #6366f1; color: #fff; box-shadow: 0 4px 15px rgba(99,102,241,0.3); }
  .vc-err-btn.primary:hover { background: #4f46e5; }
  .vc-err-btn.secondary { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; }
  .vc-err-btn.secondary:hover { background: rgba(255,255,255,0.1); }
`;