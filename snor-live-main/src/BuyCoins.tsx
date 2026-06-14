import { useState } from "react";
import { supabase } from "./supabase";

const PACKAGES = [
  { id: "pkg_100", coins: 100, price: 10, label: "البداية", emoji: "⚡", color: "#6366f1", popular: false },
  { id: "pkg_500", coins: 500, price: 45, label: "الأكثر شعبية", emoji: "🔥", color: "#f59e0b", popular: true },
  { id: "pkg_1000", coins: 1000, price: 80, label: "أفضل قيمة", emoji: "👑", color: "#10b981", popular: false },
];

type Step = "select" | "payment" | "loading" | "error";

export default function BuyCoins({ onClose }: { onClose?: () => void }) {
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [errorMsg, setErrorMsg] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");

  const handleBuy = async () => {
    if (!selectedPkg) return;
    if (paymentMethod === "wallet" && !phone) { 
      setErrorMsg("يرجى إدخال رقم المحفظة الإلكترونية"); 
      return; 
    }
    setStep("loading"); 
    setErrorMsg("");
    
    try {
      const { data, error } = await supabase.functions.invoke("create-paymob-payment", {
        body: { packageId: selectedPkg, paymentMethod, phone },
      });
      
      if (error) throw error;
      
      if (data.type === "wallet" && data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.type === "card" && data.iframe_url) {
        setIframeUrl(data.iframe_url); 
        setStep("payment");
      } else {
        throw new Error("فشل في إنشاء معاملة الدفع الآمنة");
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "حدث خطأ غير متوقع أثناء معالجة الطلب"); 
      setStep("error");
    }
  };

  const pkg = PACKAGES.find(p => p.id === selectedPkg);

  // ── شاشة عرض نافذة الـ Paymob Iframe الآمنة ──
  if (step === "payment" && iframeUrl) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#06060c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "rgba(10,10,20,0.8)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
          <button onClick={() => setStep("select")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 16px", borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>← رجوع</button>
          <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>بوابة الدفع الآمنة من Paymob</span>
        </div>
        <iframe src={iframeUrl} style={{ flex: 1, border: "none", width: "100%" }} title="Paymob Payment" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#05050c", color: "#fff", padding: "32px 16px 120px", fontFamily: "'Cairo', sans-serif", direction: "rtl", position: "relative" }}>
      <style>{STYLES}</style>

      {onClose && (
        <button onClick={onClose} className="bc-close-btn">✕</button>
      )}

      {/* الهيدر الرئيسي */}
      <div style={{ textAlign: "center", marginBottom: 40, marginTop: onClose ? 20 : 0 }}>
        <div style={{ fontSize: 52, filter: "drop-shadow(0 4px 15px rgba(255,215,0,0.3))", animation: "bc-float 3s ease-in-out infinite" }}>🪙</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 0", background: "linear-gradient(135deg,#fff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>متجر الكوينز الرقمي</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", marginTop: 4 }}>اشحن رصيدك فوراً لفتح غرف البث والدردشة المتميزة</p>
      </div>

      {/* شبكة الباقات المطور بتأثير التوهج */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, maxWidth: 540, margin: "0 auto 40px" }}>
        {PACKAGES.map(p => (
          <div key={p.id} onClick={() => setSelectedPkg(p.id)} className={`bc-pkg-card ${selectedPkg === p.id ? 'active' : ''}`} style={{ '--pkg-color': p.color } as React.CSSProperties}>
            {p.popular && <div className="bc-popular-badge">الأكثر طلباً 🔥</div>}
            <div className="bc-pkg-emoji">{p.emoji}</div>
            <div className="bc-pkg-coins">{p.coins.toLocaleString()}</div>
            <div className="bc-pkg-lbl">كوينز</div>
            <div className="bc-pkg-price">{p.price} جنيه</div>
          </div>
        ))}
      </div>

      {/* خيارات الدفع الذكية */}
      {selectedPkg && (
        <div className="bc-form-container">
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 16, color: "rgba(255,255,255,0.7)" }}>اختر وسيلة الدفع المناسبة:</h3>
          
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {(["card", "wallet"] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)} className={`bc-method-btn ${paymentMethod === m ? 'active' : ''} ${m}`}>
                {m === "card" ? "💳 فيزا / ماستر كارد" : "📱 محفظة إلكترونية / كاش"}
              </button>
            ))}
          </div>

          {paymentMethod === "wallet" && (
            <div className="bc-input-group">
              <input type="tel" placeholder="01xxxxxxxxx" value={phone} onChange={e => setPhone(e.target.value)} maxLength={11} dir="ltr" />
              <label>رقم المحفظة (فودافون، اتصالات، أورانج، إي تي أم)</label>
            </div>
          )}

          {errorMsg && <p className="bc-error-text">{errorMsg}</p>}

          <button onClick={handleBuy} className="bc-submit-btn">
            إنشاء فاتورة آمنة بمبلغ {pkg?.price} جنيه
          </button>
        </div>
      )}

      {/* الـ Overlay الفخم أثناء شحن أو تحميل بروتوكول الدفع */}
      {step === "loading" && (
        <div className="bc-loading-overlay">
          <div className="bc-spinner" />
          <span>جاري الاتصال بخوادم الدفع الآمنة...</span>
        </div>
      )}

      {/* شاشة الخطأ المستقلة */}
      {step === "error" && (
        <div className="bc-loading-overlay" style={{ background: "rgba(5,5,10,0.95)" }}>
          <div style={{ fontSize: 44, color: "#ef4444" }}>⚠️</div>
          <h3 style={{ margin: "14px 0 6px", fontWeight: 700 }}>فشلت العملية</h3>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", textAlign: "center", maxWidth: 260 }}>{errorMsg}</p>
          <button onClick={() => setStep("select")} className="bc-err-retry-btn">إعادة المحاولة</button>
        </div>
      )}
    </div>
  );
}

