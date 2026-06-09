import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';

type Props = {
  userId: string;
  matchId: string;
  remoteUserId: string;
  onEnd: () => void;
  onNext: () => void;
};

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

export default function VideoCall({ userId, matchId, remoteUserId, onEnd, onNext }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef        = useRef<RTCPeerConnection | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const sigChannelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMounted      = useRef(true);

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
  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    console.log('🎥 VideoCall:', msg);
  }, []);

  const sendSignal = useCallback(
    async (type: string, data: unknown) => {
      const { error } = await supabase.from('signals').insert({
        match_id: matchId, type, data, sender: userId,
      });
      if (error) log(`send ${type} failed: ${error.message}`);
    },
    [matchId, userId, log],
  );

  const flushIceCandidates = useCallback(async () => {
    const peer  = peerRef.current;
    const queue = iceCandidateQueue.current.splice(0);
    if (!peer || queue.length === 0) return;
    for (const c of queue) {
      try { await peer.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('ICE flush error:', e); }
    }
  }, []);

  const applyRemoteDescription = useCallback(
    async (peer: RTCPeerConnection, sdp: RTCSessionDescriptionInit) => {
      if (remoteDescSet.current) return;
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      remoteDescSet.current = true;
      await flushIceCandidates();
    },
    [flushIceCandidates],
  );

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!showChat) setShowControls(false);
    }, 4000);
  }, [showChat]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    isMounted.current         = true;
    remoteDescSet.current     = false;
    offerSent.current         = false;
    isOfferer.current         = false;
    iceCandidateQueue.current = [];

    const cleanup = () => {
      peerRef.current?.close();
      peerRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (sigChannelRef.current)  { supabase.removeChannel(sigChannelRef.current);  sigChannelRef.current  = null; }
      if (chatChannelRef.current) { supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null; }
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!isMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerRef.current = peer;

        peer.onconnectionstatechange = () => {
          if (!isMounted.current) return;
          setConnected(peer.connectionState === 'connected');
          if (peer.connectionState === 'failed') peer.restartIce();
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
                  if (isOfferer.current) return;
                  if (p.signalingState !== 'stable') return;
                  await applyRemoteDescription(p, msg.data);
                  const answer = await p.createAnswer();
                  await p.setLocalDescription(answer);
                  await sendSignal('answer', answer);
                  return;
                }
                if (msg.type === 'answer') {
                  if (!isOfferer.current) return;
                  if (p.signalingState !== 'have-local-offer') return;
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
              } catch (err: any) { log(`signal error: ${err.message}`); }
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
                      try { await p.addIceCandidate(new RTCIceCandidate(row.data)); }
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

      } catch (err: any) { log(`fatal: ${err.message}`); }
    };

    start();
    return () => { isMounted.current = false; cleanup(); };
  }, [matchId, userId, remoteUserId]);

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(m => !m); }
  };

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOff(c => !c); }
  };

  const handleEnd = useCallback(() => {
    supabase.from('signals').insert({
      match_id: matchId, type: 'end', data: {}, sender: userId,
    }).then(() => {
      peerRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      onEnd();
    });
  }, [onEnd, matchId, userId]);

  const handleNext = useCallback(() => {
    handleEnd();
    setTimeout(() => onNext(), 300);
  }, [handleEnd, onNext]);

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

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000 }}
      onClick={resetControlsTimer}
    >
      <style>{STYLES}</style>

      {/* ── Remote video ── */}
      <video
        ref={remoteVideoRef}
        autoPlay playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* ── Connecting overlay ── */}
      {!connected && (
        <div className="vc-connecting">
          <div className="vc-connecting-ring" />
          <div className="vc-connecting-ring" style={{ animationDelay: '0.4s' }} />
          <div className="vc-connecting-ring" style={{ animationDelay: '0.8s' }} />
          <span className="vc-connecting-text">جاري الاتصال…</span>
        </div>
      )}

      {/* ── Gradient overlays ── */}
      <div className="vc-grad-top" />
      <div className="vc-grad-bottom" />

      {/* ── Local video PiP ── */}
      <div className="vc-pip-wrap">
        <video
          ref={localVideoRef}
          autoPlay playsInline muted
          className="vc-pip-video"
          style={{ opacity: camOff ? 0 : 1, transform: mirrored ? 'scaleX(-1)' : 'scaleX(1)', transition: 'transform 0.3s ease' }}
        />
        {camOff && (
          <div className="vc-pip-off">
            <span style={{ fontSize: '1.6rem' }}>📷</span>
          </div>
        )}
      </div>

      {/* ── Top bar ── */}
      <div className={`vc-topbar ${showControls ? 'vc-topbar--visible' : ''}`}>
        <div className="vc-status">
          <span className={`vc-dot ${connected ? 'vc-dot--on' : 'vc-dot--wait'}`} />
          <span className="vc-timer">{fmt(duration)}</span>
        </div>
      </div>

      {/* ── Chat panel ── */}
      {showChat && (
        <div className="vc-chat">
          <div className="vc-chat-header">
            <span className="vc-chat-title">💬 الشات</span>
            <button className="vc-chat-close" onClick={closeChat}>✕</button>
          </div>
          <div className="vc-chat-messages">
            {messages.length === 0 && (
              <p className="vc-chat-empty">لا توجد رسائل بعد</p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`vc-msg ${msg.sender_id === userId ? 'vc-msg--me' : 'vc-msg--them'}`}
              >
                {msg.message}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="vc-chat-input-row">
            <input
              className="vc-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="اكتب رسالة…"
            />
            <button className="vc-chat-send" onClick={sendMessage}>↑</button>
          </div>
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div className={`vc-controls ${showControls ? 'vc-controls--visible' : ''}`}>
        <button
          className={`vc-btn ${muted ? 'vc-btn--off' : ''}`}
          onClick={toggleMute}
          title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        >
          <span className="vc-btn-icon">{muted ? '🔇' : '🎙️'}</span>
          <span className="vc-btn-label">{muted ? 'صوت' : 'كتم'}</span>
        </button>

        <button
          className={`vc-btn ${camOff ? 'vc-btn--off' : ''}`}
          onClick={toggleCam}
          title={camOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
        >
          <span className="vc-btn-icon">{camOff ? '📷' : '📹'}</span>
          <span className="vc-btn-label">{camOff ? 'كاميرا' : 'إيقاف'}</span>
        </button>

        <button
          className="vc-btn"
          onClick={() => setMirrored(m => !m)}
          title="عكس الصورة"
        >
          <span className="vc-btn-icon">🔄</span>
          <span className="vc-btn-label">{mirrored ? 'طبيعي' : 'معكوس'}</span>
        </button>

        <button
          className={`vc-btn ${showChat ? 'vc-btn--active' : ''}`}
          onClick={showChat ? closeChat : openChat}
          title="الشات"
          style={{ position: 'relative' }}
        >
          <span className="vc-btn-icon">💬</span>
          <span className="vc-btn-label">شات</span>
          {newMsg && !showChat && <span className="vc-badge" />}
        </button>

        <button className="vc-btn" onClick={handleNext} title="التالي">
          <span className="vc-btn-icon">⏭️</span>
          <span className="vc-btn-label">التالي</span>
        </button>

        <button className="vc-btn vc-btn--end" onClick={handleEnd} title="إنهاء المكالمة">
          <span className="vc-btn-icon">📵</span>
          <span className="vc-btn-label">إنهاء</span>
        </button>
      </div>
    </div>
  );
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');

  .vc-grad-top {
    position: absolute; top: 0; left: 0; right: 0; height: 120px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%);
    pointer-events: none; z-index: 2;
  }
  .vc-grad-bottom {
    position: absolute; bottom: 0; left: 0; right: 0; height: 180px;
    background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
    pointer-events: none; z-index: 2;
  }

  .vc-connecting {
    position: absolute; inset: 0; z-index: 5;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0;
    background: rgba(0,0,0,0.6);
  }
  .vc-connecting-ring {
    position: absolute;
    width: 80px; height: 80px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    animation: vc-ping 1.8s ease-out infinite;
  }
  @keyframes vc-ping {
    0%   { transform: scale(1);   opacity: 0.7; }
    100% { transform: scale(3.5); opacity: 0;   }
  }
  .vc-connecting-text {
    font-family: 'Cairo', sans-serif;
    font-size: 1rem; color: rgba(255,255,255,0.7);
    letter-spacing: 0.05em; z-index: 1; margin-top: 60px;
  }

  .vc-pip-wrap {
    position: absolute; bottom: 100px; right: 16px;
    width: 100px; aspect-ratio: 3/4;
    border-radius: 16px; overflow: hidden;
    border: 1.5px solid rgba(255,255,255,0.18);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    z-index: 10; background: #111;
  }
  .vc-pip-video {
    width: 100%; height: 100%; object-fit: cover;
    transition: opacity 0.3s;
  }
  .vc-pip-off {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: #1a1a2e;
  }

  .vc-topbar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 10;
    padding: 16px 20px;
    display: flex; align-items: center; justify-content: space-between;
    opacity: 0; transition: opacity 0.35s ease;
  }
  .vc-topbar--visible { opacity: 1; }
  .vc-status { display: flex; align-items: center; gap: 8px; }
  .vc-dot { width: 8px; height: 8px; border-radius: 50%; }
  .vc-dot--on {
    background: #4ade80; box-shadow: 0 0 8px #4ade80;
    animation: vc-blink 2s ease-in-out infinite;
  }
  .vc-dot--wait {
    background: #fbbf24;
    animation: vc-blink 1s ease-in-out infinite;
  }
  @keyframes vc-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .vc-timer {
    font-family: 'Cairo', sans-serif;
    font-size: 0.9rem; font-weight: 700;
    color: #fff; letter-spacing: 0.08em;
  }

  .vc-controls {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
    padding: 16px 20px 32px;
    display: flex; justify-content: center; align-items: center; gap: 10px;
    opacity: 0; transition: opacity 0.35s ease;
  }
  .vc-controls--visible { opacity: 1; }

  .vc-btn {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    backdrop-filter: blur(12px);
    border-radius: 18px; padding: 10px 16px;
    color: #fff; cursor: pointer; min-width: 62px;
    transition: all 0.2s ease;
    font-family: 'Cairo', sans-serif;
  }
  .vc-btn:active { transform: scale(0.93); }
  .vc-btn--off { background: rgba(255,255,255,0.05); opacity: 0.5; }
  .vc-btn--active {
    background: rgba(124,106,255,0.35);
    border-color: rgba(124,106,255,0.6);
  }
  .vc-btn--end {
    background: rgba(220,38,38,0.85); border-color: #dc2626;
    box-shadow: 0 4px 20px rgba(220,38,38,0.4);
  }
  .vc-btn--end:hover { background: rgba(220,38,38,1); }
  .vc-btn-icon { font-size: 1.35rem; line-height: 1; }
  .vc-btn-label { font-size: 0.62rem; font-weight: 600; opacity: 0.85; white-space: nowrap; }

  .vc-badge {
    position: absolute; top: 6px; right: 10px;
    width: 8px; height: 8px; border-radius: 50%;
    background: #f43f5e; box-shadow: 0 0 6px #f43f5e;
    animation: vc-blink 1s infinite;
  }

  .vc-chat {
    position: absolute; bottom: 100px; left: 12px; right: 130px;
    z-index: 15; border-radius: 20px;
    background: rgba(10,10,20,0.88);
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(20px);
    display: flex; flex-direction: column;
    max-height: 220px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    animation: vc-slide-up 0.25s ease;
  }
  @keyframes vc-slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .vc-chat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .vc-chat-title {
    font-family: 'Cairo', sans-serif;
    font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.7);
  }
  .vc-chat-close {
    background: none; border: none; color: rgba(255,255,255,0.4);
    cursor: pointer; font-size: 0.8rem; padding: 0; line-height: 1;
  }
  .vc-chat-messages {
    flex: 1; overflow-y: auto; padding: 8px 12px;
    display: flex; flex-direction: column; gap: 6px;
    scrollbar-width: none;
  }
  .vc-chat-messages::-webkit-scrollbar { display: none; }
  .vc-chat-empty {
    text-align: center; color: rgba(255,255,255,0.25);
    font-family: 'Cairo', sans-serif; font-size: 0.75rem; margin: auto;
  }
  .vc-msg {
    max-width: 80%; font-family: 'Cairo', sans-serif;
    font-size: 0.8rem; padding: 6px 12px; border-radius: 14px;
    line-height: 1.4; word-break: break-word;
  }
  .vc-msg--me {
    background: rgba(124,106,255,0.75); color: #fff;
    align-self: flex-end; border-bottom-right-radius: 4px;
  }
  .vc-msg--them {
    background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);
    align-self: flex-start; border-bottom-left-radius: 4px;
  }
  .vc-chat-input-row {
    display: flex; gap: 6px; padding: 8px 10px;
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .vc-chat-input {
    flex: 1; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px; padding: 7px 12px;
    color: #fff; font-size: 0.8rem;
    font-family: 'Cairo', sans-serif; outline: none; direction: rtl;
  }
  .vc-chat-input::placeholder { color: rgba(255,255,255,0.3); }
  .vc-chat-send {
    width: 34px; height: 34px; border-radius: 10px;
    background: rgba(124,106,255,0.8); border: none;
    color: #fff; font-size: 1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
  }
  .vc-chat-send:hover { background: rgba(124,106,255,1); }
`;