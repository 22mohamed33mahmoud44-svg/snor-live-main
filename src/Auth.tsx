import { useState } from 'react';
import { supabase } from './supabase';
import { emailAuthNextStep } from './utils/emailAuthOutcome';

interface AuthProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Auth({ isOpen, onClose }: AuthProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  if (!isOpen) return null;

  const handleEmailAuth = async () => {
    if (loading) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage('من فضلك ادخل الإيميل وكلمة المرور');
      return;
    }

    setLoading(true);
    setMessage('');
    setSuccessMessage('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        const next = emailAuthNextStep(true, data);
        if (next === 'signed-in') {
          onClose();
        } else if (next === 'check-email') {
          // This may also be an obfuscated response for an existing email.
          // Do not reveal whether an account already exists.
          setSuccessMessage('لو البريد مؤهل للتسجيل، هتوصلك رسالة لتأكيد حسابك. افتح رابط التأكيد وبعدها سجّل دخولك هنا.');
          setPassword('');
        } else {
          setMessage('تعذر إكمال إنشاء الحساب. حاول مرة أخرى.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        if (emailAuthNextStep(false, data) === 'signed-in') {
          onClose();
        } else {
          setMessage('لم يتم إنشاء جلسة دخول. تأكد من البريد وحاول مجددًا.');
        }
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'تعذر الاتصال بخدمة تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setMessage('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'تعذر بدء تسجيل الدخول بجوجل.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      className="flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        style={{ background: '#111827', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, position: 'relative', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 34, height: 34, color: '#9ca3af', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >✕</button>

        {/* Title */}
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', marginBottom: 24, fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
          {isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول'}
        </h2>

        {/* Error */}
        {message && (
          <p role="alert" style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 16, fontFamily: 'Cairo, sans-serif' }}>
            {message}
          </p>
        )}
        {successMessage && (
          <p role="status" aria-live="polite" style={{ color: '#86efac', fontSize: 14, textAlign: 'center', lineHeight: 1.8, marginBottom: 16, fontFamily: 'Cairo, sans-serif' }}>
            {successMessage}
          </p>
        )}

        {/* Google Button */}
        <button
          onClick={() => { void handleGoogleLogin(); }}
          disabled={loading}
          style={{ width: '100%', background: '#fff', color: '#111', padding: '13px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, fontFamily: 'Cairo, sans-serif', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
        >
          <img src="https://www.google.com/favicon.ico" style={{ width: 20, height: 20 }} alt="Google" />
          دخول بـ Google
        </button>

        {/* Divider */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <span style={{ background: '#111827', padding: '0 12px', color: '#6b7280', fontSize: 13, fontFamily: 'Cairo, sans-serif' }}>أو</span>
          </div>
        </div>

        {/* Email */}
        <input
          type="email"
          placeholder="الإيميل"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', background: '#1f2937', color: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12, fontSize: 15, textAlign: 'right', fontFamily: 'Cairo, sans-serif', boxSizing: 'border-box' }}
        />

        {/* Password */}
        <input
          type="password"
          placeholder="كلمة المرور"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
          style={{ width: '100%', background: '#1f2937', color: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20, fontSize: 15, textAlign: 'right', fontFamily: 'Cairo, sans-serif', boxSizing: 'border-box' }}
        />

        {/* Submit */}
        <button
          onClick={() => { void handleEmailAuth(); }}
          disabled={loading}
          style={{ width: '100%', background: 'linear-gradient(135deg, #7c6aff, #06b6d4)', color: '#fff', padding: '13px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'Cairo, sans-serif', opacity: loading ? 0.7 : 1, marginBottom: 16 }}
        >
          {loading ? 'جاري...' : isSignUp ? 'إنشاء حساب' : 'دخول'}
        </button>

        {/* Toggle signup/login */}
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
          {isSignUp ? 'عندك حساب؟ ' : 'مش عندك حساب؟ '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setMessage(''); setSuccessMessage(''); }}
            style={{ color: '#06b6d4', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Cairo, sans-serif', fontSize: 13 }}
          >
            {isSignUp ? 'سجّل دخول' : 'إنشاء حساب'}
          </button>
        </p>
      </div>
    </div>
  );
}