// ── MODERN COMPACT STYLES FOR THE COIN SHOP ──
const STYLES = `
  @keyframes bc-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes bc-spin { to { transform: rotate(360deg); } }
  
  .bc-close-btn { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); width: 36px; height: 36px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .bc-close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

  /* الكروت الزجاجية للباقات */
  .bc-pkg-card { position: relative; border: 1.5px solid rgba(255,255,255,0.06); border-radius: 22px; padding: 24px 14px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
  .bc-pkg-card:hover { transform: translateY(-4px); border-color: var(--pkg-color); background: rgba(255,255,255,0.04); }
  .bc-pkg-card.active { border-color: var(--pkg-color); background: linear-gradient(145deg, rgba(255,255,255,0.04), var(--pkg-color) 12%); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 0 16px -2px var(--pkg-color) 40%; transform: scale(1.02); }

  .bc-popular-badge { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); padding: 3px 12px; border-radius: 20px; font-size: 0.65rem; font-weight: 800; color: #fff; background: var(--pkg-color); white-space: nowrap; box-shadow: 0 4px 10px var(--pkg-color) 40%; }
  .bc-pkg-emoji { font-size: 1.8rem; margin-bottom: 6px; }
  .bc-pkg-coins { font-size: 1.7rem; font-weight: 800; color: var(--pkg-color); line-height: 1.1; }
  .bc-pkg-lbl { font-size: 0.72rem; color: rgba(255,255,255,0.35); margin-bottom: 10px; font-weight: 600; }
  .bc-pkg-price { font-size: 1.05rem; font-weight: 700; color: #fff; }

  /* حاويات وخيارات النماذج */
  .bc-form-container { max-width: 420px; margin: 0 auto; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 24px; backdrop-filter: blur(20px); animation: bc-slide-up 0.3s ease; }
  @keyframes bc-slide-up { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

  .bc-method-btn { flex: 1; padding: 12px 10px; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 14px; color: rgba(255,255,255,0.6); font-size: 0.8rem; font-weight: 700; cursor: pointer; background: rgba(255,255,255,0.02); font-family: 'Cairo', sans-serif; transition: all 0.2s; }
  .bc-method-btn.active.card { background: #6366f1; border-color: #6366f1; color: #fff; box-shadow: 0 6px 16px rgba(99,102,241,0.35); }
  .bc-method-btn.active.wallet { background: #10b981; border-color: #10b981; color: #fff; box-shadow: 0 6px 16px rgba(16,185,129,0.35); }

  /* حقول مدخلات الأرقام المتطورة */
  .bc-input-group { position: relative; margin-bottom: 20px; }
  .bc-input-group input { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1.5px solid rgba(255,255,255,0.08); border-radius: 14px; color: #fff; font-size: 1.1rem; box-sizing: border-box; outline: none; letter-spacing: 2px; transition: border-color 0.2s; }
  .bc-input-group input:focus { border-color: #6366f1; }
  .bc-input-group label { position: absolute; top: -8px; right: 12px; background: #05050c; padding: 0 6px; font-size: 0.68rem; color: rgba(255,255,255,0.4); font-weight: 600; }

  .bc-error-text { color: #f87171; font-size: 0.8rem; marginBottom: 14px; text-align: center; font-weight: 600; }
  
  .bc-submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 16px; color: #fff; font-size: 1rem; font-weight: 700; cursor: pointer; font-family: 'Cairo', sans-serif; transition: all 0.2s; box-shadow: 0 6px 20px rgba(99,102,241,0.3); }
  .bc-submit-btn:active { transform: scale(0.97); }

  /* أوفيرلاي شاشات الانتظار الفاخرة */
  .bc-loading-overlay { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5,5,10,0.85); backdrop-filter: blur(12px); border-radius: inherit; }
  .bc-loading-overlay span { font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 600; margin-top: 16px; }
  .bc-spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: bc-spin 0.8s linear infinite; }
  
  .bc-err-retry-btn { margin-top: 24px; padding: 10px 24px; border: none; border-radius: 12px; background: rgba(255,255,255,0.08); color: #fff; font-weight: 600; cursor: pointer; font-family: 'Cairo', sans-serif; }
`;