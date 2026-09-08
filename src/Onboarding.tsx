import { useState, useRef } from 'react';

interface OnboardingData {
  birthdate: string;
  gender: 'male' | 'female' | '';
  lookingFor: 'male' | 'female' | '';
  profileImage: string | null;
}

interface OnboardingProps {
  onComplete: (data: OnboardingData) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1); // 1=birthdate, 2=gender, 3=lookingFor, 4=photo
  const [data, setData] = useState<OnboardingData>({
    birthdate:    '',
    gender:       '',
    lookingFor:   '',
    profileImage: null,
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = 4;
  const progress   = (step / totalSteps) * 100;

  /* ── Age validation ── */
  const isAgeValid = () => {
    if (!data.birthdate) return false;
    const diff = Date.now() - new Date(data.birthdate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) >= 18;
  };

  const canProceed = () => {
    if (step === 1) return isAgeValid();
    if (step === 2) return !!data.gender;
    if (step === 3) return !!data.lookingFor;
    return true; // photo is optional
  };

  const next = () => {
    if (step < totalSteps) setStep(s => s + 1);
    else onComplete(data);
  };
  const back = () => setStep(s => s - 1);

  /* ── Image handling ── */
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setData(d => ({ ...d, profileImage: url }));
  };

  /* ── Gender / LookingFor button ── */
  const ChoiceBtn = ({
    label, emoji, selected, onClick,
  }: { label: string; emoji: string; selected: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        flex:            1,
        padding:         'clamp(1rem, 4vw, 1.5rem)',
        borderRadius:    '1rem',
        border:          selected ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,0.08)',
        background:      selected
          ? 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(168,85,247,0.15))'
          : 'rgba(255,255,255,0.04)',
        cursor:          'pointer',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        gap:             '0.5rem',
        transition:      'all 0.2s ease',
        transform:       selected ? 'scale(1.03)' : 'scale(1)',
        boxShadow:       selected ? '0 0 20px rgba(0,212,255,0.25)' : 'none',
      }}
    >
      <span style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}>{emoji}</span>
      <span style={{
        color:      selected ? '#00d4ff' : 'rgba(255,255,255,0.6)',
        fontWeight: 600,
        fontSize:   'clamp(0.85rem, 3vw, 1rem)',
        fontFamily: 'system-ui, sans-serif',
      }}>{label}</span>
    </button>
  );

  /* ── Step content ── */
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <div style={styles.stepIcon}>🎂</div>
            <h2 style={styles.stepTitle}>كم عمرك؟</h2>
            <p style={styles.stepSub}>يجب أن يكون عمرك +18 سنة</p>
            <input
              type="date"
              value={data.birthdate}
              onChange={e => setData(d => ({ ...d, birthdate: e.target.value }))}
              max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              style={styles.dateInput}
            />
            {data.birthdate && !isAgeValid() && (
              <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                يجب أن يكون عمرك 18 سنة أو أكثر
              </p>
            )}
          </>
        );

      case 2:
        return (
          <>
            <div style={styles.stepIcon}>👤</div>
            <h2 style={styles.stepTitle}>أنت...؟</h2>
            <p style={styles.stepSub}>اختر جنسك</p>
            <div style={styles.choiceRow}>
              <ChoiceBtn label="ذكر" emoji="👨" selected={data.gender === 'male'} onClick={() => setData(d => ({ ...d, gender: 'male' }))} />
              <ChoiceBtn label="أنثى" emoji="👩" selected={data.gender === 'female'} onClick={() => setData(d => ({ ...d, gender: 'female' }))} />
            </div>
          </>
        );

      case 3:
        return (
          <>
            <div style={styles.stepIcon}>💞</div>
            <h2 style={styles.stepTitle}>بتدور على إيه؟</h2>
            <p style={styles.stepSub}>اختر نوع الأشخاص اللي عايز تتكلم معاهم</p>
            <div style={styles.choiceRow}>
              <ChoiceBtn label="ذكور" emoji="👨" selected={data.lookingFor === 'male'} onClick={() => setData(d => ({ ...d, lookingFor: 'male' }))} />
                <ChoiceBtn label="إناث" emoji="👩" selected={data.lookingFor === 'female'} onClick={() => setData(d => ({ ...d, lookingFor: 'female' }))} />
            </div>
          </>
        );

      case 4:
        return (
          <>
            <div style={styles.stepIcon}>📸</div>
            <h2 style={styles.stepTitle}>صورتك</h2>
            <p style={styles.stepSub}>اختياري — ممكن تضيفها بعدين</p>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width:         'clamp(120px, 35vw, 160px)',
                height:        'clamp(120px, 35vw, 160px)',
                borderRadius:  '50%',
                border:        '2px dashed rgba(0,212,255,0.4)',
                background:    imagePreview
                  ? 'none'
                  : 'rgba(0,212,255,0.05)',
                cursor:        'pointer',
                overflow:      'hidden',
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                flexDirection: 'column',
                gap:           '0.5rem',
                transition:    'border-color 0.2s',
                margin:        '0 auto',
              }}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <span style={{ fontSize: '2.5rem' }}>➕</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>اضغط لإضافة صورة</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />

            {imagePreview && (
              <button
                onClick={() => { setImagePreview(null); setData(d => ({ ...d, profileImage: null })); }}
                style={{ ...styles.skipBtn, marginTop: '0.75rem' }}
              >
                إزالة الصورة
              </button>
            )}
          </>
        );
    }
  };

  return (
    <div style={styles.overlay}>
      {/* Background glow */}
      <div style={styles.bgGlow} />

      <div style={styles.card}>
        {/* Progress bar */}
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>

        {/* Step counter */}
        <p style={styles.stepCounter}>{step} / {totalSteps}</p>

        {/* Step content */}
        <div style={styles.content}>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div style={styles.navRow}>
          {step > 1 && (
            <button onClick={back} style={styles.backBtn}>← رجوع</button>
          )}

          {step === 4 && (
            <button onClick={next} style={styles.skipBtn}>تخطي</button>
          )}

          <button
            onClick={next}
            disabled={!canProceed()}
            style={{
              ...styles.nextBtn,
              opacity:       canProceed() ? 1 : 0.35,
              cursor:        canProceed() ? 'pointer' : 'not-allowed',
              marginRight:   step > 1 ? 0 : 'auto',
              marginLeft:    step > 1 ? 0 : 'auto',
            }}
          >
            {step === totalSteps ? '🚀 ابدأ' : 'التالي →'}
          </button>
        </div>
      </div>

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
      `}</style>
    </div>
  );
}

/* ── Styles object ── */
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    zIndex:          9000,
    backgroundColor: '#080810',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         'clamp(1rem, 4vw, 2rem)',
    paddingTop:      'env(safe-area-inset-top, 1rem)',
    paddingBottom:   'env(safe-area-inset-bottom, 1rem)',
    fontFamily:      'system-ui, sans-serif',
    direction:       'rtl',
    overflow:        'hidden',
  },
  bgGlow: {
    position:  'absolute',
    top:       '20%',
    left:      '50%',
    transform: 'translateX(-50%)',
    width:     'clamp(200px, 60vw, 500px)',
    height:    'clamp(200px, 60vw, 500px)',
    borderRadius: '50%',
    background:   'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
    pointerEvents:'none',
  },
  card: {
    position:     'relative',
    width:        '100%',
    maxWidth:     '420px',
    background:   'rgba(255,255,255,0.04)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: '1.5rem',
    padding:      'clamp(1.5rem, 5vw, 2.5rem)',
    backdropFilter: 'blur(20px)',
    display:      'flex',
    flexDirection:'column',
    gap:          '1.5rem',
  },
  progressTrack: {
    width:        '100%',
    height:       '4px',
    borderRadius: '2px',
    background:   'rgba(255,255,255,0.08)',
    overflow:     'hidden',
  },
  progressFill: {
    height:     '100%',
    borderRadius:'2px',
    background: 'linear-gradient(90deg, #00d4ff, #a855f7)',
    transition: 'width 0.4s ease',
  },
  stepCounter: {
    textAlign: 'center',
    color:     'rgba(255,255,255,0.3)',
    fontSize:  '0.8rem',
    margin:    0,
  },
  content: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '1rem',
    minHeight:     'clamp(180px, 40vw, 240px)',
    justifyContent:'center',
  },
  stepIcon: {
    fontSize:    'clamp(2.5rem, 10vw, 3.5rem)',
    lineHeight:  1,
    textAlign:   'center',
  },
  stepTitle: {
    color:      '#fff',
    fontSize:   'clamp(1.3rem, 5vw, 1.8rem)',
    fontWeight: 700,
    margin:     0,
    textAlign:  'center',
  },
  stepSub: {
    color:     'rgba(255,255,255,0.45)',
    fontSize:  'clamp(0.8rem, 3vw, 0.95rem)',
    margin:    0,
    textAlign: 'center',
  },
  dateInput: {
    width:         '100%',
    padding:       'clamp(0.75rem, 3vw, 1rem) 1rem',
    borderRadius:  '0.75rem',
    border:        '2px solid rgba(255,255,255,0.1)',
    background:    'rgba(255,255,255,0.05)',
    color:         '#fff',
    fontSize:      'clamp(0.9rem, 3.5vw, 1rem)',
    outline:       'none',
    textAlign:     'center',
    cursor:        'pointer',
    boxSizing:     'border-box',
  },
  choiceRow: {
    display:   'flex',
    gap:       '1rem',
    width:     '100%',
    marginTop: '0.5rem',
  },
  navRow: {
    display:       'flex',
    alignItems:    'center',
    gap:           '0.75rem',
    justifyContent:'space-between',
  },
  nextBtn: {
    flex:          1,
    padding:       'clamp(0.75rem, 3vw, 1rem)',
    borderRadius:  '0.75rem',
    border:        'none',
    background:    'linear-gradient(135deg, #00d4ff, #a855f7)',
    color:         '#fff',
    fontWeight:    700,
    fontSize:      'clamp(0.9rem, 3vw, 1rem)',
    transition:    'opacity 0.2s, transform 0.1s',
  },
  backBtn: {
    padding:      'clamp(0.75rem, 3vw, 1rem) 1rem',
    borderRadius: '0.75rem',
    border:       '1px solid rgba(255,255,255,0.1)',
    background:   'transparent',
    color:        'rgba(255,255,255,0.5)',
    cursor:       'pointer',
    fontSize:     'clamp(0.8rem, 3vw, 0.9rem)',
  },
  skipBtn: {
    padding:    '0.5rem 1rem',
    background: 'transparent',
    border:     'none',
    color:      'rgba(255,255,255,0.35)',
    cursor:     'pointer',
    fontSize:   '0.8rem',
    textDecoration: 'underline',
  },
};
