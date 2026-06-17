import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const PACKAGES = [
  { id: "pkg_100", coins: 100, price: 10, label: "البداية", emoji: "⚡", color: "#6366f1", popular: false },
  { id: "pkg_500", coins: 500, price: 45, label: "الأكثر شعبية", emoji: "🔥", color: "#f59e0b", popular: true },
  { id: "pkg_1000", coins: 1000, price: 80, label: "أفضل قيمة", emoji: "👑", color: "#10b981", popular: false },
];

type Step = "select" | "loading" | "error";

// ✅ دالة مساعدة تنتظر الـ script يتحمل
function loadXsollaScript(): Promise<void> {
  return new Promise((resolve) => {
    const scriptId = "xsolla-widget-script";
    if ((window as any).XPayStationWidget) {
      resolve();
      return;
    }
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.type = "text/javascript";
      script.async = true;
      script.src = "https://cdn.xsolla.net/payments-bucket-prod/embed/1.5.0/widget.min.js";
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
  });
}

export default function BuyCoins({ onClose }: { onClose?: () => void }) {
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    loadXsollaScript();
  }, []);

  const handleBuy = async () => {
    if (!selectedPkg) return;

    setStep("loading");
    setErrorMsg("");

    try {
      // 1. جيب التوكن من السيرفر
      const { data, error } = await supabase.functions.invoke("create-xsolla-payment", {
        body: { packageId: selectedPkg },
      });

      if (error) throw error;
      if (!data?.token) throw new Error("لم يتم استلام توكن الدفع من الخادم");

      // 2. انتظر الـ script يتحمل
      await loadXsollaScript();

      const XPayStationWidget = (window as any).XPayStationWidget;

      if (XPayStationWidget) {
        // ✅ افتح الـ widget كـ popup فوق الصفحة
        XPayStationWidget.init({
          access_token: data.token,
          sandbox: true,
        });
        setStep("select");
        XPayStationWidget.open();
      } else {
        // خطة بديلة لو الـ widget مش شغال
        window.open(
          `https://sandbox-secure.xsolla.com/paystation4/?token=${data.token}`,
          "_blank",
          "width=820,height=720"
        );
        setStep("select");
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "حدث خطأ غير متوقع أثناء معالجة الطلب");
      setStep("error");
    }
  };

  const pkg = PACKAGES.find(p => p.id === selectedPkg);

  return (
    <div style={{ minHeight: "100dvh", background: "#05050c", color: "#fff", padding: "32px 16px 120px", fontFamily: "'Cairo', sans-serif", direction: "rtl", position: "relative" }}>
      <style>{STYLES}</style>

      {onClose && (
        <button onClick={onClose} className="bc-close-btn">✕</button>
      )}

      <div style={{ textAlign: "center", marginBottom: 40, marginTop: onClose ? 20 : 0 }}>
        <div style={{ fontSize: 52, filter: "drop-shadow(0 4px 15px rgba(255,215,0,0.3))", animation: "bc-float 3s ease-in-out infinite" }}>🪙</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 0", background: "linear-gradient(135deg,#fff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>متجر الكوينز الرقمي</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", marginTop: 4 }}>اشحن رصيدك فوراً بدعم المحافظ الإلكترونية المصرية وفوري</p>
      </div>

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

      {selectedPkg && (
        <div className="bc-form-container" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
            لقد اخترت باقة <strong style={{ color: pkg?.color }}>{pkg?.coins} كوينز</strong> بمبلغ {pkg?.price} جنيه مصري.
          </p>
          {errorMsg && <p className="bc-error-text">{errorMsg}</p>}
          <button onClick={handleBuy} className="bc-submit-btn">
            الانتقال لخيارات الدفع الآمنة 🚀
          </button>
        </div>
      )}

      {step === "loading" && (
        <div className="bc-loading-overlay">
          <div className="bc-spinner" />
          <span>جاري تحضير واجهة الدفع من Xsolla...</span>
        </div>
      )}

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

const STYLES = `
  @keyframes bc-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes bc-spin { to { transform: rotate(360deg); } }
  .bc-close-btn { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); width: 36px; height: 36px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .bc-close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .bc-pkg-card { position: relative; border: 1.5px solid rgba(255,255,255,0.06); border-radius: 22px; padding: 24px 14px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
  .bc-pkg-card:hover { transform: translateY(-4px); border-color: var(--pkg-color); background: rgba(255,255,255,0.04); }
  .bc-pkg-card.active { border-color: var(--pkg-color); background: linear-gradient(145deg, rgba(255,255,255,0.04), var(--pkg-color) 12%); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); transform: scale(1.02); }
  .bc-popular-badge { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); padding: 3px 12px; border-radius: 20px; font-size: 0.65rem; font-weight: 800; color: #fff; background: var(--pkg-color); white-space: nowrap; }
  .bc-pkg-emoji { font-size: 1.8rem; margin-bottom: 6px; }
  .bc-pkg-coins { font-size: 1.7rem; font-weight: 800; color: var(--pkg-color); line-height: 1.1; }
  .bc-pkg-lbl { font-size: 0.72rem; color: rgba(255,255,255,0.35); margin-bottom: 10px; font-weight: 600; }
  .bc-pkg-price { font-size: 1.05rem; font-weight: 700; color: #fff; }
  .bc-form-container { max-width: 420px; margin: 0 auto; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 24px; backdrop-filter: blur(20px); animation: bc-slide-up 0.3s ease; }
  @keyframes bc-slide-up { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
  .bc-error-text { color: #f87171; font-size: 0.8rem; margin-bottom: 14px; text-align: center; font-weight: 600; }
  .bc-submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 16px; color: #fff; font-size: 1rem; font-weight: 700; cursor: pointer; font-family: 'Cairo', sans-serif; transition: all 0.2s; box-shadow: 0 6px 20px rgba(99,102,241,0.3); }
  .bc-submit-btn:active { transform: scale(0.97); }
  .bc-loading-overlay { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5,5,10,0.85); backdrop-filter: blur(12px); border-radius: inherit; }
  .bc-loading-overlay span { font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 600; margin-top: 16px; }
  .bc-spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: bc-spin 0.8s linear infinite; }
  .bc-err-retry-btn { margin-top: 24px; padding: 10px 24px; border: none; border-radius: 12px; background: rgba(255,255,255,0.08); color: #fff; font-weight: 600; cursor: pointer; font-family: 'Cairo', sans-serif; }
`;
