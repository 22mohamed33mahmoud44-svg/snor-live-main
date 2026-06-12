import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth, OnboardingData } from './hooks/useAuth';
import { translations } from './translations';

const Splash          = lazy(() => import('./Splash'));
const Onboarding      = lazy(() => import('./Onboarding'));
const Auth            = lazy(() => import('./Auth'));
const CompleteProfile = lazy(() => import('./CompleteProfile'));
const Profile         = lazy(() => import('./Profile'));
const RandomMatch     = lazy(() => import('./RandomMatch'));
const VideoCall       = lazy(() => import('./VideoCall'));
const Dashboard       = lazy(() => import('./Dashboard'));
const Navbar          = lazy(() => import('./components/Navbar'));
const Home            = lazy(() => import('./pages/Home'));
const PaymentSuccess  = lazy(() => import('./pages/PaymentSuccess'));

const Loading = () => (
  <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
    <div style={{ fontSize:'3rem' }}>💎</div>
  </div>
);

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

  // ── Payment Success ──
  if (window.location.pathname === '/payment/success') return (
    <Suspense fallback={<Loading />}>
      <PaymentSuccess />
    </Suspense>
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir  = dir;
  }, [lang, dir]);

  const toggleLanguage = () => setLang(l => l === 'ar' ? 'en' : 'ar');

  const getRemoteUserId = (match: any, myId: string) =>
    match.user1 === myId ? match.user2 : match.user1;

  // ── 1) Splash ──
  if (showSplash) return (
    <Suspense fallback={<Loading />}>
      <Splash onDone={() => setShowSplash(false)} />
    </Suspense>
  );

  // ── 2) Loading ──
  if (user && !profileChecked) return <Loading />;

  // ── 3) Onboarding ──
  if (user && profileChecked && showOnboarding) return (
    <Suspense fallback={<Loading />}>
      <Onboarding onComplete={(data: OnboardingData) => handleOnboardingComplete(data, user.id)} />
    </Suspense>
  );

  // ── 4) Logged-in screens ──
  if (user && profileChecked && !showOnboarding) {
    if (currentMatch) return (
      <Suspense fallback={<Loading />}>
        <VideoCall
          userId={user.id}
          matchId={currentMatch.id}
          remoteUserId={getRemoteUserId(currentMatch, user.id)}
          onEnd={() => setCurrentMatch(null)}
          onNext={() => { setCurrentMatch(null); setShowRandomMatch(true); }}
        />
      </Suspense>
    );

    if (showRandomMatch) return (
      <Suspense fallback={<Loading />}>
        <RandomMatch
          userId={user.id}
          onClose={() => setShowRandomMatch(false)}
          onMatch={(match: any) => { setCurrentMatch(match); setShowRandomMatch(false); }}
        />
      </Suspense>
    );

    return (
      <Suspense fallback={<Loading />}>
        <Dashboard
          userId={user.id}
          onStartRandomMatch={() => setShowRandomMatch(true)}
          onLogout={logout}
        />
      </Suspense>
    );
  }

  // ── 5) Landing page (guest) ──
  return (
    <Suspense fallback={<Loading />}>
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
    </Suspense>
  );
}

export default App;