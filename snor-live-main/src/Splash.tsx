import { useEffect, useState, useRef } from 'react';

interface SplashProps {
  onDone: () => void;
}

export default function Splash({ onDone }: SplashProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Fade in → hold → fade out
    const t1 = setTimeout(() => setPhase('hold'), 600);
    const t2 = setTimeout(() => setPhase('out'), 2200);
    const t3 = setTimeout(() => onDoneRef.current(), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        // Cover the ENTIRE viewport reliably on all mobile browsers
        position:        'fixed',
        inset:           0,
        zIndex:          9999,
        backgroundColor: '#000',
        // Perfect centering — works on every screen size
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        // Smooth fade-out transition
        opacity:         phase === 'out' ? 0 : 1,
        transition:      'opacity 0.7s ease',
        // Prevent any overflow on tiny screens
        overflow:        'hidden',
        // Safe area padding for notched phones
        paddingLeft:     'env(safe-area-inset-left)',
        paddingRight:    'env(safe-area-inset-right)',
        paddingTop:      'env(safe-area-inset-top)',
        paddingBottom:   'env(safe-area-inset-bottom)',
      }}
    >
      {/* Gem icon */}
      <div
        style={{
          fontSize:      'clamp(2.5rem, 12vw, 5rem)',
          marginBottom:  'clamp(0.75rem, 3vw, 1.5rem)',
          animation:     'splashGemPulse 1.8s ease-in-out infinite',
          lineHeight:    1,
        }}
      >
        💎
      </div>

      {/* Brand name */}
      <h1
        style={{
          // clamp(min, preferred, max) — scales smoothly between screen sizes
          fontSize:       'clamp(2rem, 10vw, 5rem)',
          fontWeight:     800,
          letterSpacing:  '0.08em',
          textAlign:      'center',
          margin:         0,
          padding:        '0 1rem',             // prevents edge-clipping on narrow screens
          lineHeight:     1.1,
          background:     'linear-gradient(135deg, #00d4ff 0%, #a855f7 50%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor:  'transparent',
          backgroundClip: 'text',
          fontFamily:     'system-ui, sans-serif',
          // Prevents the text from wrapping unexpectedly
          whiteSpace:     'nowrap',
        }}
      >
        SNOR LIVE
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize:      'clamp(0.75rem, 3.5vw, 1rem)',
          color:         'rgba(255,255,255,0.45)',
          marginTop:     'clamp(0.5rem, 2vw, 1rem)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontFamily:    'system-ui, sans-serif',
          textAlign:     'center',
          padding:       '0 1rem',
        }}
      >
        بث مباشر · شات فيديو
      </p>

      {/* Keyframe animation injected inline */}
      <style>{`
        @keyframes splashGemPulse {
          0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 12px #a855f7); }
          50%       { transform: scale(1.15); filter: drop-shadow(0 0 28px #00d4ff); }
        }
      `}</style>
    </div>
  );
}
