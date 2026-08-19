import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { supabase } from '../supabase';
import type { ChatOther, MsgItem } from '../types';
import { initialOf, timeAgo } from '../utils/helpers';
import { PhoneIcon, VideoIcon, BackIcon, SendIcon } from './icons/Icons';

interface PrivateChatProps {
  myId: string;
  other: ChatOther;
  onBack: () => void;
  onStartCall: (id: string, type: 'video' | 'audio') => void;
}

type ChatMsg = MsgItem & { isOptimistic?: boolean; failed?: boolean };

// ── رسالة منفصلة لضمان الأداء وعدم إعادة تحميل كل المحادثة ──
const MessageBubble = memo(({ msg, isMe, showTime }: { msg: ChatMsg, isMe: boolean, showTime: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-start' : 'flex-end', opacity: msg.isOptimistic ? 0.7 : 1, transition: 'opacity 0.2s' }}>
    <div style={{
      maxWidth: '80%', padding: '10px 16px', borderRadius: 20, fontSize: '0.9rem',
      lineHeight: 1.5, wordBreak: 'break-word',
      background: msg.failed ? 'rgba(239,68,68,0.15)' : isMe ? 'linear-gradient(135deg,#7c3aed,#00d4ff)' : 'rgba(255,255,255,.05)',
      border: msg.failed ? '1px solid rgba(239,68,68,0.4)' : isMe ? 'none' : '1px solid rgba(255,255,255,.05)',
      borderBottomRightRadius: isMe ? 4 : 20,
      borderBottomLeftRadius: isMe ? 20 : 4,
      boxShadow: isMe && !msg.failed ? '0 4px 15px rgba(0,212,255,0.2)' : 'none',
    }}>
      {msg.message}
    </div>
    {msg.failed ? (
      <div style={{ fontSize: '0.65rem', color: '#f87171', padding: '4px 6px' }}>فشل الإرسال — اضغط لإعادة المحاولة</div>
    ) : showTime && (
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.4)', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
        {timeAgo(msg.created_at)}
        {isMe && !msg.isOptimistic && <span style={{ color: msg.read ? '#34d399' : '#94a3b8' }}>{msg.read ? '✓✓' : '✓'}</span>}
      </div>
    )}
  </div>
));

