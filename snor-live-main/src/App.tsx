import { useState, useEffect } from 'react';
import Splash          from './Splash';
import Onboarding      from './Onboarding';
import Auth            from './Auth';
import CompleteProfile from './CompleteProfile';
import Profile         from './Profile';
import RandomMatch     from './RandomMatch';
import VideoCall       from './VideoCall';
import Dashboard       from './Dashboard';
import Navbar          from './components/Navbar';
import Home            from './pages/Home';
import { useAuth, OnboardingData } from './hooks/useAuth';
import { translations } from './translations';

function App() {
  const [lang,            setLang]            = useState<'ar' | 'en'>('ar');
  const [showSplash,      setShowSplash]      = useState(true);
  const [showAuth,        setShowAuth]        = useState(false);
  const [showProfile,     setShowProfile]     = useState(false);
  const [showRandomMatch, setShowRandomMatch] = useState(false);
  const [currentMatch,    setCurrentMatch]    = useState<any>(null);

  const {
    user,
    profileChecked,
    showOnboarding,
    showCompleteProfile,
    setShowCompleteProfile,
    handleOnboardingComplete,
    logout,
  } = useAuth();

  const t   = translations[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir  = dir;
  }, [lang, dir]);

  const toggleLanguage = () => setLang(l => l === 'ar' ? 'en' : 'ar');

  const getRemoteUserId = (match: any, myId: string) =>
    match.user1 === myId ? match.user2 : match.user1;

  // ── 1) Splash ──
  if (showSplash) return <Splash onDone={() => setShowSplash(false)} />;

  // ── 2) Loading ──
  if (user && !profileChecked) {
    return (
      <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
        <div style={{ fontSize:'3rem' }}>💎</div>
      </div>
    );
  }

  // ── 3) Onboarding ──
  if (user && profileChecked && showOnboarding) {
    return <Onboarding onComplete={(data: OnboardingData) => handleOnboardingComplete(data, user.id)} />;
  }

  // ── 4) Logged-in screens ──
  if (user && profileChecked && !showOnboarding) {
    if (currentMatch) return (
      <VideoCall
        userId={user.id}
        matchId={currentMatch.id}
        remoteUserId={getRemoteUserId(currentMatch, user.id)}
        onEnd={() => setCurrentMatch(null)}
        onNext={() => { setCurrentMatch(null); setShowRandomMatch(true); }}
      />
    );

    if (showRandomMatch) return (
      <RandomMatch
        userId={user.id}
        onClose={() => setShowRandomMatch(false)}
        onMatch={(match: any) => { setCurrentMatch(match); setShowRandomMatch(false); }}
      />
    );

    return (
      <Dashboard
        userId={user.id}
        onStartRandomMatch={() => setShowRandomMatch(true)}
        onLogout={logout}
      />
    );
  }

  // ── 5) Landing page (guest) ──
  return (
    <div className="min-h-screen bg-primary relative" dir={dir}>

      {!user && <Auth isOpen={showAuth} onClose={() => setShowAuth(false)} />}

      {user && showCompleteProfile && (
        <CompleteProfile userId={user.id} onComplete={() => setShowCompleteProfile(false)} />
      )}

      {user && showProfile && (
        <Profile
          userId={user.id}
          onLogout={() => { logout(); setShowProfile(false); }}
          onClose={() => setShowProfile(false)}
          onStartRandomMatch={() => { setShowProfile(false); setShowRandomMatch(true); }}
        />
      )}

      <Navbar
        user={user}
        t={t}
        toggleLanguage={toggleLanguage}
        onShowAuth={() => setShowAuth(true)}
        onShowProfile={() => setShowProfile(true)}
      />

      <Home
        lang={lang}
        t={t}
        user={user}
        onShowAuth={() => setShowAuth(true)}
        onStartRandomMatch={() => setShowRandomMatch(true)}
      />

    </div>
  );
}

export default App;
