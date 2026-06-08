import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export function useCoins() {
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Initial fetch
      const { data } = await supabase
        .from("users_coins")
        .select("coins")
        .eq("user_id", user.id)
        .single();

      setCoins(data?.coins ?? 0);

      // Realtime
      const channel = supabase
        .channel(`coins:${user.id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "users_coins",
          filter: `user_id=eq.${user.id}`,
        }, (payload: any) => {
          setCoins(payload.new.coins);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    getUser();
  }, []);

  return { coins };
}
