/*
# Migration 013: Phase 7 — Paid Private Shows (Gift-Based Access)
# ================================================================
# المذيع يحدد نوع الهدية المطلوبة للدخول — المشاهد يبعث الهدية ويدخل تلقائياً
#
# New Tables:
#   1. public.paid_shows   — بث خاص مع نوع وعدد الهدايا المطلوبة
#   2. public.show_access  — سجل من حصل على access
#
# New RPCs:
#   1. create_paid_show()      — المذيع ينشئ بث خاص
#   2. request_show_access()   — المشاهد يبعت الهدية ويحصل على access
#   3. check_show_access()     — التحقق هل المشاهد مسموح له بالدخول
#   4. get_show_requirements() — جلب متطلبات البث الخاص
#   5. end_paid_show()         — المذيع ينهي البث الخاص
*/

-- ── 1. paid_shows ──
CREATE TABLE IF NOT EXISTS public.paid_shows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id           UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  streamer_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  required_gift_type  TEXT NOT NULL,
  required_gift_count INTEGER NOT NULL DEFAULT 1 CHECK (required_gift_count >= 1),
  title               TEXT,
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  max_viewers         INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  CONSTRAINT unique_active_show_per_stream UNIQUE (stream_id, is_active)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_paid_shows_stream   ON public.paid_shows(stream_id, is_active);
CREATE INDEX IF NOT EXISTS idx_paid_shows_streamer ON public.paid_shows(streamer_id, is_active);
ALTER TABLE public.paid_shows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paid_shows read all"   ON public.paid_shows;
CREATE POLICY "paid_shows read all"   ON public.paid_shows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "paid_shows insert own" ON public.paid_shows;
CREATE POLICY "paid_shows insert own" ON public.paid_shows FOR INSERT TO authenticated WITH CHECK (auth.uid() = streamer_id);
DROP POLICY IF EXISTS "paid_shows update own" ON public.paid_shows;
CREATE POLICY "paid_shows update own" ON public.paid_shows FOR UPDATE TO authenticated USING (auth.uid() = streamer_id);
REVOKE DELETE ON public.paid_shows FROM anon, authenticated;

