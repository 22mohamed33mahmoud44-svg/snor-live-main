import { useEffect, useState } from 'react';
import { useDailyBonus } from '../hooks/useDailyBonus';

export default function DailyBonusPopup({ onClose }: { onClose: () => void }) {
  const { claimBonus } = useDailyBonus();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const handleClaim = async () => {
    setLoading(true);
    const { data } = await claimBonus();
    setResult(data);
    setClaimed(true);
    setLoading(false);
    if (data?.success) {
      setTimeout(onClose, 3000);
    }
  };

  const streakColors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
  const streakColor = result?.streak ? streakColors[(result.streak - 1) % streakColors.length] : '#7c3aed';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #0f0f1a, #1a1a2e)',
        borderRadius: 24, padding: 32, maxWidth: 360, width: '100%',
        border: '1px solid rgba(124,58,237,0.3)',
        textAlign: 'center', direction: 'rtl',
        boxShadow: '0 0 60px rgba(124,58,237,0.2)',
      }}>
        {!claimed ? (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎰</div>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>
              مكافأتك اليومية جاهزة!
            </h2>
            <p style={{ color: '#888', margin: '0 0 24px', fontSize: 14 }}>
              احصل على عملاتك المجانية كل يوم
            </p>
            <button
              onClick={handleClaim}
              disabled={loading}
              style={{
                width: '100%', padding: '14px 0',
                background: loading ? '#333' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                border: 'none', borderRadius: 14, color: '#fff',
                fontSize: 17, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '⏳ جاري...' : '🎁 احصل على المكافأة'}
            </button>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#555',
              fontSize: 13, cursor: 'pointer', marginTop: 16,
            }}>تخطي</button>
          </>
        ) : result?.success ? (
          <>
            <div style={{ fontSize: 72, marginBottom: 8, animation: 'pulse 0.5s' }}>🎉</div>
            <h2 style={{ color: '#22c55e', margin: '0 0 8px', fontSize: 26, fontWeight: 900 }}>
              +{result.bonus} 🪙
            </h2>
            <p style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>
              تم إضافة العملات لحسابك!
            </p>
            {result.streak > 1 && (
              <div style={{
                background: `linear-gradient(135deg, ${streakColor}22, ${streakColor}44)`,
                border: `1px solid ${streakColor}66`,
                borderRadius: 12, padding: '10px 16px',
              }}>
                <p style={{ margin: 0, color: streakColor, fontWeight: 800, fontSize: 15 }}>
                  🔥 {result.streak} أيام متتالية!
                </p>
              </div>
            )}
            <p style={{ color: '#555', fontSize: 12, marginTop: 16 }}>سيغلق تلقائياً...</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 20 }}>
              استلمت مكافأتك اليوم
            </h2>
            <p style={{ color: '#888', margin: '0 0 24px', fontSize: 14 }}>
              عد غداً للحصول على مكافأة جديدة
            </p>
            <button onClick={onClose} style={{
              width: '100%', padding: '12px 0',
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: 14, color: '#fff', fontSize: 15, cursor: 'pointer',
            }}>حسناً</button>
          </>
        )}
      </div>
    </div>
  );
}
