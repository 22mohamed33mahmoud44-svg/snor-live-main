// ── GLOBAL STYLESHEET ────────────────────────────────────────────

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif !important; }
  ::-webkit-scrollbar { display: none; }
  
  .tab-fadein { animation: vc-tab-slide .35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  @keyframes vc-tab-slide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.97); } }
  @keyframes radar-pulse { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }

  .glass-capsule-header { display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); padding: 5px 8px; border-radius: 20px; backdrop-filter: blur(15px); }

  .dashboard-shell { position: fixed; inset: 0; background: #03030a; display: flex; flex-direction: column; direction: rtl; color: #f0f0ff; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); }
  .dashboard-header { padding: 0 16px; height: 64px; background: rgba(5,5,12,.5); backdrop-filter: blur(30px); border-bottom: 1px solid rgba(255,255,255,.04); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; z-index: 20; }
  .dashboard-content { flex: 1; overflow-y:auto; padding-bottom: calc(95px + env(safe-area-inset-bottom)); }
  .dashboard-bottom-nav { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); width: min(94vw, 680px); height: 68px; z-index: 100; background: rgba(10,10,22,0.8); backdrop-filter: blur(30px); border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-around; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }

  @media (min-width: 1024px) {
    .dashboard-shell { padding-inline: 24px; }
    .dashboard-header { max-width: 1400px; width: 100%; margin: 0 auto; border-radius: 0 0 24px 24px; }
    .dashboard-content { max-width: 1400px; width: 100%; margin: 0 auto; padding-inline: 18px; }
    .dashboard-bottom-nav { bottom: 20px; }
  }
  
  .btn-charge-small { padding: 6px 12px; border-radius: 12px; background: linear-gradient(135deg,#7c3aed,#00d4ff); border: none; color: #fff; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: transform 0.2s; box-shadow: 0 2px 8px rgba(0,212,255,0.2); }
  .btn-charge-small:active { transform: scale(0.95); }

  .header-icon-btn { width: 34px; height: 34px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .header-icon-btn:hover { color: #00d4ff; background: rgba(255,255,255,.1); transform: scale(1.05); }

  .header-avatar-btn { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,.2); cursor: pointer; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#7c3aed,#00d4ff); font-size: 0.8rem; font-weight: 800; color: #fff; transition: all 0.2s; }
  .header-avatar-btn:hover, .header-avatar-btn.active-border { border-color: #00d4ff; transform: scale(1.05); box-shadow: 0 0 10px rgba(0,212,255,0.3); }

  .category-badge { padding: 8px 16px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.25s ease; }
  .category-badge.active { background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(0,212,255,0.15)); border-color: #00d4ff; color: #00d4ff; box-shadow: 0 0 15px rgba(0,212,255,0.2); }

  .fab-live-trigger-fixed { position: fixed; bottom: 100px; left: 24px; width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #7c3aed); border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 24px rgba(0, 212, 255, 0.4); border: 1px solid rgba(255, 255, 255, 0.2); transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 90; }
  .fab-live-trigger-fixed:hover { transform: scale(1.08); box-shadow: 0 0 35px rgba(0, 212, 255, 0.6); }
  .fab-live-trigger-fixed:active { transform: scale(0.94); }

  .gender-selector-bar { display: flex; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 4px; border-radius: 16px; gap: 6px; margin-bottom: 28px; }
  .gender-btn { padding: 6px 16px; border-radius: 12px; background: none; border: none; color: rgba(255,255,255,0.5); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .gender-btn.active { background: rgba(255,255,255,0.06); color: #00d4ff; font-weight: 700; }

  .match-centered-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 72vh; padding: 20px; }
  .radar-glow-container { position: relative; width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
  .pulse-ring { position: absolute; width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle, rgba(0,212,255,0.14) 0%, transparent 70%); animation: radar-pulse 3s infinite linear; }
  .ring-2 { animation-delay: 1s; }
  .ring-3 { animation-delay: 2s; }
  .btn-match-giant { width: 160px; height: 160px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #00d4ff); border: none; padding: 3px; cursor: pointer; box-shadow: 0 0 40px rgba(0,212,255,0.35); transition: all 0.3s ease; animation: pulse 2.5s infinite ease-in-out; z-index: 5; }
  .btn-match-giant:hover { transform: scale(1.04); box-shadow: 0 0 50px rgba(124,58,237,0.5); }
  .btn-match-giant .inner-glow-circle { width: 100%; height: 100%; border-radius: 50%; background: #04040c; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #00d4ff; }

  .chat-row-card { display: flex; align-items: center; gap: 14px; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 18px; cursor: pointer; transition: all 0.2s; }
  .chat-row-card:hover { background: rgba(255,255,255,0.04); transform: translateY(-2px); border-color: rgba(0,212,255,0.15); }
  .unread-badge-counter { background: #00d4ff; color: #05050c; font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 20px; box-shadow: 0 0 10px rgba(0,212,255,0.3); }

  .profile-banner { height: 140px; background: linear-gradient(135deg,rgba(124,58,237,.2),rgba(0,212,255,.12),rgba(244,114,182,.08)); position: relative; }
  .profile-avatar-outer { position: absolute; bottom: -48px; right: 50%; transform: translateX(50%); z-index: 5; }
  .profile-avatar-outer .avatar-core { width: 96px; height: 96px; border-radius: 50%; padding: 3px; background: linear-gradient(135deg,#7c3aed,#00d4ff); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
  .profile-avatar-outer .avatar-core img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; background: #07070f; }
  .profile-tag { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); border-radius: 20px; padding: 5px 14px; font-size: 0.8rem; color: #cbd5e1; }
  .profile-tag.active { background: rgba(74,222,128,.06); border-color: rgba(74,222,128,.15); color: #4ade80; display: flex; align-items: center; gap: 5px; }
  .profile-tag.active .dot { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
  .profile-stats-grid { margin: 20px 16px; background: rgba(255,255,255,.01); border: 1px solid rgba(255,255,255,.03); border-radius: 22px; padding: 18px; display: flex; align-items: center; }
  .profile-stats-grid > div { flex: 1; text-align: center; }
  .profile-stats-grid .val { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg,#fff,#00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .profile-stats-grid .lbl { font-size: 0.72rem; color: rgba(255,255,255,.35); margin-top: 3px; }
  .profile-stats-grid .line { width: 1px; height: 34px; background: rgba(255,255,255,.05); }
  .profile-btn { width: 100%; padding: 14px; border-radius: 16px; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s; }
  .profile-btn.primary { background: rgba(0,212,255,.06); border: 1px solid rgba(0,212,255,.15); color: #00d4ff; }
  .profile-btn.danger { background: rgba(239,68,68,.05); border: 1px solid rgba(239,68,68,.12); color: #f87171; }

  .search-box { background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); border-radius: 16px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; color: rgba(255,255,255,.25); }
  .search-box input { flex: 1; background: none; border: none; outline: none; color: #fff; font-size: 0.9rem; }

  .section-title { font-size: 0.7rem; color: rgba(0,212,255,0.5); font-weight: 700; letter-spacing: 0.8px; margin-bottom: 6px; text-transform: uppercase; }
  .settings-row { display: flex; align-items: center; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 0.95rem; }
  
  .ios-switch { appearance: none; width: 42px; height: 24px; background: rgba(255,255,255,.08); border-radius: 12px; position: relative; cursor: pointer; transition: background 0.25s; outline: none; }
  .ios-switch:checked { background: linear-gradient(135deg,#7c3aed,#00d4ff); }
  .ios-switch::before { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.25s; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
  .ios-switch:checked::before { transform: translateX(18px); }

  .nav-active-bar { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); width: 22px; height: 3px; border-radius: 0 0 4px 4px; background: linear-gradient(90deg,#7c3aed,#00d4ff); box-shadow: 0 2px 12px #00d4ff; }
  .nav-badge-dot { position: absolute; top: -4px; left: -6px; background: #00d4ff; border-radius: 8px; font-size: 0.58rem; font-weight: 800; padding: 1px 5px; color: #06060f; border: 2px solid #0a0a16; }
`;