export default function PrivateChat({ myId, other, onBack, onStartCall }: PrivateChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // مرجع ثابت لحالة اتصال الطرف الآخر حتى لا يُعاد إنشاء handleSend
  const isOtherOnlineRef = useRef(false);
  isOtherOnlineRef.current = isOtherOnline;

  const name = other.full_name || other.username || other.name || 'مستخدم';

  const scrollToBottom = (force = false) => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // التمرير التلقائي فقط إذا كان المستخدم قريباً من أسفل الشاشة أو تم إجباره (عند إرسال رسالة)
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (force || isNearBottom) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  // إضافة رسالة مع منع التكرار (قد تصل نفس الرسالة من الإدراج المباشر ومن القناة اللحظية)
  const upsertMessage = useCallback((newMsg: MsgItem) => {
    setMessages(prev => {
      if (prev.some(m => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });
    scrollToBottom();
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. جلب الرسائل السابقة وتحديث حالتها إلى "مقروءة"
    const fetchAndReadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: false })
        .limit(100); // 🚀 آخر 100 رسالة فقط لتسريع التحميل

      if (cancelled || !data) return;
      const ordered = [...data].reverse();
      setMessages(ordered);
      scrollToBottom(true);

      // تحديث رسائل الطرف الآخر غير المقروءة لتصبح مقروءة
      const unreadIds = ordered.filter(m => m.receiver_id === myId && !m.read).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ read: true }).in('id', unreadIds);
      }
    };

    fetchAndReadMessages();

    // 2. قناة لحظية واحدة بمرشحات على مستوى السيرفر (Server-side filters)
    //    بدلاً من الاستماع لكل رسائل التطبيق وتصفيتها في المتصفح.
    const channelId = myId < other.id ? `chat-${myId}-${other.id}` : `chat-${other.id}-${myId}`;
    const channel = supabase.channel(channelId, { config: { presence: { key: myId } } });

    channel
      // الرسائل الواردة إليّ فقط (مرشح receiver_id على السيرفر) — ثم نتحقق أنها من هذا الطرف تحديداً
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload) => {
          const newMsg = payload.new as MsgItem;
          if (newMsg.sender_id !== other.id) return; // رسالة من محادثة أخرى
          upsertMessage(newMsg);
          // الشات مفتوح الآن → علّمها كمقروءة فوراً
          supabase.from('messages').update({ read: true }).eq('id', newMsg.id).then(() => {});
        }
      )
      // رسائلي المرسلة من جهاز آخر بنفس الحساب (مرشح sender_id على السيرفر)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${myId}` },
        (payload) => {
          const newMsg = payload.new as MsgItem;
          if (newMsg.receiver_id !== other.id) return;
          upsertMessage(newMsg);
        }
      )
      // إشعارات القراءة (✓✓): تحديثات على رسائلي أنا فقط
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${myId}` },
        (payload) => {
          const updatedMsg = payload.new as MsgItem;
          if (updatedMsg.receiver_id !== other.id) return;
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // إذا كان المفتاح الخاص بالطرف الآخر موجوداً في الـ state، فهو متصل بنفس الغرفة
        setIsOtherOnline(Object.keys(state).includes(other.id));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() });
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [myId, other.id, upsertMessage]);

  const sendText = useCallback(async (text: string, tempId: string) => {
    // ⚡ الإدراج مع select() لاستعادة الصف الحقيقي فوراً واستبدال الرسالة الوهمية به
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: myId,
        receiver_id: other.id,
        message: text,
        read: isOtherOnlineRef.current, // إذا كان متصلاً الآن بنفس الغرفة، تُعتبر مقروءة فوراً
      })
      .select()
      .single();

    if (error || !data) {
      console.error('فشل إرسال الرسالة', error);
      // ❌ لا نترك المستخدم يظن أن الرسالة وصلت: علّمها كفاشلة
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: false, failed: true } : m));
      return;
    }

    // استبدال الرسالة الوهمية بالصف الحقيقي (القناة اللحظية قد تصل أيضاً — upsert يمنع التكرار)
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev.filter(m => m.id !== tempId);
      return prev.map(m => m.id === tempId ? (data as MsgItem) : m);
    });
  }, [myId, other.id]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');

    // ⚡ Optimistic UI: عرض الرسالة فوراً للمستخدم قبل وصولها للسيرفر
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMsg = {
      id: tempId,
      sender_id: myId,
      receiver_id: other.id,
      message: text,
      created_at: new Date().toISOString(),
      read: false,
      isOptimistic: true,
    };

    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom(true);
    await sendText(text, tempId);
  }, [input, myId, other.id, sendText]);

  // إعادة محاولة إرسال رسالة فاشلة عند الضغط عليها
  const handleRetry = useCallback((msg: ChatMsg) => {
    if (!msg.failed) return;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, failed: false, isOptimistic: true } : m));
    sendText(msg.message, msg.id);
  }, [sendText]);

  return (
    <div className="tab-fadein" style={{ position: 'fixed', inset: 0, background: '#03030a', display: 'flex', flexDirection: 'column', direction: 'rtl', color: '#f0f0ff', zIndex: 900 }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 16px', background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(30px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 10 }}>
        <button type="button" onClick={onBack} style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <BackIcon />
        </button>

        <div style={{ width: 44, height: 44, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'linear-gradient(135deg, #7c3aed, #00d4ff)', position: 'relative', flexShrink: 0 }}>
          {other.avatar_url
            ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            : initialOf(name)
          }
          {isOtherOnline && <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#10b981', border: '3px solid #03030a' }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          {isOtherOnline ? (
            <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              متصل الآن في المحادثة
            </div>
          ) : (
             <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              غير متصل
            </div>
          )}
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

      {/* ── Messages Area ── */}
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12, backgroundImage: 'radial-gradient(circle at center, rgba(124,58,237,0.03) 0%, transparent 70%)' }}
      >
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === myId;
          const showTime = i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id;
          return (
            <div key={msg.id} onClick={msg.failed ? () => handleRetry(msg) : undefined} style={msg.failed ? { cursor: 'pointer' } : undefined}>
              <MessageBubble msg={msg} isMe={isMe} showTime={showTime} />
            </div>
          );
        })}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* ── Input Area ── */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: 10, background: 'rgba(5,5,12,.95)', backdropFilter: 'blur(20px)', paddingBottom: 'max(12px,env(safe-area-inset-bottom))' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && handleSend()}
          placeholder="اكتب رسالتك هنا..."
          style={{ flex: 1, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: '12px 18px', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s', fontFamily: "'Cairo', sans-serif" }}
          onFocus={(e) => e.target.style.borderColor = 'rgba(0,212,255,0.4)'}
          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,.08)'}
        />
        <button
           type="button"
           onClick={handleSend}
           disabled={!input.trim()}
           style={{ width: 48, height: 48, borderRadius: 20, flexShrink: 0, background: input.trim() ? 'linear-gradient(135deg,#7c3aed,#00d4ff)' : 'rgba(255,255,255,0.1)', border: 'none', color: input.trim() ? '#fff' : 'rgba(255,255,255,0.3)', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: input.trim() ? '0 4px 15px rgba(0,212,255,0.3)' : 'none' }}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
