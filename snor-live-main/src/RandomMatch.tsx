import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { startMatching, cancelMatching } from './match';

type Props = {
  userId: string;
  onClose: () => void;
  onMatch: (match: any) => void;
};

type Phase = 'idle' | 'waiting' | 'matched';

export default function RandomMatch({ userId, onClose, onMatch }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dots,  setDots]  = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dotsTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchedRef = useRef(false);

  // Animated dots while waiting
  useEffect(() => {
    if (phase === 'waiting') {
      dotsTimer.current = setInterval(
        () => setDots(d => (d.length >= 3 ? '' : d + '.')),
        500,
      );
    } else {
      if (dotsTimer.current) clearInterval(dotsTimer.current);
      setDots('');
    }
    return () => { if (dotsTimer.current) clearInterval(dotsTimer.current); };
  }, [phase]);

  // Cleanup on unmount — شيل نفسك من الانتظار لو الـ component اتشال
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      // لو المستخدم غلق التطبيق وهو مستني
      cancelMatching(userId);
    };
  }, [userId]);

  const handleMatchFound = (match: any) => {
    if (matchedRef.current) return;
    matchedRef.current = true;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setPhase('matched');
    setTimeout(() => onMatch(match), 1200);
  };

  // ── Start matching ───────────────────────────────────────────
  const handleStart = async () => {
    matchedRef.current = false;
    setPhase('waiting');

    try {
      const result = await startMatching(userId);

      if (result.status === 'matched' && result.match) {
        handleMatchFound(result.match);
        return;
      }

      // مستنيين — اشترك في matches الخاصة بالمستخدم فقط
      const onInsert = (payload: { new: Record<string, unknown> }) => {
        const m = payload.new as { id: string; user1: string; user2: string };
        handleMatchFound(m);
      };

      const channel = supabase
        .channel('my-match-' + userId + '-' + Date.now())
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'matches', filter: `user1=eq.${userId}` },
          onInsert,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'matches', filter: `user2=eq.${userId}` },
          onInsert,
        )
        .subscribe();

      channelRef.current = channel;

    } catch (err) {
      console.error('startMatching error:', err);
      setPhase('idle');
    }
  };

  // ── Cancel while waiting ─────────────────────────────────────
  const handleCancel = async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    // ✅ بدل الـ delete المباشر — بنستخدم RPC الآمنة
    await cancelMatching(userId);
    setPhase('idle');
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={s.overlay}>
      <style>{CSS}</style>

      {phase === 'idle' && (
        <button style={s.closeBtn} onClick={onClose}>✕</button>
      )}

      {phase === 'waiting' && (
        <div style={s.ringsWrap}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="rm-ring"
              style={{ width: 180 + i * 90, height: 180 + i * 90, animationDelay: `${i * 0.55}s` }}
            />
          ))}
        </div>
      )}

      <div className={phase === 'matched' ? 'rm-avatar rm-avatar--matched' : 'rm-avatar'}>
        {phase === 'idle'    && '🎲'}
        {phase === 'waiting' && '🔍'}
        {phase === 'matched' && '🎉'}
      </div>

      <h2 style={s.title}>
        {phase === 'idle'    && 'مطابقة عشوائية'}
        {phase === 'waiting' && `جاري البحث${dots}`}
        {phase === 'matched' && 'تم العثور على شخص!'}
      </h2>

      <p style={s.sub}>
        {phase === 'idle'    && 'اضغط ابدأ وهنوصّلك بشخص عشوائي على فيديو كول فوراً'}
        {phase === 'waiting' && 'بندور على شخص ليك… استنى لحظة'}
        {phase === 'matched' && 'بيتم الاتصال الآن…'}
      </p>

      {phase === 'idle' && (
        <button style={s.btnPrimary} onClick={handleStart}>ابدأ مطابقة</button>
      )}
      {phase === 'waiting' && (
        <button style={s.btnGhost} onClick={handleCancel}>إلغاء</button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 900,
    background: 'rgba(6,6,14,0.97)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Cairo', sans-serif", direction: 'rtl',
    backdropFilter: 'blur(6px)',
  },
  closeBtn: {
    position: 'absolute', top: '1.2rem', left: '1.2rem',
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '1rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  ringsWrap: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: {
    color: '#fff', fontSize: '1.55rem', fontWeight: 900,
    margin: '0 0 .5rem', textAlign: 'center', minWidth: 220,
  },
  sub: {
    color: 'rgba(255,255,255,0.45)', fontSize: '.88rem',
    margin: '0 0 2.2rem', textAlign: 'center',
    maxWidth: 280, lineHeight: 1.6,
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #7c6aff, #ff6a9f)',
    border: 'none', borderRadius: 14, padding: '.9rem 3rem',
    color: '#fff', fontSize: '1rem', fontWeight: 800,
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
    boxShadow: '0 8px 28px rgba(124,106,255,0.4)',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 14, padding: '.9rem 3rem',
    color: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 800,
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
  },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
  .rm-ring {
    position: absolute; border-radius: 50%;
    border: 1px solid rgba(124,106,255,0.3);
    animation: rm-pulse 2.2s ease-out infinite;
  }
  @keyframes rm-pulse {
    0%   { transform: scale(0.85); opacity: .7; }
    100% { transform: scale(1.25); opacity: 0;  }
  }
  .rm-avatar {
    width: 110px; height: 110px; border-radius: 50%;
    background: linear-gradient(135deg, #7c6aff 0%, #ff6a9f 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.8rem; margin-bottom: 1.6rem;
    box-shadow: 0 0 40px rgba(124,106,255,0.35);
  }
  .rm-avatar--matched {
    animation: rm-pop .5s cubic-bezier(.34,1.56,.64,1);
    box-shadow: 0 0 60px rgba(74,222,128,0.4);
  }
  @keyframes rm-pop {
    0%   { transform: scale(0.6); }
    80%  { transform: scale(1.15); }
    100% { transform: scale(1); }
  }
`;
