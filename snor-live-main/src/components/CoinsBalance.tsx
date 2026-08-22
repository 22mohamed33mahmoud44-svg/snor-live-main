import { useCoins } from "../hooks/useCoins";

export function CoinsBalance() {
  // هنستخدم الـ Hook المطور الجاهز علطول عشان نمنع تكرار الكود والبطء
  const { coins } = useCoins();

  return (
    <div style={{
      display: "flex", 
      alignItems: "center", 
      gap: 6,
      background: "rgba(255, 215, 0, 0.08)", // تفتيح الخلفية الصفراء الدهبية
      border: "1px solid rgba(255, 215, 0, 0.25)",
      borderRadius: 12, // خليناها حواف ناعمة فخمة متناسقة مع التوب بار
      padding: "5px 12px", 
      cursor: "pointer",
      transition: "transform 0.2s"
    }}>
      {/* أيقونة جوهرة هندسية SVG فخمة بدل الإيموجي العادي */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="2">
        <polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/>
      </svg>
      
      <span style={{ 
        fontSize: "0.8rem", 
        fontWeight: 700, 
        color: "#FFD700",
        fontFamily: "'Cairo', sans-serif"
      }}>
        {coins.toLocaleString()}
      </span>
    </div>
  );
}