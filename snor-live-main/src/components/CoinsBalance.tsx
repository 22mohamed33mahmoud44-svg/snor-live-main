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
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label="مميزات سنور"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255, 215, 0, 0.08)",
          border: "1px solid rgba(255, 215, 0, 0.25)",
          borderRadius: 14,
          padding: "7px 11px 7px 10px",
          cursor: "pointer",
          transition: "all .2s ease",
          color: "inherit",
          boxShadow: menuOpen ? "0 0 0 3px rgba(255,215,0,.08)" : "none"
        }}
      >
        <CoinIcon />
        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#FFD700", fontFamily: "'Cairo', sans-serif", lineHeight: 1 }}>
          {coins.toLocaleString()}
        </span>
        <ChevronIcon open={menuOpen} />
      </button>

      {menuOpen && (
        <>
          <button
            aria-label="إغلاق القائمة"
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1998, background: "transparent", border: 0, cursor: "default" }}
          />

          <div
            dir="rtl"
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              zIndex: 1999,
              width: 250,
              padding: 8,
              borderRadius: 18,
              background: "rgba(15,15,26,.97)",
              border: "1px solid rgba(255,255,255,.09)",
              boxShadow: "0 20px 60px rgba(0,0,0,.52), 0 0 30px rgba(0,212,255,.05)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)"
            }}
          >
            <div style={{ padding: "8px 10px 10px", color: "#777", fontSize: 10, fontWeight: 700, letterSpacing: ".04em" }}>
              مميزات سنور
            </div>

            <MenuItem icon={<BellIcon />} title="الإشعارات" subtitle="عرض التنبيهات الجديدة" onClick={() => openPanel("notifications")} />
            <MenuItem icon={<TargetIcon />} title="المهام اليومية" subtitle="المهام والمكافآت" onClick={() => openPanel("missions")} />
            <MenuItem icon={<VipIcon />} title="VIP" subtitle="الباقات والمزايا" onClick={() => openPanel("vip")} />
            <MenuItem icon={<SearchIcon />} title="البحث" subtitle="الأشخاص والبثوث" onClick={() => openPanel("search")} />

            <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "6px 4px" }} />

            <button
              onClick={handleBonus}
              disabled={bonusLoading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: 0,
                background: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(168,85,247,.08))",
                color: "#fff",
                textAlign: "right",
                padding: "11px 10px",
                borderRadius: 13,
                cursor: bonusLoading ? "wait" : "pointer",
                fontFamily: "'Cairo', sans-serif",
                opacity: bonusLoading ? .7 : 1
              }}
            >
              <span style={iconBoxStyle}><GiftIcon /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{bonusLoading ? "جاري الاستلام..." : "المكافأة اليومية"}</span>
                <span style={{ fontSize: 10, color: "#8d8d9b" }}>احصل على عملاتك اليوم</span>
              </span>
            </button>

            {bonusResult && (
              <div style={{ color: "#8f8fa2", fontSize: 10, padding: "7px 10px 3px", textAlign: "center" }}>
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
    </div>
  );
}

function MenuItem({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: 0,
        background: "transparent",
        color: "#fff",
        textAlign: "right",
        padding: "10px 10px",
        borderRadius: 13,
        cursor: "pointer",
        fontFamily: "'Cairo', sans-serif"
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.055)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={iconBoxStyle}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 10, color: "#7d7d8c" }}>{subtitle}</span>
      </span>
      <ChevronLeftIcon />
    </button>
  );
}

const iconBoxStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 11,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "rgba(0,212,255,.08)",
  border: "1px solid rgba(0,212,255,.10)",
  color: "#00d4ff"
};

function SvgIcon({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function CoinIcon() {
  return <SvgIcon size={15}><polygon points="6 3 18 3 22 9 12 22 2 9 6 3" fill="none" /></SvgIcon>;
}
function ChevronIcon({ open }: { open: boolean }) {
  return <SvgIcon size={14}><polyline points={open ? "6 15 12 9 18 15" : "6 9 12 15 18 9"} /></SvgIcon>;
}
function ChevronLeftIcon() {
  return <SvgIcon size={14}><polyline points="9 6 15 12 9 18" /></SvgIcon>;
}
function BellIcon() {
  return <SvgIcon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></SvgIcon>;
}
function TargetIcon() {
  return <SvgIcon><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2" /></SvgIcon>;
}
function VipIcon() {
  return <SvgIcon><path d="M4 5l3 10h10l3-10-5 4-3-5-3 5-5-4z" /><path d="M7 19h10" /></SvgIcon>;
}
function GiftIcon() {
  return <SvgIcon><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 8v12M3 12h18M7 8c-1.7 0-3-1-3-2.5S5.2 3 6.5 3C9 3 12 8 12 8M17 8c1.7 0 3-1 3-2.5S18.8 3 17.5 3C15 3 12 8 12 8" /></SvgIcon>;
}
function SearchIcon() {
  return <SvgIcon><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></SvgIcon>;
}
