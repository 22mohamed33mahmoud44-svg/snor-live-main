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
    urls: ['turn:global.relay.metered.ca:80','turn:global.relay.metered.ca:443','turns:global.relay.metered.ca:443'],
    username: '33c573ac1dd5ec4a29556327',
    credential: 'UuRkAsEjWoPrAG8Y',
  },
];

type ErrorType = 'camera_denied' | 'camera_not_found' | 'connection_timeout' | 'connection_failed' | null;

const GIFTS = ['🎁','🌹','💎','👑','🔥','💫'];

export default function VideoCall({ userId, matchId, remoteUserId, onEnd, onNext }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef        = useRef<RTCPeerConnection | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const sigChannelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMounted      = useRef(true);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet  = useRef(false);
  const offerSent      = useRef(false);
  const isOfferer      = useRef(false);

  const [muted,        setMuted]        = useState(false);
  const [camOff,       setCamOff]       = useState(false);
  const [duration,     setDuration]     = useState(0);
  const [messages,     setMessages]     = useState<{ id: string; sender_id: string; message: string }[]>([]);
  const [input,        setInput]        = useState('');
  const [showChat,     setShowChat]     = useState(false);
  const [connected,    setConnected]    = useState(false);
  const [newMsg,       setNewMsg]       = useState(false);
  const [error,        setError]        = useState<ErrorType>(null);
  const [remoteProfile, setRemoteProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => console.log('🎥', msg), []);

  useEffect(() => {
    if (!remoteUserId) return;
    supabase.from('profiles').select('username, avatar_url').eq('id', remoteUserId).single()
      .then(({ data }) => { if (data) setRemoteProfile(data); });
  }, [remoteUserId]);

  const sendSignal = useCallback(async (type: string, data: unknown) => {
    await supabase.from('signals').insert({ match_id: matchId, type, data, sender: userId });
  }, [matchId, userId]);

  const flushIceCandidates = useCallback(async () => {
    const peer = peerRef.current;
    const queue = iceCandidateQueue.current.splice(0);
    if (!peer || queue.length === 0) return;
    for (const c of queue) { try { await peer.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
  }, []);

  const applyRemoteDescription = useCallback(async (peer: RTCPeerConnection, sdp: RTCSessionDescriptionInit) => {
    if (remoteDescSet.current) return;
    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet.current = true;
    await flushIceCandidates();
  }, [flushIceCandidates]);

  const endMatch = useCallback(async () => {
    await supabase.from('matches').update({ status: 'ended' }).eq('id', matchId);
    await supabase.from('signals').insert({ match_id: matchId, type: 'end', data: {}, sender: userId });
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, [matchId, userId]);

  const handleEnd  = useCallback(async () => { await endMatch(); onEnd();  }, [endMatch, onEnd]);
  const handleNext = useCallback(async () => { await endMatch(); onNext(); }, [endMatch, onNext]);

  useEffect(() => { const t = setInterval(() => setDuration(d => d + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    isMounted.current = true;
    remoteDescSet.current = false;
    offerSent.current = false;
    isOfferer.current = false;
    iceCandidateQueue.current = [];

    const cleanup = () => {
      if (connectionTimer.current) clearTimeout(connectionTimer.current);
      peerRef.current?.close(); peerRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
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

        connectionTimer.current = setTimeout(() => { if (isMounted.current) setError('connection_timeout'); }, 30000);

        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerRef.current = peer;

        peer.onconnectionstatechange = () => {
          if (!isMounted.current) return;
          if (peer.connectionState === 'connected') { setConnected(true); setError(null); if (connectionTimer.current) clearTimeout(connectionTimer.current); }
          if (peer.connectionState === 'failed') { setError('connection_failed'); peer.restartIce(); }
          if (peer.connectionState === 'disconnected') setConnected(false);
        };

        stream.getTracks().forEach(t => peer.addTrack(t, stream));
        peer.ontrack = e => { if (remoteVideoRef.current && e.streams[0]) remoteVideoRef.current.srcObject = e.streams[0]; };
        peer.onicecandidate = e => { if (e.candidate && isMounted.current) sendSignal('candidate', e.candidate.toJSON()); };

        const sigChannel = supabase.channel(`vc-${matchId}-${Date.now()}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals', filter: `match_id=eq.${matchId}` },
            async payload => {
              if (!isMounted.current) return;
              const msg = payload.new as { sender: string; type: string; data: any };
              if (msg.sender === userId) return;
              const p = peerRef.current;
              if (!p || p.signalingState === 'closed') return;
              try {
                if (msg.type === 'offer' && !isOfferer.current && p.signalingState === 'stable') { await applyRemoteDescription(p, msg.data); const ans = await p.createAnswer(); await p.setLocalDescription(ans); await sendSignal('answer', ans); }
                else if (msg.type === 'answer' && isOfferer.current && p.signalingState === 'have-local-offer') { await applyRemoteDescription(p, msg.data); }
                else if (msg.type === 'candidate') { if (remoteDescSet.current) await p.addIceCandidate(new RTCIceCandidate(msg.data)); else iceCandidateQueue.current.push(msg.data); }
                else if (msg.type === 'end') { if (isMounted.current) onEnd(); }
              } catch (err: any) { log(`signal error: ${err.message}`); }
            })
          .subscribe(async status => {
            if (status !== 'SUBSCRIBED' || !isMounted.current || offerSent.current) return;
            const shouldOffer = !!remoteUserId && userId < remoteUserId;
            isOfferer.current = shouldOffer;
            if (!shouldOffer) {
              const pollStart = Date.now();
              const poll = async () => {
                if (!isMounted.current || remoteDescSet.current || Date.now() - pollStart > 30000) return;
                const p = peerRef.current;
                if (!p || p.signalingState === 'closed') return;
                try {
                  const { data } = await supabase.from('signals').select('*').eq('match_id', matchId).eq('type', 'offer').neq('sender', userId).order('created_at', { ascending: false }).limit(1).single();
                  if (!data) { setTimeout(poll, 1500); return; }
                  if (remoteDescSet.current || p.signalingState !== 'stable') return;
                  await applyRemoteDescription(p, data.data);
                  const ans = await p.createAnswer(); await p.setLocalDescription(ans); await sendSignal('answer', ans);
                  const { data: cands } = await supabase.from('signals').select('*').eq('match_id', matchId).eq('type', 'candidate').neq('sender', userId).order('created_at', { ascending: true });
                  if (cands) for (const row of cands) { try { await peer.addIceCandidate(new RTCIceCandidate(row.data)); } catch {} }
                } catch { setTimeout(poll, 1500); }
              };
              poll(); return;
            }
            offerSent.current = true;
            const p = peerRef.current;
            if (!p || p.signalingState !== 'stable') return;
            const offer = await p.createOffer(); await p.setLocalDescription(offer); await sendSignal('offer', offer);
          });

        sigChannelRef.current = sigChannel;
        const chatChannel = supabase.channel(`chat-${matchId}-${userId}-${Date.now()}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
            payload => { if (isMounted.current) { setMessages(prev => [...prev, payload.new as any]); setNewMsg(true); } })
          .subscribe();
        chatChannelRef.current = chatChannel;

      } catch (err: any) {
        if (err.name === 'NotAllowedError') setError('camera_denied');
        else if (err.name === 'NotFoundError') setError('camera_not_found');
        else setError('connection_failed');
      }
    };

    start();
    return () => { isMounted.current = false; cleanup(); };
  }, [matchId, userId, remoteUserId]);

  const toggleMute = () => { const t = streamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMuted(m => !m); } };
  const toggleCam  = () => { const t = streamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOff(c => !c); } };

  const sendMessage = async () => {
    const text = input.trim(); if (!text) return;
    setInput('');
    await supabase.from('messages').insert({ match_id: matchId, sender_id: userId, message: text });
  };

  // ── Error Screen ──
  if (error) {
    const errs = {
      camera_denied:      { icon: '🚫', title: 'تم رفض الكاميرا',    desc: 'اسمح بالوصول للكاميرا من المتصفح', retry: false },
      camera_not_found:   { icon: '📷', title: 'كاميرا غير موجودة', desc: 'تأكد إن الكاميرا متوصلة',           retry: true  },
      connection_timeout: { icon: '⏱️', title: 'انتهى وقت الاتصال', desc: 'جرب مرة أخرى',                     retry: true  },
      connection_failed:  { icon: '📡', title: 'فشل الاتصال',        desc: 'حدث خطأ، جرب مرة أخرى',           retry: true  },
    };
    const e = errs[error];
    return (
      <div style={{ position:'fixed',inset:0,background:'#6B21A8',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Cairo,sans-serif',direction:'rtl',zIndex:1000 }}>
        <div style={{ fontSize:72,marginBottom:20 }}>{e.icon}</div>
        <h2 style={{ color:'#fff',fontSize:24,fontWeight:800,margin:'0 0 8px' }}>{e.title}</h2>
        <p style={{ color:'rgba(255,255,255,0.7)',fontSize:15,margin:'0 0 40px',textAlign:'center',maxWidth:260 }}>{e.desc}</p>
        <div style={{ display:'flex',gap:12 }}>
          {e.retry && <button onClick={() => { setError(null); window.location.reload(); }} style={{ padding:'14px 32px',background:'#fff',border:'none',borderRadius:50,color:'#6B21A8',fontSize:16,fontFamily:'Cairo,sans-serif',cursor:'pointer',fontWeight:800 }}>إعادة المحاولة</button>}
          <button onClick={onEnd} style={{ padding:'14px 32px',background:'rgba(255,255,255,0.15)',border:'2px solid rgba(255,255,255,0.3)',borderRadius:50,color:'#fff',fontSize:16,fontFamily:'Cairo,sans-serif',cursor:'pointer',fontWeight:800 }}>الرجوع</button>
        </div>
      </div>
    );
  }

  // ── Connecting Screen ──
  if (!connected) {
    const initials = remoteProfile?.username?.slice(0,2).toUpperCase() ?? '؟';
    return (
      <div style={{ position:'fixed',inset:0,background:'linear-gradient(180deg,#7C3AED 0%,#5B21B6 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Cairo,sans-serif',direction:'rtl',zIndex:1000 }}>
        <style>{`
          @keyframes spin-ring { to { transform: rotate(360deg); } }
          @keyframes pulse-avatar { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        `}</style>

        <p style={{ color:'rgba(255,255,255,0.9)',fontSize:20,fontWeight:700,marginBottom:48 }}>جاري الإتصال.......</p>

        <div style={{ position:'relative',width:160,height:160,marginBottom:32 }}>
          <svg style={{ position:'absolute',inset:0,animation:'spin-ring 2s linear infinite' }} viewBox="0 0 160 160" width="160" height="160">
            <circle cx="80" cy="80" r="76" fill="none" stroke="url(#ringGrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="300 180"/>
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f43f5e"/>
                <stop offset="100%" stopColor="#fb923c"/>
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position:'absolute',inset:8,borderRadius:'50%',overflow:'hidden',animation:'pulse-avatar 2s ease-in-out infinite',background:'#4C1D95',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {remoteProfile?.avatar_url
              ? <img src={remoteProfile.avatar_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
              : <span style={{ color:'#fff',fontSize:36,fontWeight:800 }}>{initials}</span>
            }
          </div>
        </div>

        {remoteProfile && (
          <>
            <p style={{ color:'#fff',fontSize:22,fontWeight:800,margin:'0 0 8px' }}>✨ {remoteProfile.username}</p>
            <div style={{ display:'flex',gap:8,marginBottom:48 }}>
              <span style={{ background:'rgba(255,255,255,0.15)',color:'#fff',padding:'4px 16px',borderRadius:20,fontSize:13,fontWeight:600 }}>مستخدم</span>
            </div>
          </>
        )}

        <button onClick={handleNext} style={{ background:'rgba(255,255,255,0.15)',border:'2px solid rgba(255,255,255,0.4)',borderRadius:50,padding:'14px 60px',color:'#fff',fontSize:18,fontWeight:800,fontFamily:'Cairo,sans-serif',cursor:'pointer',letterSpacing:1 }}>
          التالي
        </button>
      </div>
    );
  }

  // ── Active Call Screen ──
  const initials = remoteProfile?.username?.slice(0,2).toUpperCase() ?? '؟';

  return (
    <div style={{ position:'fixed',inset:0,background:'#0a0a14',zIndex:1000,overflow:'hidden' }}>
      <style>{STYLES}</style>

      {/* Remote video fullscreen */}
      <video ref={remoteVideoRef} autoPlay playsInline
        style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover' }}/>

      {/* Local video - top left small */}
      <div style={{ position:'absolute',top:100,left:8,width:90,height:130,borderRadius:12,overflow:'hidden',border:'2px solid rgba(255,255,255,0.2)',zIndex:10,background:'#111' }}>
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ width:'100%',height:'100%',objectFit:'cover',opacity:camOff?0:1,transform:'scaleX(-1)' }}/>
        {camOff && <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#1a1a2e',fontSize:28 }}>📷</div>}
      </div>

      {/* Top controls - left */}
      <div style={{ position:'absolute',top:24,left:16,display:'flex',gap:10,zIndex:20 }}>
        <button onClick={handleEnd} className="vc-ctrl-btn" style={{ background:'rgba(0,0,0,0.5)' }}>🔒</button>
        <button onClick={toggleMute} className="vc-ctrl-btn" style={{ background: muted ? 'rgba(239,68,68,0.7)' : 'rgba(0,0,0,0.5)' }}>{muted ? '🔇' : '🔊'}</button>
        <button onClick={toggleCam} className="vc-ctrl-btn" style={{ background: camOff ? 'rgba(239,68,68,0.7)' : 'rgba(0,0,0,0.5)' }}>🎤</button>
      </div>

      {/* Timer - top right */}
      <div style={{ position:'absolute',top:24,right:60,zIndex:20,background:'rgba(0,0,0,0.4)',padding:'6px 14px',borderRadius:20,display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ color:'#fff',fontSize:15,fontWeight:700,fontFamily:'Cairo,sans-serif' }}>{fmt(duration)}</span>
      </div>

      {/* Next arrow button - right side */}
      <button onClick={handleNext} style={{ position:'absolute',top:'50%',right:0,transform:'translateY(-50%)',zIndex:20,background:'rgba(0,0,0,0.4)',border:'none',borderRadius:'12px 0 0 12px',padding:'20px 12px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <span style={{ color:'#fff',fontSize:28 }}>›</span>
      </button>

      {/* Gifts sidebar - left */}
      <div style={{ position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',zIndex:20,display:'flex',flexDirection:'column',gap:8 }}>
        {GIFTS.map((g,i) => (
          <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
            <button style={{ width:44,height:44,borderRadius:12,background:'rgba(0,0,0,0.4)',border:'none',cursor:'pointer',fontSize:22,display:'flex',alignItems:'center',justifyContent:'center' }}>{g}</button>
            <span style={{ color:'#fff',fontSize:10,fontFamily:'Cairo,sans-serif' }}>
              <span style={{ color:'#facc15' }}>🪙</span> 30
            </span>
          </div>
        ))}
      </div>

      {/* Bottom - user info + chat */}
      <div style={{ position:'absolute',bottom:0,left:0,right:0,zIndex:20,padding:'0 12px 20px' }}>

        {/* Chat messages */}
        {showChat && (
          <div style={{ marginBottom:8,maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:6 }} className="vc-chat-scroll">
            {messages.length === 0 && <p style={{ color:'rgba(255,255,255,0.4)',fontSize:13,textAlign:'center',fontFamily:'Cairo,sans-serif' }}>لا توجد رسائل بعد</p>}
            {messages.map((msg,i) => (
              <div key={i} style={{ alignSelf: msg.sender_id===userId?'flex-end':'flex-start',background:msg.sender_id===userId?'rgba(124,58,237,0.85)':'rgba(0,0,0,0.55)',color:'#fff',padding:'8px 14px',borderRadius:18,fontSize:14,fontFamily:'Cairo,sans-serif',maxWidth:'75%',wordBreak:'break-word' }}>
                {msg.message}
              </div>
            ))}
            <div ref={messagesEndRef}/>
          </div>
        )}

        {/* User info card */}
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:12 }}>
          <button onClick={handleEnd} style={{ width:44,height:44,borderRadius:50,background:'rgba(0,0,0,0.5)',border:'none',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff' }}>+</button>
          <div style={{ flex:1,background:'rgba(0,0,0,0.45)',borderRadius:24,padding:'8px 16px',display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#7C3AED,#db2777)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:800,overflow:'hidden',flexShrink:0 }}>
              {remoteProfile?.avatar_url
                ? <img src={remoteProfile.avatar_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
                : initials
              }
            </div>
            <div>
              <p style={{ color:'#fff',fontSize:14,fontWeight:800,margin:0,fontFamily:'Cairo,sans-serif' }}>✨ {remoteProfile?.username ?? 'مستخدم'}</p>
              <p style={{ color:'rgba(255,255,255,0.6)',fontSize:12,margin:0,fontFamily:'Cairo,sans-serif' }}>🌍 مصر</p>
            </div>
          </div>
          {remoteProfile?.avatar_url && (
            <div style={{ width:44,height:44,borderRadius:'50%',overflow:'hidden',border:'2px solid rgba(255,255,255,0.3)',flexShrink:0 }}>
              <img src={remoteProfile.avatar_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
            </div>
          )}
        </div>

        {/* Chat input */}
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <button onClick={()=>{setShowChat(s=>!s);setNewMsg(false)}} style={{ width:44,height:44,borderRadius:50,background:'rgba(0,0,0,0.5)',border:'none',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',flexShrink:0 }}>
            💬
            {newMsg && !showChat && <span style={{ position:'absolute',top:2,right:2,width:10,height:10,borderRadius:'50%',background:'#f43f5e' }}/>}
          </button>
          <div style={{ flex:1,background:'rgba(0,0,0,0.45)',borderRadius:24,display:'flex',alignItems:'center',padding:'0 16px',height:44 }}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()}
              placeholder="أرسل رسالة..." style={{ flex:1,background:'none',border:'none',outline:'none',color:'#fff',fontSize:14,fontFamily:'Cairo,sans-serif',direction:'rtl' }}/>
          </div>
          <button onClick={sendMessage} style={{ width:44,height:44,borderRadius:50,background:'rgba(0,0,0,0.5)',border:'none',cursor:'pointer',fontSize:20,flexShrink:0 }}>
            🌐
          </button>
        </div>
      </div>
    </div>
  );
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  .vc-ctrl-btn { width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center; }
  .vc-chat-scroll::-webkit-scrollbar { display:none; }
  .vc-chat-scroll { scrollbar-width:none; }
`;
