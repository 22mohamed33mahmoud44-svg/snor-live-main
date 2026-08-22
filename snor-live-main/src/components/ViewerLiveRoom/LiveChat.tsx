import React, { useRef, useEffect, useState, UIEvent, memo } from 'react';
import { Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  stream_id: string;
  user_id: string;
  username: string;
  message: string;
}

interface LiveChatProps {
  messages: ChatMessage[];
  newMessage: string;
  sending: boolean;
  myUserId: string;
  myAvatarUrl?: string;
  onNewMessageChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent<HTMLFormElement>) => void;
}

// ── 1. المكون المستقل لمنع إعادة التصيير ──
const MessageItem = memo(({ msg, myUserId, myAvatarUrl }: { msg: ChatMessage, myUserId: string, myAvatarUrl?: string }) => {
  const isMe = msg.user_id === myUserId;
  
  return (
    <div style={{ alignSelf: 'flex-start', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '14px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '85%' }}>
      {isMe && myAvatarUrl ? (
        <img src={myAvatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : null}
      <span style={{ color: isMe ? '#ff2a74' : '#00d4ff', fontSize: '0.75rem', fontWeight: 900 }}>
        {msg.username}:
      </span>
      <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>
        {msg.message}
      </span>
    </div>
  );
});

// ── المكون الرئيسي ──
export default function LiveChat({
  messages,
  newMessage,
  sending,
  myUserId,
  myAvatarUrl,
  onNewMessageChange,
  onSendMessage,
}: LiveChatProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  // حالة لمراقبة ما إذا كان المستخدم يقرأ الرسائل القديمة
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);

  // 1. تقييد الرسائل المعروضة بـ 100 رسالة فقط لحماية الذاكرة
  const displayMessages = messages.slice(-100);

  // 2. مراقبة التمرير لتفعيل أو إيقاف التمرير التلقائي
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // إذا ابتعد المستخدم عن الأسفل بأكثر من 50 بيكسل، نوقف التمرير التلقائي
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScrollPaused(!isNearBottom);
  };

  useEffect(() => {
    // التمرير للأسفل فقط إذا لم يكن المستخدم يقرأ الرسائل القديمة
    if (!isAutoScrollPaused) {
      // استخدمنا 'auto' للسرعة، 'smooth' مع الرسائل الكثيفة يسبب تقطيعاً شديداً
      chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [displayMessages, isAutoScrollPaused]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      
      {/* منطقة عرض الرسائل */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        style={{ height: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: '4px' }}
      >
        <div style={{ flex: 1 }} />
        {/* نستخدم المصفوفة المقيدة بدلاً من المصفوفة الكاملة */}
        {displayMessages.map((msg) => (
          <MessageItem 
            key={msg.id} 
            msg={msg} 
            myUserId={myUserId} 
            myAvatarUrl={myAvatarUrl} 
          />
        ))}
        <div ref={chatBottomRef} />
      </div>

      {/* صندوق الإدخال وإرسال الرسالة */}
      <form onSubmit={onSendMessage} style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        <input 
          type="text" 
          value={newMessage} 
          onChange={e => onNewMessageChange(e.target.value)} 
          placeholder="شارك في البث..." 
          style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50px', padding: '12px 40px 12px 46px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} 
        />
        <button 
          type="submit" 
          disabled={sending} 
          style={{ position: 'absolute', left: 6, background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', border: 'none', width: 36, height: 36, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}
        >
          <Send size={15} />
        </button>
      </form>

    </div>
  );
}