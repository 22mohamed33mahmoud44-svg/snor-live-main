import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export function CoinsBalance({ userId }: { userId: string }) {
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;

    supabase
      .from("users_coins")
      .select("coins")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => setCoins(data?.coins ?? 0));

    const channel = supabase
      .channel(`coins:${userId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "users_coins",
        filter: `user_id=eq.${userId}`,
      }, (payload: any) => {
        setCoins(payload.new.coins);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(255,212,0,0.1)",
      border: "1px solid rgba(255,212,0,0.25)",
      borderRadius: 20, padding: "4px 12px", cursor: "pointer",
    }}>
      <span style={{ fontSize: 16 }}>💎</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#FFD700" }}>
        {coins === null ? "..." : coins.toLocaleString()}
      </span>
    </div>
  );
}
