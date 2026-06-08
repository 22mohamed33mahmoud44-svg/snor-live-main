import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────
export interface Match {
  id:         string;
  user1:      string;
  user2:      string;
  status:     string;
  created_at: string;
}

export type MatchResult =
  | { status: 'matched'; match: Match }
  | { status: 'waiting' };

// ── startMatching ─────────────────────────────────────────────────
//
//  بدل ما نعمل SELECT ثم DELETE ثم INSERT في خطوات منفصلة
//  (ده كان بيسبب race condition — شخصين يلاقوا بعض في نفس الوقت
//   وكل واحد يعمل match مع التاني = مباراتين!)
//
//  دلوقتي بنستخدم RPC واحدة بتشتغل جوه transaction مع
//  FOR UPDATE SKIP LOCKED — ده بيضمن إن في أي لحظة
//  مستخدم واحد بس بيعمل match مع كل waiting user.
//
export const startMatching = async (userId: string): Promise<MatchResult> => {
  const { data, error } = await supabase
    .rpc('atomic_match_or_wait', { p_user_id: userId });

  if (error) {
    console.error('startMatching RPC error:', error);
    throw new Error(error.message);
  }

  const result = data as { status: string; match?: Match };

  if (result.status === 'matched' && result.match) {
    return { status: 'matched', match: result.match };
  }

  return { status: 'waiting' };
};

// ── cancelMatching ────────────────────────────────────────────────
//
//  بيشيل المستخدم من قائمة الانتظار بأمان
//
export const cancelMatching = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .rpc('cancel_waiting', { p_user_id: userId });

  if (error) {
    console.error('cancelMatching RPC error:', error);
    // مش fatal — حتى لو فشل، الـ waiting_users row هتتشال
    // بعدين لما المستخدم يقطع الاتصال
  }
};