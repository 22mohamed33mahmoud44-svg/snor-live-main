import { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface ProfileProps {
  userId: string;
  onLogout: () => void;
  onClose: () => void;
  onStartRandomMatch: () => void;
}

export default function Profile({
  userId,
  onLogout,
  onClose,
  onStartRandomMatch,
}: ProfileProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(data);
      setLoading(false);
    };
    fetchProfile();
  }, [userId]);

  const handleMatch = () => {
    onClose();
    onStartRandomMatch();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
    onClose();
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: 'white', fontSize: '20px', fontFamily: 'Cairo, sans-serif' }}>
          جاري التحميل...
        </p>
      </div>
    );
  }

  const age = profile?.birthdate
    ? new Date().getFullYear() - new Date(profile.birthdate).getFullYear()
    : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', fontFamily: 'Cairo, sans-serif', direction: 'rtl',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#111827',
          borderRadius: '20px',
          padding: '32px',
          width: '100%',
          maxWidth: '420px',
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', left: '16px',
            color: '#9ca3af', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%', width: 34, height: 34,
            fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {/* Avatar */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="avatar"
              style={{
                width: 100, height: 100, borderRadius: '50%',
                objectFit: 'cover', border: '3px solid #06b6d4',
                margin: '0 auto', display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              backgroundColor: '#1f2937', border: '3px solid #06b6d4',
              margin: '0 auto', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '40px',
            }}>👤</div>
          )}
        </div>

        {/* Username */}
        <h2 style={{
          color: 'white', fontSize: '22px', fontWeight: 900,
          textAlign: 'center', marginBottom: '10px',
        }}>
          {profile?.username ?? 'مجهول'}
        </h2>

        {/* Badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{
            backgroundColor: '#1f2937', color: '#06b6d4',
            padding: '5px 14px', borderRadius: '20px', fontSize: '13px',
          }}>
            {profile?.gender === 'ذكر' ? '👨 ذكر' : '👩 أنثى'}
          </span>
          {age && (
            <span style={{
              backgroundColor: '#1f2937', color: '#a78bfa',
              padding: '5px 14px', borderRadius: '20px', fontSize: '13px',
            }}>
              🎂 {age} سنة
            </span>
          )}
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px', marginBottom: '20px',
        }}>
          {[
            { icon: '💎', value: '0', label: 'جواهر', color: '#06b6d4' },
            { icon: '👥', value: '0', label: 'متابع',  color: '#fff' },
            { icon: '❤️', value: '0', label: 'متابَع', color: '#fff' },
          ].map(s => (
            <div key={s.label} style={{
              backgroundColor: '#1f2937', borderRadius: '12px',
              padding: '12px', textAlign: 'center',
            }}>
              <div style={{ color: s.color, fontSize: '18px', fontWeight: 800 }}>
                {s.icon} {s.value}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '4px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Match Button */}
        <button
          onClick={handleMatch}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #7c6aff, #06b6d4)',
            color: 'white', padding: '13px',
            borderRadius: '12px', border: 'none',
            fontWeight: 800, fontSize: '16px',
            cursor: 'pointer', marginBottom: '10px',
            fontFamily: 'Cairo, sans-serif',
            boxShadow: '0 6px 20px rgba(6,182,212,0.3)',
          }}
        >
          🎥 ابدأ مطابقة عشوائية
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            backgroundColor: '#ef4444',
            color: 'white', padding: '13px',
            borderRadius: '12px', border: 'none',
            fontWeight: 800, fontSize: '16px',
            cursor: 'pointer', fontFamily: 'Cairo, sans-serif',
          }}
        >
          🚪 تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
