import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, Loader2 } from 'lucide-react';

// تعريف بنية الهدية
export interface GiftDef {
  id: string;
  emoji: string;
  name: string;
  cost: number;
}

// مصفوفة الهدايا الثابتة الخاصة بالتطبيق
export const GIFTS: GiftDef[] = [
  { id: 'rose', emoji: '🌹', name: 'وردة', cost: 10 },
  { id: 'heart_box', emoji: '💝', name: 'علبة قلوب', cost: 50 },
  { id: 'crown', emoji: '👑', name: 'تاج', cost: 200 },
  { id: 'diamond', emoji: '💎', name: 'ماسة', cost: 500 },
  { id: 'rocket', emoji: '🚀', name: 'صاروخ', cost: 1000 },
  { id: 'car', emoji: '🏎️', name: 'سيارة فخمة', cost: 5000 },
];

interface LiveGiftsPanelProps {
  showGiftPanel: boolean;
  setShowGiftPanel: (show: boolean) => void;
  gemsBalance: number | null;
  onSendGift: (gift: GiftDef) => Promise<void> | void; // دعم الدوال غير المتزامنة (Async)
}

export default function LiveGiftsPanel({
  showGiftPanel,
  setShowGiftPanel,
  gemsBalance,
  onSendGift,
}: LiveGiftsPanelProps) {
  // حالة جديدة لقفل الأزرار أثناء معالجة الطلب
  const [processingGiftId, setProcessingGiftId] = useState<string | null>(null);

  // تصفير حالة القفل في كل مرة يتم فيها فتح اللوحة لتكون جاهزة
  useEffect(() => {
    if (showGiftPanel) {
      setProcessingGiftId(null);
    }
  }, [showGiftPanel]);

  // دالة التعامل مع الضغط الآمن
  const handleGiftClick = async (gift: GiftDef) => {
    // 1. منع أي ضغطات إضافية إذا كانت هناك عملية جارية بالفعل
    if (processingGiftId !== null) return;

    // 2. تشغيل اهتزاز خفيف للموبايل لتأكيد الضغطة للمستخدم
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }

    // 3. قفل الواجهة على الفور
    setProcessingGiftId(gift.id);

    try {
      // 4. تنفيذ عملية الشراء
      await onSendGift(gift);
    } finally {
      // 5. فك القفل (عادة اللوحة ستُغلق بواسطة المكون الأب، لكن نضعها كإجراء أمان إضافي)
      setTimeout(() => setProcessingGiftId(null), 500);
    }
  };

  return (
    <AnimatePresence>
      {showGiftPanel && (
        <>
          {/* الخلفية المظلمة الشفافة */}
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={() => {
              if (!processingGiftId) setShowGiftPanel(false); // نمنع إغلاق اللوحة أثناء المعالجة لتجنب الأخطاء
            }} 
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} 
          />
          
          {/* لوحة الهدايا المنزلقة من الأسفل */}
          <motion.div 
            initial={{ y: '100%' }} 
            animate={{ y: 0 }} 
            exit={{ y: '100%' }} 
            transition={{ type: 'spring', damping: 25, stiffness: 300 }} 
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 41, background: '#0f0e1c', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '18px 16px', paddingBottom: 'calc(env(safe-area-inset-top) + 18px)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}
          >
            {/* رأس اللوحة */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>الهدايا</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 12px' }}>
                <Gem size={14} style={{ color: '#00d4ff' }} />
                <span style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 800 }}>{gemsBalance ?? '...'}</span>
              </div>
            </div>

            {/* شبكة عرض الهدايا */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {GIFTS.map(gift => {
                const affordable = gemsBalance !== null && gemsBalance >= gift.cost;
                const isProcessingThis = processingGiftId === gift.id;
                // الزر يكون معطلاً إذا لم يكن هناك رصيد، أو إذا كان هناك أي هدية قيد المعالجة
                const isDisabled = !affordable || processingGiftId !== null;

                return (
                  <button 
                    key={gift.id} 
                    onClick={() => handleGiftClick(gift)} 
                    disabled={isDisabled} 
                    style={{ 
                      position: 'relative',
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: 4, 
                      background: isProcessingThis ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)', 
                      border: isProcessingThis ? '1px solid rgba(0,212,255,0.5)' : '1px solid rgba(255,255,255,0.08)', 
                      borderRadius: 14, 
                      padding: '12px 6px', 
                      cursor: isDisabled ? 'default' : 'pointer', 
                      opacity: affordable ? 1 : 0.4,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* إظهار علامة تحميل (Spinner) مكان الإيموجي إذا كانت هذه الهدية قيد الإرسال */}
                    {isProcessingThis ? (
                      <div style={{ height: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 size={24} color="#00d4ff" style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                    ) : (
                      <span style={{ fontSize: '1.8rem' }}>{gift.emoji}</span>
                    )}
                    
                    <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>{gift.name}</span>
                    <span style={{ color: '#00d4ff', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Gem size={10} /> {gift.cost}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
      
      {/* تعريف حركة الدوران للـ Spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </AnimatePresence>
  );
}