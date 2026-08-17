-- Usage allowances, second cut: new per-tier numbers and a calendar week.
--
-- Two changes, both of which have to happen in the database rather than
-- only in TypeScript, for the same reason as the first cut: the app writes
-- through the caller's own key under RLS, so a limit checked only in the
-- app can be stepped around by posting straight to PostgREST.
--
--   1. The allowances themselves moved.
--   2. The weekly window was seven days measured from each account's first
--      prompt of its week. It is now the calendar week, resetting Monday
--      00:00 UTC — the same instant for everybody.
--
-- Both windows are pinned to UTC explicitly. current_date follows the
-- database's own TimeZone setting, which is UTC on Supabase today but is a
-- server-level knob, and a limit that silently shifts by a few hours if
-- that is ever changed is worse than a verbose expression here.

-- ── The allowances ──────────────────────────────────────────────────────
-- NULL means unlimited. Mirrors TIER_LIMITS in src/lib/usage-limits.ts;
-- keep the two in step, and treat this copy as the one that decides.
--
--                  tokens/day  tokens/week  images/day
--   free                   10           40           0
--   go                     25          100           3
--   pro                    50          400           8
--   exclusive        unlimited    unlimited   unlimited
CREATE OR REPLACE FUNCTION public.usage_limit(_tier public.account_tier)
RETURNS TABLE (tokens_day numeric, tokens_week numeric, images_day integer)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT t.tokens_day, t.tokens_week, t.images_day FROM (VALUES
    ('free'::public.account_tier,      10::numeric,  40::numeric,  0),
    ('go'::public.account_tier,        25::numeric, 100::numeric,  3),
    ('pro'::public.account_tier,       50::numeric, 400::numeric,  8),
    ('exclusive'::public.account_tier, NULL::numeric, NULL::numeric, NULL::integer)
  ) AS t(tier, tokens_day, tokens_week, images_day)
  WHERE t.tier = _tier;
$$;

-- ── Window helpers ──────────────────────────────────────────────────────
-- One definition each, so the reader and the writer can never disagree
-- about which day or which week a row belongs to.

CREATE OR REPLACE FUNCTION public.usage_day()
RETURNS date
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'UTC')::date $$;

-- date_trunc('week', ...) starts on Monday in Postgres, which is what the
-- spec asks for. Returned as timestamptz so it compares directly against
-- the stored week_started_at.
CREATE OR REPLACE FUNCTION public.usage_week()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
$$;

COMMENT ON FUNCTION public.usage_week() IS
  'Start of the current calendar week, Monday 00:00 UTC. The weekly usage allowance resets when this value changes.';

-- ── Reading your own balance ────────────────────────────────────────────
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

  -- Rolled on read as well as on write: a ledger row from yesterday should
  -- read as a full balance, not as yesterday's spend.
  RETURN QUERY SELECT
    CASE WHEN q.day_date = public.usage_day() THEN q.day_tokens ELSE 0 END,
    lim.tokens_day,
    CASE WHEN q.week_started_at = public.usage_week() THEN q.week_tokens ELSE 0 END,
    lim.tokens_week,
    CASE WHEN q.day_date = public.usage_day() THEN q.day_images ELSE 0 END,
    lim.images_day;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_usage() TO authenticated;

-- ── Spending ────────────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'One image per response.';
  END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  SELECT * INTO lim FROM public.usage_limit(COALESCE(v_tier, 'free'));

  INSERT INTO public.usage_quota (user_id) VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;
  -- FOR UPDATE: check and debit under a row lock, so two messages sent at
  -- the same instant cannot both read "1 left" and both spend it.
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid FOR UPDATE;

  -- Roll the windows before spending against them.
  IF q.day_date = public.usage_day() THEN
    d_date := q.day_date; d_tok := q.day_tokens; d_img := q.day_images;
  ELSE
    d_date := public.usage_day(); d_tok := 0; d_img := 0;
  END IF;

  IF q.week_started_at = public.usage_week() THEN
    w_at := q.week_started_at; w_tok := q.week_tokens;
  ELSE
    w_at := public.usage_week(); w_tok := 0;
  END IF;

  n_day := d_tok + _cost;
  n_week := w_tok + _cost;
  n_img := d_img + _images;

  -- Refuse before writing anything. The caller is told which limit stopped
  -- it and what the balance was, so the message can name the reset.
  IF lim.images_day IS NOT NULL AND n_img > lim.images_day THEN
    RETURN QUERY SELECT false,
      CASE WHEN lim.images_day = 0
        THEN 'Images are not part of your plan.'
        ELSE format('You have used all %s of today''s images.', lim.images_day)
      END,
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
      'You have used all of this week''s usage tokens. They reset on Monday at midnight UTC.',
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

-- Existing rows carry a week_started_at from the old rolling scheme, which
-- will never equal a Monday boundary, so the first charge of each account
-- would roll its week to zero anyway. Doing it here instead makes that
-- explicit rather than a side effect nobody expected.
UPDATE public.usage_quota
   SET week_started_at = public.usage_week(),
       week_tokens = 0
 WHERE week_started_at IS DISTINCT FROM public.usage_week();

-- The ledger itself stays off limits: the two functions above are the only
-- way to read a rolled balance or to move one.
REVOKE ALL ON public.usage_quota FROM anon, authenticated;
