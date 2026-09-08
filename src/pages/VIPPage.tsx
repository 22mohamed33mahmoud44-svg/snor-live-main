import { useVIP } from '../hooks/useVIP';

const tierColors: Record<string, string> = {
  silver: 'linear-gradient(135deg, #9ca3af, #d1d5db)',
  gold:   'linear-gradient(135deg, #f59e0b, #fbbf24)',
  diamond:'linear-gradient(135deg, #7c3aed, #a855f7)',
};
const tierEmoji: Record<string, string> = { silver: '🥈', gold: '🥇', diamond: '💎' };

export default function VIPPage({ onClose }: { onClose: () => void }) {
  const { vipData, pricing, loading, isVIP, subscribe } = useVIP();

  const grouped = pricing.reduce((acc: any, p: any) => {
    if (!acc[p.tier]) acc[p.tier] = [];
    acc[p.tier].push(p);
    return acc;
  }, {});

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, background: '#0f0f1a', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>⭐ اشتراك VIP</h3>
          <span style={{ width: 36 }} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, direction: 'rtl' }}>
          {isVIP && (
            <div style={{ background: tierColors[vipData.tier] || '#333', borderRadius: 16, padding: 20, marginBottom: 20, color: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{tierEmoji[vipData.tier]}</div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>أنت عضو {vipData.tier.toUpperCase()}</p>
              <p style={{ margin: '6px 0 0', opacity: 0.8, fontSize: 13 }}>ينتهي بعد {vipData.days_remaining} يوم</p>
            </div>
          )}
          {['silver','gold','diamond'].map(tier => (
            <div key={tier} style={{ marginBottom: 24 }}>
              <h4 style={{ color: '#fff', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                {tierEmoji[tier]} {tier.toUpperCase()}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(grouped[tier] || []).map((p: any) => (
                  <button key={p.id} onClick={() => subscribe(p.id)} style={{
                    background: tierColors[tier], border: 'none', borderRadius: 12,
                    padding: '12px 8px', cursor: 'pointer', textAlign: 'center', color: '#fff'
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{p.duration_days === 30 ? 'شهري' : p.duration_days === 90 ? '3 أشهر' : 'سنوي'}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, margin: '4px 0' }}>{p.coins_cost} 🪙</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>${p.usd_price}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
