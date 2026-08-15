-- Usage tokens: the first actual limit on sending messages.
--
-- Until now profiles.pro_messages_used was incremented on every Pro message
-- and read by nothing, and the usage_quota table existed with no code
-- touching it at all. This makes that table the ledger and gives it the
-- only function allowed to move it.
--
-- Enforced here rather than in a server function for the same reason as
-- the track quotas: the app talks to Supabase with the caller's own key
-- under RLS, so a limit checked only in TypeScript can be stepped around by
-- posting straight to PostgREST. charge_usage() is SECURITY DEFINER and the
-- write grants are revoked, so the ledger has exactly one door.

-- ── Ledger shape ────────────────────────────────────────────────────────
--
-- Every step here is guarded, because this runs against a live table whose
-- starting state I could not inspect: the connection used to apply it kept
-- dropping. A migration that fails halfway leaves the ledger in a state
-- nothing understands, so each step checks before it acts and the whole
-- file is safe to run twice.

-- Costs are fractional (a short Lite prompt is 0.75), so the token columns
-- cannot stay integers. Only retype them if they are not already numeric.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usage_quota'
      AND column_name = 'day_tokens' AND data_type <> 'numeric'
  ) THEN
    ALTER TABLE public.usage_quota
      ALTER COLUMN day_tokens TYPE numeric(12, 2) USING day_tokens::numeric;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usage_quota'
      AND column_name = 'week_tokens' AND data_type <> 'numeric'
  ) THEN
    ALTER TABLE public.usage_quota
      ALTER COLUMN week_tokens TYPE numeric(12, 2) USING week_tokens::numeric;
  END IF;
END $$;

-- The weekly window is anchored to each account's first prompt of its week
-- rather than to a fixed calendar boundary, so it needs a timestamp. Added
-- alongside week_start rather than retyping it: that column's type differs
-- between environments and a failed ALTER would take the migration with it.
ALTER TABLE public.usage_quota
  ADD COLUMN IF NOT EXISTS week_started_at timestamptz NOT NULL DEFAULT now();

-- ON CONFLICT (user_id) below needs a unique index, and one cannot be built
-- over duplicates. Keep the newest row per account if any exist — this is a
-- usage counter, so the freshest reading is the right one to survive.
DELETE FROM public.usage_quota a
USING public.usage_quota b
WHERE a.user_id = b.user_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS usage_quota_user_id_key
  ON public.usage_quota (user_id);

-- ── The allowances ──────────────────────────────────────────────────────
-- NULL means unlimited. Mirrors src/lib/usage-limits.ts; keep the two in
-- step, and treat this copy as the one that decides.
CREATE OR REPLACE FUNCTION public.usage_limit(_tier public.account_tier)
RETURNS TABLE (tokens_day numeric, tokens_week numeric, images_day integer)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    ('free'::public.account_tier,      15::numeric,  60::numeric,  2),
    ('go'::public.account_tier,        25::numeric,  80::numeric,  5),
    ('pro'::public.account_tier,       50::numeric, 400::numeric,  8),
    ('exclusive'::public.account_tier, NULL::numeric, NULL::numeric, NULL::integer)
  ) AS t(tier, tokens_day, tokens_week, images_day)
  WHERE t.tier = _tier;
$$;

