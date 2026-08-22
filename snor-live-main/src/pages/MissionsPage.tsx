import { useMissions } from '../hooks/useMissions';

export default function MissionsPage({ onClose }: { onClose: () => void }) {
  const { missions, completed, loading, claimReward } = useMissions();

  const typeLabel: Record<string, string> = { daily: 'يومية', weekly: 'أسبوعية', one_time: 'مرة واحدة' };
  const typeColor: Record<string, string> = { daily: '#7c3aed', weekly: '#0ea5e9', one_time: '#f59e0b' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, background: '#0f0f1a', borderRadius: '20px 20px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>🎯 المهام اليومية</h3>
          <span style={{ color: '#7c3aed', fontSize: 13 }}>{completed.length} مكتملة</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, direction: 'rtl' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>جاري التحميل...</div>}
          {missions.map((m: any) => (
            <div key={m.mission_id} style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16,
              border: m.is_completed ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.07)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{m.is_completed ? '✅' : '🎯'}</span>
                  <div>
                    <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>{m.title}</p>
                    <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>{m.description}</p>
                  </div>
                </div>
                <span style={{ background: typeColor[m.type] || '#555', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: '#fff' }}>
                  {typeLabel[m.type] || m.type}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 6, marginBottom: 10 }}>
                <div style={{ width: `${Math.min((m.progress / m.target_count) * 100, 100)}%`, background: '#7c3aed', borderRadius: 99, height: '100%', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#888', fontSize: 12 }}>{m.progress}/{m.target_count}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>+{m.reward_coins} 🪙</span>
                  {m.is_completed && !m.reward_claimed && (
                    <button onClick={() => claimReward(m.mission_id)} style={{
                      background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: 8,
                      padding: '5px 12px', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700
                    }}>استلم</button>
                  )}
                  {m.reward_claimed && <span style={{ color: '#22c55e', fontSize: 12 }}>✅ تم الاستلام</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
