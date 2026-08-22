import { useState } from 'react';
import { useStreamerAnalytics } from '../hooks/useStreamerAnalytics';

export default function StreamerAnalyticsPage({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(30);
  const { analytics, loading } = useStreamerAnalytics(days);

  const summary = analytics?.summary || {};
  const topGifters = analytics?.top_gifters || [];
  const dailyStats = analytics?.daily_stats || [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#0a0a12', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>←</button>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>📊 تحليلات البث</h3>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
          <option value={7}>7 أيام</option>
          <option value={30}>30 يوم</option>
          <option value={90}>3 أشهر</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, direction: 'rtl' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ جاري التحميل...</div>}

        {!loading && (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'البثوث', value: summary.total_streams || 0, icon: '📺' },
                { label: 'الهدايا', value: `${summary.total_gifts || 0} 🪙`, icon: '🎁' },
                { label: 'المتابعون', value: summary.total_followers || 0, icon: '👥' },
                { label: 'الرصيد', value: `${summary.coin_balance || 0} 🪙`, icon: '💰' },
              ].map(c => (
                <div key={c.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{c.value}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Top Gifters */}
            {topGifters.length > 0 && (
              <>
                <h4 style={{ color: '#fff', margin: '0 0 12px' }}>🏆 أكثر المهديين</h4>
                {topGifters.slice(0, 5).map((g: any, i: number) => (
                  <div key={g.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : '#666', fontWeight: 800, fontSize: 16, width: 24 }}>#{i + 1}</span>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7c3aed', overflow: 'hidden', flexShrink: 0 }}>
                      {g.avatar_url && <img src={g.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>{g.username || 'مستخدم'}</p>
                    </div>
                    <span style={{ color: '#f59e0b', fontWeight: 800 }}>{g.total_coins} 🪙</span>
                  </div>
                ))}
              </>
            )}

            {/* Daily Chart (simple bars) */}
            {dailyStats.length > 0 && (
              <>
                <h4 style={{ color: '#fff', margin: '20px 0 12px' }}>📈 العملات اليومية</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, padding: '0 4px' }}>
                  {dailyStats.slice(-14).map((d: any, i: number) => {
                    const maxCoins = Math.max(...dailyStats.map((x: any) => x.coins_earned || 0), 1);
                    const height = ((d.coins_earned || 0) / maxCoins) * 70;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: '100%', height: height + 'px', minHeight: 3, background: 'linear-gradient(180deg, #a855f7, #7c3aed)', borderRadius: '3px 3px 0 0' }} />
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: '#555', fontSize: 11, textAlign: 'center', margin: '4px 0 0' }}>آخر 14 يوم</p>
              </>
            )}

            {!analytics && (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <p>لا توجد بيانات بعد</p>
                <p style={{ fontSize: 13 }}>ابدأ البث المباشر لرؤية إحصائياتك</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