-- ── Reading your own balance ────────────────────────────────────────────
-- A function rather than a SELECT policy, so the rolled-over windows are
-- what you see: a ledger row from yesterday should read as a full balance,
-- not as yesterday's spend.
CREATE OR REPLACE FUNCTION public.my_usage()
RETURNS TABLE (
  day_used numeric, day_limit numeric,
  week_used numeric, week_limit numeric,
  images_used integer, images_limit integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  lim record;
  q public.usage_quota%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  SELECT * INTO lim FROM public.usage_limit(COALESCE(v_tier, 'free'));
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid;

  IF q.user_id IS NULL THEN
    RETURN QUERY SELECT 0::numeric, lim.tokens_day, 0::numeric, lim.tokens_week, 0, lim.images_day;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN q.day_date = current_date THEN q.day_tokens ELSE 0 END,
    lim.tokens_day,
    CASE WHEN now() - q.week_started_at < interval '7 days' THEN q.week_tokens ELSE 0 END,
    lim.tokens_week,
    CASE WHEN q.day_date = current_date THEN q.day_images ELSE 0 END,
    lim.images_day;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_usage() TO authenticated;

-- ── Spending ────────────────────────────────────────────────────────────
--
-- Check and debit in one statement under a row lock, so two requests sent
-- at once cannot both read "1 left" and both spend it.
CREATE OR REPLACE FUNCTION public.charge_usage(_cost numeric, _images integer DEFAULT 0)
RETURNS TABLE (
  ok boolean, reason text,
  day_used numeric, day_limit numeric,
  week_used numeric, week_limit numeric,
  images_used integer, images_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  lim record;
  q public.usage_quota%ROWTYPE;
  d_date date;
  d_tok numeric;
  d_img integer;
  w_at timestamptz;
  w_tok numeric;
  n_day numeric;
  n_week numeric;
  n_img integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN
    RAISE EXCEPTION 'Invalid charge.';
  END IF;
  IF _images IS NULL OR _images < 0 OR _images > 1 THEN
    RAISE EXCEPTION 'One image per prompt.';
  END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  SELECT * INTO lim FROM public.usage_limit(COALESCE(v_tier, 'free'));

  INSERT INTO public.usage_quota (user_id) VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid FOR UPDATE;

  -- Roll the windows before spending against them.
  IF q.day_date = current_date THEN
    d_date := q.day_date; d_tok := q.day_tokens; d_img := q.day_images;
  ELSE
    d_date := current_date; d_tok := 0; d_img := 0;
  END IF;

  IF now() - q.week_started_at < interval '7 days' THEN
    w_at := q.week_started_at; w_tok := q.week_tokens;
  ELSE
    w_at := now(); w_tok := 0;
  END IF;

  n_day := d_tok + _cost;
  n_week := w_tok + _cost;
  n_img := d_img + _images;

  IF lim.images_day IS NOT NULL AND n_img > lim.images_day THEN
    RETURN QUERY SELECT false,
      format('You have used all %s of today''s images.', lim.images_day),
      d_tok, lim.tokens_day, w_tok, lim.tokens_week, d_img, lim.images_day;
    RETURN;
  END IF;

  IF lim.tokens_day IS NOT NULL AND n_day > lim.tokens_day THEN
    RETURN QUERY SELECT false,
      'You have used all of today''s usage tokens. They reset at midnight UTC.',
      d_tok, lim.tokens_day, w_tok, lim.tokens_week, d_img, lim.images_day;
    RETURN;
  END IF;

  IF lim.tokens_week IS NOT NULL AND n_week > lim.tokens_week THEN
    RETURN QUERY SELECT false,
      'You have used all of this week''s usage tokens.',
      d_tok, lim.tokens_day, w_tok, lim.tokens_week, d_img, lim.images_day;
    RETURN;
  END IF;

  UPDATE public.usage_quota
     SET day_date = d_date,
         day_tokens = n_day,
         day_images = n_img,
         week_started_at = w_at,
         week_tokens = n_week,
         updated_at = now()
   WHERE user_id = uid;

  RETURN QUERY SELECT true, NULL::text,
    n_day, lim.tokens_day, n_week, lim.tokens_week, n_img, lim.images_day;
END;
$function$;

REVOKE ALL ON FUNCTION public.charge_usage(numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_usage(numeric, integer) TO authenticated;

-- The ledger itself is off limits: the two functions above are the only
-- way to read a rolled balance or to move one.
REVOKE ALL ON public.usage_quota FROM anon, authenticated;
