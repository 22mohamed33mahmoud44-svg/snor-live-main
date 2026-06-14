import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import type { ChatOther, MsgItem } from '../types';
import { timeAgo } from '../utils/helpers';
import { PhoneIcon, VideoIcon, BackIcon, SendIcon } from './icons/Icons';

// ── Private Chat Component ───────────────────────────────────────
interface PrivateChatProps {
  myId: string;
  other: ChatOther;
  onBack: () => void;
  onStartCall: (id: string, type: 'video' | 'audio') => void;
}

export default function PrivateChat({ myId, other, onBack, onStartCall }: PrivateChatProps) {
  const [messages, setMessages] = useState<MsgItem[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const name = other.full_name || other.username || other.name || 'مستخدم';

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    fetchMessages();

    const channel = supabase
      .channel(`private-chat-${other.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as MsgItem;
        if (
          (newMsg.sender_id === myId && newMsg.receiver_id === other.id) ||
          (newMsg.sender_id === other.id && newMsg.receiver_id === myId)
        ) {
          setMessages(prev => [...prev, newMsg]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myId, other.id]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await supabase.from('messages').insert({
      sender_id: myId,
      receiver_id: other.id,
      message: text,
      read: false
    });
  };

  return (
    <div className="tab-fadein" style={{ position: 'fixed', inset: 0, background: '#03030a', display: 'flex', flexDirection: 'column', direction: 'rtl', color: '#f0f0ff', zIndex: 900 }}>
      
      {/* Header */}
      <div style={{ padding: '14px 16px', background: 'rgba(10,10,22,0.75)', backdropFilter: 'blur(30px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BackIcon />
        </button>

        <div style={{ width: 44, height: 44, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'linear-gradient(135deg, #7c3aed, #00d4ff)', position: 'relative', flexShrink: 0 }}>
          {other.avatar_url
            ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            : name[0].toUpperCase()
          }
          <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#4ade80', border: '2px solid #03030a' }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: '0.72rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
            متصل الآن
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => onStartCall(other.id, 'audio')} style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)', color: '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PhoneIcon />
          </button>
          <button type="button" onClick={() => onStartCall(other.id, 'video')} style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', color: '#00d4ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <VideoIcon size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === myId;
          const showTime = i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id;
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '75%', padding: '11px 16px', borderRadius: 20, fontSize: '0.9rem',
                lineHeight: 1.5, wordBreak: 'break-word',
                background: isMe ? 'linear-gradient(135deg,#7c3aed,#00d4ff)' : 'rgba(255,255,255,.05)',
                border: isMe ? 'none' : '1px solid rgba(255,255,255,.03)',
                borderBottomRightRadius: isMe ? 4 : 20,
                borderBottomLeftRadius: isMe ? 20 : 4
              }}>
                {msg.message}
              </div>
              {showTime && (
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.3)', padding: '4px 6px' }}>
                  {timeAgo(msg.created_at)}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: 10, background: 'rgba(3,3,10,.95)', backdropFilter: 'blur(10px)', paddingBottom: 'max(12px,env(safe-area-inset-bottom))' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="اكتب رسالة آمنة ومفرّرة..."
          style={{ flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: '12px 16px', color: '#f0f0ff', fontSize: '0.9rem', outline: 'none' }}
        />
        <button type="button" onClick={send} style={{ width: 46, height: 46, borderRadius: 16, flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
