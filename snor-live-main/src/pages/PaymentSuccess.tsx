export default function PaymentSuccess() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100dvh",
      background: "#0f0f0f",
      color: "white",
      fontFamily: "sans-serif"
    }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <h1 style={{ fontSize: 28, marginTop: 16 }}>تم الدفع بنجاح!</h1>
      <p style={{ color: "#aaa", marginTop: 8 }}>تم إضافة الكوينز لحسابك</p>
      <button
        onClick={() => window.location.href = "/"}
        style={{
          marginTop: 24,
          padding: "12px 32px",
          background: "#7c3aed",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          cursor: "pointer"
        }}
      >
        الرجوع للرئيسية
      </button>
    </div>
  );
}
