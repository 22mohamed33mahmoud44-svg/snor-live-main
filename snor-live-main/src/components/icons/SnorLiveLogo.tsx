// ── الشعار النيون الثابت والمحاذي 100% ──────────────────────────────

export const SnorLiveLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <span style={{
      fontFamily: "'Cairo', sans-serif",
      fontWeight: 900,
      fontSize: '25px',
      color: '#00d4ff',
      letterSpacing: '0.5px',
      lineHeight: 1
    }}>
      snor
    </span>
    <span style={{
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      backgroundColor: '#00d4ff',
      boxShadow: '0 0 8px #00d4ff',
      display: 'inline-block'
    }} />
  </div>
);
