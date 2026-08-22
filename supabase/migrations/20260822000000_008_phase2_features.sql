/*
# Migration 008: Phase 2 — New Features
# =======================================
# 1. public.notifications        — in-app notification system
# 2. mark_notifications_read()   — RPC to mark all as read
# 3. get_unread_count()          — RPC to get unread count
# 4. followers_count / following_count / streams_count / coins_earned on profiles
# 5. update_follow_counts()      — trigger to auto-update counters + notify
*/

-- ── 1. notifications table ──
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('gift','follow','match','message','system','like')),
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB DEFAULT '{}',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications read own" ON public.notifications;
CREATE POLICY "notifications read own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications update own" ON public.notifications;
CREATE POLICY "notifications update own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;

-- ── 2. mark_notifications_read() ──
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE notifications SET is_read = true WHERE user_id = p_user_id AND is_read = false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID) TO authenticated;

-- ── 3. get_unread_count() ──
CREATE OR REPLACE FUNCTION public.get_unread_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COUNT(*) INTO v_count FROM notifications WHERE user_id = p_user_id AND is_read = false;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_unread_count(UUID) TO authenticated;

-- ── 4. Profile counters ──
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS streams_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS coins_earned    INTEGER NOT NULL DEFAULT 0;

-- Backfill
UPDATE app_private.profiles p
  SET followers_count = (SELECT COUNT(*) FROM public.follows WHERE following_id = p.id);
UPDATE app_private.profiles p
  SET following_count = (SELECT COUNT(*) FROM public.follows WHERE follower_id = p.id);
UPDATE app_private.profiles p
  SET streams_count = (SELECT COUNT(*) FROM public.live_streams WHERE user_id = p.id);

-- ── 5. update_follow_counts trigger ──
CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE app_private.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE app_private.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    INSERT INTO public.notifications (user_id, type, title, data)
    VALUES (NEW.following_id, 'follow', 'متابع جديد', jsonb_build_object('follower_id', NEW.follower_id));
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE app_private.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    UPDATE app_private.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_follow_counts ON public.follows;
CREATE TRIGGER trg_update_follow_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();

-- ── Recreate public.profiles view with new columns ──
DROP VIEW IF EXISTS public.profiles CASCADE;
CREATE VIEW public.profiles AS
  SELECT id, username, full_name, gender, birthdate, looking_for, avatar_url,
         hide_online, show_in_radar, followers_count, following_count,
         streams_count, coins_earned, created_at
  FROM app_private.profiles;
