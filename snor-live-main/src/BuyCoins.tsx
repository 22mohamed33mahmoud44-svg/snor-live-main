import { useState } from "react";
import { supabase } from "./supabase";

const PACKAGES = [
  { id: "pkg_100", coins: 100, price: 10, label: "Starter", emoji: "⚡", color: "#6366f1", popular: false },
  { id: "pkg_500", coins: 500, price: 45, label: "Popular", emoji: "🔥", color: "#f59e0b", popular: true },
  { id: "pkg_1000", coins: 1000, price: 80, label: "Best Value", emoji: "👑", color: "#10b981", popular: false },
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
    if (paymentMethod === "wallet" && !phone) { setErrorMsg("أدخل رقم المحفظة"); return; }
    setStep("loading"); setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-paymob-payment", {
        body: { packageId: selectedPkg, paymentMethod, phone },
      });
      if (error) throw error;
      if (data.type === "wallet" && data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.type === "card" && data.iframe_url) {
        setIframeUrl(data.iframe_url); setStep("payment");
      } else throw new Error("فشل في إنشاء الدفع");
    } catch (err: any) {
      setErrorMsg(err.message ?? "حدث خطأ"); setStep("error");
    }
  };

  const pkg = PACKAGES.find(p => p.id === selectedPkg);

  if (step === "payment" && iframeUrl) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#0f0f1a" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, padding:"12px 16px", borderBottom:"1px solid #2a2a3e" }}>
          <button onClick={() => setStep("select")} style={{ background:"none", border:"none", color:"#aaa", fontSize:14, cursor:"pointer" }}>← رجوع</button>
          <span style={{ color:"#fff", fontWeight:600, fontFamily:"Cairo, sans-serif" }}>أكمل الدفع</span>
        </div>
        <iframe src={iframeUrl} style={{ flex:1, border:"none", width:"100%" }} title="Paymob Payment" />
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", color:"#fff", padding:"24px 16px", fontFamily:"Cairo, sans-serif", direction:"rtl", position:"relative" }}>
        {onClose && (
  <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"#aaa", fontSize:24, cursor:"pointer" }}>×</button>
)}
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:48 }}>🪙</div>
        <h1 style={{ fontSize:28, fontWeight:700, margin:0 }}>شحن كوينز</h1>
        <p style={{ color:"#888", marginTop:6 }}>اختار الباقة المناسبة ليك</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:16, maxWidth:520, margin:"0 auto 32px" }}>
        {PACKAGES.map(p => (
          <div key={p.id} onClick={() => setSelectedPkg(p.id)} style={{
            border:`2px solid ${selectedPkg === p.id ? p.color : "#2a2a3e"}`,
            borderRadius:16, padding:"20px 12px", textAlign:"center", cursor:"pointer", position:"relative",
            background: selectedPkg === p.id ? `linear-gradient(135deg, ${p.color}22, ${p.color}11)` : "#1a1a2e",
            transform: selectedPkg === p.id ? "scale(1.03)" : "scale(1)", transition:"all 0.2s",
          }}>
            {p.popular && <div style={{ position:"absolute", top:-10, right:"50%", transform:"translateX(50%)", padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:"#fff", background:p.color, whiteSpace:"nowrap" }}>الأكثر طلباً</div>}
            <div style={{ fontSize:32, marginBottom:8 }}>{p.emoji}</div>
            <div style={{ fontSize:32, fontWeight:800, color:p.color }}>{p.coins.toLocaleString()}</div>
            <div style={{ fontSize:13, color:"#aaa", marginBottom:8 }}>كوينز</div>
            <div style={{ fontSize:20, fontWeight:700 }}>{p.price} جنيه</div>
          </div>
        ))}
      </div>

      {selectedPkg && (
        <div style={{ maxWidth:400, margin:"0 auto" }}>
          <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12, color:"#ccc" }}>طريقة الدفع</h3>
          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            {(["card","wallet"] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)} style={{
                flex:1, padding:"12px 8px", border:`2px solid ${paymentMethod === m ? (m==="card"?"#6366f1":"#e53e3e") : "#2a2a3e"}`,
                borderRadius:12, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer",
                background: paymentMethod === m ? (m==="card"?"#6366f1":"#e53e3e") : "#1a1a2e",
                fontFamily:"Cairo, sans-serif", transition:"all 0.2s",
              }}>
                {m === "card" ? "💳 بطاقة بنكية" : "📱 فودافون كاش"}
              </button>
            ))}
          </div>
          {paymentMethod === "wallet" && (
            <input type="tel" placeholder="01xxxxxxxxx" value={phone} onChange={e => setPhone(e.target.value)}
              style={{ width:"100%", padding:"12px 16px", background:"#1a1a2e", border:"2px solid #2a2a3e", borderRadius:12, color:"#fff", fontSize:16, marginBottom:16, boxSizing:"border-box", outline:"none" }}
              maxLength={11} dir="ltr" />
          )}
          {errorMsg && <p style={{ color:"#f87171", fontSize:14, marginBottom:12, textAlign:"center" }}>{errorMsg}</p>}
          <button onClick={handleBuy} disabled={step === "loading"} style={{
            width:"100%", padding:16, background:"linear-gradient(135deg, #6366f1, #8b5cf6)",
            border:"none", borderRadius:14, color:"#fff", fontSize:18, fontWeight:700,
            cursor:"pointer", fontFamily:"Cairo, sans-serif", opacity: step === "loading" ? 0.7 : 1,
          }}>
            {step === "loading" ? "جاري التحميل..." : `ادفع ${pkg?.price} جنيه`}
          </button>
        </div>
      )}
    </div>
  );
}
