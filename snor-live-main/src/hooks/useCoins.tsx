import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export function useCoins() {
  const [coins, setCoins] = useState<number>(0); // خليناها بتبدأ بـ 0 عشان الـ UI ميبقاش فاضي

  useEffect(() => {
    let channel: any;

    const init = async () => {
      // 1. نجيب الـ User الحالي المسجل دخول
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 2. نجيب الرصيد الحالي من الجدول
      const { data } = await supabase
        .from("users_coins")
        .select("coins")
        .eq("user_id", user.id)
        .maybeSingle(); // أضمن من single عشان لو الحساب لسه جديد ومفيش سطر ليه جواه ميعملش كراش

      if (data) {
        setCoins(data.coins);
      }

      // 3. تشغيل الـ Realtime عشان لو شحن أو صرف الكوينز تتحدث في نفس الثانية بدون ريفريش
      channel = supabase
        .channel(`coins-realtime-${user.id}`)
        .on("postgres_changes", {
          event: "*", // استماع لكل التغييرات (UPDATE أو INSERT) لضمان الأمان
          schema: "public",
          table: "users_coins",
          filter: `user_id=eq.${user.id}`,
        }, (payload: any) => {
          if (payload.new && typeof payload.new.coins === 'number') {
            setCoins(payload.new.coins);
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { coins };
}