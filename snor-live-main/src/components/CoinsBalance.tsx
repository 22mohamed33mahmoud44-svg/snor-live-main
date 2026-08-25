import { useState, lazy, Suspense } from "react";
import { useCoins } from "../hooks/useCoins";
import { useDailyBonus } from "../hooks/useDailyBonus";

const NotificationsPanel = lazy(() => import("./NotificationsPanel"));
const MissionsPage = lazy(() => import("../pages/MissionsPage"));
const VIPPage = lazy(() => import("../pages/VIPPage"));
const SearchPage = lazy(() => import("../pages/SearchPage"));

export function CoinsBalance() {
  const { coins } = useCoins();
  const { claimBonus, loading: bonusLoading, result: bonusResult } = useDailyBonus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"notifications" | "missions" | "vip" | "search" | null>(null);

  const openPanel = (next: "notifications" | "missions" | "vip" | "search") => {
    setMenuOpen(false);
    setPanel(next);
  };

  const handleBonus = async () => {
    const response = await claimBonus();
    if (response?.error) {
      alert("تعذر استلام مكافأة اليوم. حاول مرة أخرى.");
      return;
    }
    if (response?.data) {
      alert(response.data.message || `تم استلام ${response.data.coins_awarded ?? 0} 🪙`);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="مميزات سنور"
        onClick={() => setMenuOpen(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255, 215, 0, 0.08)",
          border: "1px solid rgba(255, 215, 0, 0.25)",
          borderRadius: 12,
          padding: "5px 12px",
          cursor: "pointer",
          transition: "transform 0.2s",
          color: "inherit"
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="2">
          <polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/>
        </svg>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#FFD700", fontFamily: "'Cairo', sans-serif" }}>
          {coins.toLocaleString()}
        </span>
        <span style={{ color: "#FFD700", fontSize: 10 }}>⌄</span>
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1998 }} />
          <div
            dir="rtl"
            style={{
              position: "fixed",
              top: 68,
              right: 16,
              zIndex: 1999,
              width: 230,
              padding: 10,
              borderRadius: 16,
              background: "#11111d",
              border: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 18px 50px rgba(0,0,0,.45)"
            }}
          >
            <button onClick={() => openPanel("notifications")} style={itemStyle}>🔔 الإشعارات</button>
            <button onClick={() => openPanel("missions")} style={itemStyle}>🎯 المهام اليومية</button>
            <button onClick={() => openPanel("vip")} style={itemStyle}>💎 VIP</button>
            <button onClick={() => openPanel("search")} style={itemStyle}>🔎 البحث</button>
            <button onClick={handleBonus} disabled={bonusLoading} style={itemStyle}>
              🎁 {bonusLoading ? "جاري الاستلام..." : "مكافأة اليوم"}
            </button>
            {bonusResult && (
              <div style={{ color: "#9ca3af", fontSize: 11, padding: "6px 10px", textAlign: "center" }}>
                {bonusResult.message || "تمت معالجة المكافأة"}
              </div>
            )}
          </div>
        </>
      )}

      {panel && (
        <Suspense fallback={null}>
          {panel === "notifications" && <NotificationsPanel onClose={() => setPanel(null)} />}
          {panel === "missions" && <MissionsPage onClose={() => setPanel(null)} />}
          {panel === "vip" && <VIPPage onClose={() => setPanel(null)} />}
          {panel === "search" && <SearchPage onClose={() => setPanel(null)} />}
        </Suspense>
      )}
    </>
  );
}

const itemStyle: React.CSSProperties = {
  width: "100%",
  border: 0,
  background: "transparent",
  color: "#fff",
  textAlign: "right",
  padding: "11px 10px",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "'Cairo', sans-serif",
  fontSize: 13,
  marginBottom: 2
};
