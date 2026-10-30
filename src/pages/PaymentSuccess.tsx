import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

type PaymentState = 'checking' | 'confirmed' | 'pending' | 'login' | 'invalid' | 'error';

const validSessionId = (value: string | null): value is string =>
  typeof value === 'string' && /^cs_[A-Za-z0-9_]{8,256}$/.test(value);

export default function PaymentSuccess() {
  const [state, setState] = useState<PaymentState>('checking');
  const sessionId = new URLSearchParams(window.location.search).get('session_id');

  useEffect(() => {
    if (!validSessionId(sessionId)) {
      setState('invalid');
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const started = Date.now();
    let interval: ReturnType<typeof setInterval> | undefined;

    const verifyCredit = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError || !user) {
          setState('login');
          if (interval) clearInterval(interval);
          return;
        }

        // Only a real wallet-ledger entry, visible to its owner under RLS,
        // confirms that this exact Stripe checkout session was credited.
        const { data, error } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', user.id)
          .contains('meta', { stripe_session_id: sessionId })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error('Could not verify payment ledger', error);
          setState('error');
        } else if (data) {
          setState('confirmed');
          if (interval) clearInterval(interval);
        } else if (Date.now() - started >= 90_000) {
          setState('pending');
          if (interval) clearInterval(interval);
        } else {
          setState('checking');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Payment verification unavailable', error);
          setState('error');
        }
      } finally {
        inFlight = false;
      }
    };

    interval = setInterval(() => { void verifyCredit(); }, 3500);
    void verifyCredit();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [sessionId]);

  const messages: Record<PaymentState, { icon: string; title: string; description: string }> = {
    checking: {
      icon: '⏳',
      title: 'جاري التحقق من شحن العملات',
      description: 'عدت من صفحة Stripe. ننتظر تسجيل عملية الشحن في محفظتك قبل تأكيد نجاحها.',
    },
    confirmed: {
      icon: '✅',
      title: 'تم شحن العملات بنجاح',
      description: 'تحققنا من تسجيل شحن جلسة الدفع هذه في سجل معاملات حسابك.',
    },
    pending: {
      icon: '🕒',
      title: 'تأكيد الشحن لم يصل بعد',
      description: 'قد يتأخر إشعار الدفع. راجع الرصيد لاحقاً، ولا تُكرر الدفع قبل التأكد من حالته.',
    },
    login: {
      icon: '🔐',
      title: 'سجّل دخولك للتحقق',
      description: 'لا يمكن عرض حالة شحن العملات إلا لصاحب الحساب الذي أجرى العملية.',
    },
    invalid: {
      icon: 'ℹ️',
      title: 'لا توجد جلسة دفع صالحة',
      description: 'افتح هذه الصفحة من رابط العودة الرسمي بعد إكمال الدفع على Stripe.',
    },
    error: {
      icon: '⚠️',
      title: 'تعذر التحقق من حالة الشحن',
      description: 'هذا لا يعني فشل الدفع. يمكنك إعادة التحقق أو مراجعة الرصيد لاحقاً.',
    },
  };

  const message = messages[state];

  return (
    <div dir="rtl" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', padding: 24,
      background: '#0f0f0f', color: 'white', textAlign: 'center',
      fontFamily: "'Cairo', sans-serif",
    }}>
      <div aria-hidden="true" style={{ fontSize: 64 }}>{message.icon}</div>
      <h1 style={{ fontSize: 26, marginTop: 16 }}>{message.title}</h1>
      <p role="status" aria-live="polite" style={{ color: '#cbd5e1', maxWidth: 430, lineHeight: 1.8 }}>
        {message.description}
      </p>
      {(state === 'error' || state === 'pending') && (
        <button type="button" onClick={() => window.location.reload()}
          style={{ marginTop: 18, borderRadius: 9, padding: '12px 24px', border: 0, color: '#fff', background: '#475569', cursor: 'pointer' }}>
          إعادة التحقق
        </button>
      )}
      <button type="button" onClick={() => { window.location.href = '/'; }}
        style={{ marginTop: 18, padding: '12px 32px', background: '#7c3aed',
          border: 'none', borderRadius: 8, color: 'white', fontSize: 16, cursor: 'pointer' }}>
        العودة للتطبيق
      </button>
    </div>
  );
}
