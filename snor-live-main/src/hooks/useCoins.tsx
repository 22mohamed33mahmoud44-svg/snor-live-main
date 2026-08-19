import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { logError } from "../utils/logError";

export function useCoins() {
  const [coins, setCoins] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const userIdRef = useRef<string | null>(null);

  // إعادة جلب الرصيد يدوياً (مفيدة بعد عمليات الشراء/الصرف)
  const refresh = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    const { data, error } = await supabase
      .from("users_coins")
      .select("coins")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logError("useCoins.refresh", error);
      return;
    }
    if (data && typeof data.coins === "number") {
      setCoins(data.coins);
    }
  }, []);

  useEffect(() => {
    // ✅ M1 fix: علم إلغاء + مرجع للقناة، حتى لو اتعمل unmount أثناء
    // العمليات الـ async لا يتبقى أي اشتراك Realtime معلق (memory leak)
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const teardownChannel = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const init = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (cancelled) return;
      if (userError) logError("useCoins.getUser", userError);
      if (!user) {
        userIdRef.current = null;
        setCoins(0);
        setLoading(false);
        return;
      }
      userIdRef.current = user.id;

      // 1) الاشتراك أولاً، وبعد تأكيد الاشتراك نعيد الجلب مرة أخرى —
      //    هذا يغلق الفجوة الزمنية بين "قراءة الرصيد" و"بدء الاستماع"
      //    التي كانت ممكن تضيع فيها تحديثات
      channel = supabase
        .channel(`coins-realtime-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users_coins",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const next = (payload.new as { coins?: unknown } | null)?.coins;
            if (typeof next === "number") setCoins(next);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            void refresh();
          }
        });

      // لو حصل unmount أثناء انتظار getUser، نظّف القناة اللي لسه متعملة
      if (cancelled) {
        teardownChannel();
        return;
      }

      // 2) جلب الرصيد الأولي
      await refresh();
      if (!cancelled) setLoading(false);
    };

    void init();

    // ✅ M1 fix: متابعة تغيّر حالة تسجيل الدخول — عند الخروج نصفّر
    // الرصيد ونشيل الاشتراك بدل ما يفضل مستمعاً لمستخدم قديم
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        userIdRef.current = null;
        setCoins(0);
        teardownChannel();
      }
    });

    return () => {
      cancelled = true;
      teardownChannel();
      authSubscription.unsubscribe();
    };
  }, [refresh]);

  return { coins, loading, refresh };
}