-- ── 2. show_access ──
CREATE TABLE IF NOT EXISTS public.show_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id    UUID NOT NULL REFERENCES public.paid_shows(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_id    UUID REFERENCES public.gifts(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_show_access UNIQUE (show_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_show_access_show ON public.show_access(show_id);
CREATE INDEX IF NOT EXISTS idx_show_access_user ON public.show_access(user_id);
ALTER TABLE public.show_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "show_access read own" ON public.show_access;
CREATE POLICY "show_access read own" ON public.show_access FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.show_access FROM anon, authenticated;

-- ── 3. create_paid_show() ──
CREATE OR REPLACE FUNCTION public.create_paid_show(
  p_stream_id UUID, p_required_gift_type TEXT,
  p_required_gift_count INTEGER DEFAULT 1,
  p_title TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL, p_max_viewers INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_streamer_id UUID := auth.uid(); v_show_id UUID;
BEGIN
  IF v_streamer_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM live_streams WHERE id = p_stream_id AND user_id = v_streamer_id) THEN
    RETURN jsonb_build_object('success',false,'error','not_your_stream');
  END IF;
  UPDATE paid_shows SET is_active=false, ended_at=NOW() WHERE stream_id=p_stream_id AND is_active=true;
  INSERT INTO paid_shows (stream_id,streamer_id,required_gift_type,required_gift_count,title,description,max_viewers)
  VALUES (p_stream_id,v_streamer_id,p_required_gift_type,p_required_gift_count,p_title,p_description,p_max_viewers)
  RETURNING id INTO v_show_id;
  RETURN jsonb_build_object('success',true,'show_id',v_show_id,
    'required_gift_type',p_required_gift_type,'required_gift_count',p_required_gift_count);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_paid_show(UUID,TEXT,INTEGER,TEXT,TEXT,INTEGER) TO authenticated;

-- ── 4. request_show_access() ──
CREATE OR REPLACE FUNCTION public.request_show_access(p_show_id UUID, p_gift_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_viewer_id UUID := auth.uid(); v_show paid_shows%ROWTYPE;
  v_gift_id UUID; v_result JSONB; v_gift_cost INTEGER;
BEGIN
  IF v_viewer_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_show FROM paid_shows WHERE id=p_show_id AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','show_not_found_or_ended'); END IF;
  IF v_viewer_id = v_show.streamer_id THEN RETURN jsonb_build_object('success',false,'error','streamer_has_access'); END IF;
  IF p_gift_type <> v_show.required_gift_type THEN
    RETURN jsonb_build_object('success',false,'error','wrong_gift_type','required',v_show.required_gift_type);
  END IF;
  IF EXISTS (SELECT 1 FROM show_access WHERE show_id=p_show_id AND user_id=v_viewer_id) THEN
    RETURN jsonb_build_object('success',false,'error','already_have_access');
  END IF;
  IF v_show.max_viewers IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM show_access WHERE show_id=p_show_id) >= v_show.max_viewers THEN
      RETURN jsonb_build_object('success',false,'error','show_full');
    END IF;
  END IF;
  v_gift_cost := CASE p_gift_type
    WHEN 'rose' THEN 10 WHEN 'heart' THEN 25 WHEN 'diamond' THEN 100
    WHEN 'car' THEN 500 WHEN 'yacht' THEN 1000 WHEN 'castle' THEN 2000 ELSE 50
  END * v_show.required_gift_count;
  v_result := send_gift(v_viewer_id, v_show.streamer_id, p_gift_type, v_gift_cost);
  IF NOT (v_result->>'success')::boolean THEN RETURN v_result; END IF;
  SELECT id INTO v_gift_id FROM gifts WHERE sender_id=v_viewer_id AND receiver_id=v_show.streamer_id ORDER BY created_at DESC LIMIT 1;
  INSERT INTO show_access (show_id,user_id,gift_id) VALUES (p_show_id,v_viewer_id,v_gift_id);
  INSERT INTO notifications (user_id,type,title,data) VALUES (
    v_show.streamer_id,'gift','🎭 مشاهد جديد دخل البث الخاص!',
    jsonb_build_object('viewer_id',v_viewer_id,'gift_type',p_gift_type,'show_id',p_show_id));
  RETURN jsonb_build_object('success',true,'access_granted',true,'show_id',p_show_id,'gift_type',p_gift_type);
END; $$;
GRANT EXECUTE ON FUNCTION public.request_show_access(UUID,TEXT) TO authenticated;

-- ── 5. check_show_access() ──
CREATE OR REPLACE FUNCTION public.check_show_access(p_show_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM show_access WHERE show_id=p_show_id AND user_id=auth.uid())
      OR EXISTS(SELECT 1 FROM paid_shows WHERE id=p_show_id AND streamer_id=auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.check_show_access(UUID) TO authenticated;

-- ── 6. get_show_requirements() ──
CREATE OR REPLACE FUNCTION public.get_show_requirements(p_stream_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_show paid_shows%ROWTYPE;
BEGIN
  SELECT * INTO v_show FROM paid_shows WHERE stream_id=p_stream_id AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('has_paid_show',false); END IF;
  RETURN jsonb_build_object('has_paid_show',true,'show_id',v_show.id,
    'required_gift_type',v_show.required_gift_type,'required_gift_count',v_show.required_gift_count,
    'title',v_show.title,'description',v_show.description,'max_viewers',v_show.max_viewers,
    'current_viewers',(SELECT COUNT(*) FROM show_access WHERE show_id=v_show.id),
    'viewer_has_access',(SELECT EXISTS(SELECT 1 FROM show_access WHERE show_id=v_show.id AND user_id=auth.uid())));
END; $$;
GRANT EXECUTE ON FUNCTION public.get_show_requirements(UUID) TO authenticated;

-- ── 7. end_paid_show() ──
CREATE OR REPLACE FUNCTION public.end_paid_show(p_show_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_viewers BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COUNT(*) INTO v_total_viewers FROM show_access WHERE show_id=p_show_id;
  UPDATE paid_shows SET is_active=false, ended_at=NOW() WHERE id=p_show_id AND streamer_id=auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','not_found_or_unauthorized'); END IF;
  RETURN jsonb_build_object('success',true,'total_viewers',v_total_viewers,'ended_at',NOW());
END; $$;
GRANT EXECUTE ON FUNCTION public.end_paid_show(UUID) TO authenticated;
