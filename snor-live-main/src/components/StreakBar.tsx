interface StreakBarProps {
  streak: number;
  lastLoginDate?: string;
}

export default function StreakBar({ streak, lastLoginDate }: StreakBarProps) {
  const isActiveToday = lastLoginDate === new Date().toISOString().split('T')[0];
  const milestones = [3, 7, 14, 30];
  const nextMilestone = milestones.find(m => m > streak) || 30;
  const progress = (streak / nextMilestone) * 100;

  const streakEmoji = streak >= 30 ? '👑' : streak >= 14 ? '💎' : streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '✨';
  const bonusCoins = streak >= 30 ? 50 : streak >= 14 ? 30 : streak >= 7 ? 20 : streak >= 3 ? 15 : 10;

  if (streak === 0) return null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 14,
      padding: '12px 16px', direction: 'rtl',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{streakEmoji}</span>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 13 }}>
              {streak} يوم متتالي
            </p>
            <p style={{ margin: 0, color: '#888', fontSize: 11 }}>
              مكافأة اليوم: +{bonusCoins} 🪙
            </p>
          </div>
        </div>
        <div style={{
          background: isActiveToday ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          borderRadius: 8, padding: '4px 10px',
        }}>
          <span style={{
            color: isActiveToday ? '#22c55e' : '#ef4444',
            fontSize: 11, fontWeight: 700,
          }}>
            {isActiveToday ? '✅ اليوم' : '⚠️ لم تسجل اليوم'}
          </span>
        </div>
      </div>
      {/* Progress bar to next milestone */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 5 }}>
        <div style={{
          width: `${Math.min(progress, 100)}%`,
          background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
          borderRadius: 99, height: '100%', transition: 'width 0.5s',
        }} />
      </div>
      <p style={{ margin: '6px 0 0', color: '#555', fontSize: 10, textAlign: 'left' }}>
        {nextMilestone - streak} أيام للوصول لـ {nextMilestone} 🎯
      </p>
    </div>
  );
}
