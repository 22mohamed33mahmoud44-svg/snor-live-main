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

const ProfileError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div
    dir="rtl"
    style={{
      position: 'fixed', inset: 0, background: '#05050c', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      zIndex: 10000, textAlign: 'center', fontFamily: "'Cairo', sans-serif",
    }}
  >
    <div style={{ maxWidth: 420, width: '100%' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ margin: '0 0 10px', fontSize: 22 }}>تعذر تحميل ملفك الشخصي</h2>
      <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, margin: '0 0 24px' }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{ border: 0, borderRadius: 12, padding: '12px 28px', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
      >
        إعادة المحاولة
      </button>
    </div>
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
    profileError,
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

  // ── Payment Success ──
  if (window.location.pathname === '/payment/success') return (
    <Suspense fallback={<Loading />}>
      <PaymentSuccess />
    </Suspense>
  );

  const toggleLanguage = () => setLang(l => l === 'ar' ? 'en' : 'ar');

  const getRemoteUserId = (match: any, myId: string) =>
    match.user1 === myId ? match.user2 : match.user1;

  // ── 1) Splash ──
  if (showSplash) return (
    <Suspense fallback={<Loading />}>
      <Splash onDone={() => setShowSplash(false)} />
    </Suspense>
  );

  // ── 2) Loading / profile error ──
  if (user && profileError && !profileChecked) return (
    <ProfileError
      message={profileError}
      onRetry={() => window.location.reload()}
    />
  );

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
