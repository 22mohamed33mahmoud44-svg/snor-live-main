import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function AgentDashboardPage({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    supabase.rpc('get_agent_dashboard').then(({ data: d }) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    const { data: res } = await supabase.rpc('register_as_agent');
    if (res?.success) {
      const { data: d } = await supabase.rpc('get_agent_dashboard');
      setData(d);
    }
    setRegistering(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, background: '#0f0f1a', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>🤝 نظام الوكلاء</h3>
          <span style={{ width: 36 }} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, direction: 'rtl' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>جاري التحميل...</div>}

          {!loading && !data?.is_agent && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🤝</div>
              <h3 style={{ color: '#fff', margin: '0 0 12px' }}>سجّل كوكيل واكسب عمولات</h3>
              <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
                احصل على كود خاص بك وشارك المذيعين — ستحصل على عمولة من كل هدية يستقبلونها!
              </p>
              <button onClick={handleRegister} disabled={registering} style={{
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                border: 'none', borderRadius: 14, padding: '14px 32px',
                color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
              }}>
                {registering ? '⏳ جاري...' : '🚀 سجّل الآن مجاناً'}
              </button>
            </div>
          )}

          {!loading && data?.is_agent && (
            <>
              {/* Code Card */}
              <div style={{ background: 'linear-gradient(135deg, #7c3aed22, #a855f722)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 16, padding: 20, marginBottom: 20, textAlign: 'center' }}>
                <p style={{ color: '#888', margin: '0 0 8px', fontSize: 13 }}>كودك الخاص</p>
                <p style={{ color: '#a855f7', fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: 4 }}>
                  {data.agent_code}
                </p>
                <p style={{ color: '#555', fontSize: 12 }}>نسبة العمولة: {data.commission_rate}%</p>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'المذيعون', value: data.total_referrals, icon: '👥' },
                  { label: 'هذا الشهر', value: `${data.this_month_commissions} 🪙`, icon: '📊' },
                  { label: 'إجمالي', value: `${data.total_earnings} 🪙`, icon: '💰' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{s.value}</div>
                    <div style={{ color: '#888', fontSize: 11 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Streamers List */}
              {data.streamers?.length > 0 && (
                <>
                  <h4 style={{ color: '#fff', margin: '0 0 12px' }}>المذيعون ({data.streamers.length})</h4>
                  {data.streamers.map((s: any) => (
                    <div key={s.streamer_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', borderRadius: 12 }} alt="" /> : '👤'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>{s.username || 'مستخدم'}</p>
                        <p style={{ margin: 0, color: '#888', fontSize: 11 }}>انضم {new Date(s.joined_at).toLocaleDateString('ar')}</p>
                      </div>
                      <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>{s.total_earned} 🪙</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
