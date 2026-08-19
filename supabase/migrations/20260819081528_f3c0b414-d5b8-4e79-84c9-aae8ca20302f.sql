-- Per-tier image allowances
CREATE OR REPLACE FUNCTION public.usage_limit(_tier account_tier)
 RETURNS TABLE(tokens_day numeric, tokens_week numeric, images_day integer)
 LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $function$
  SELECT t.tokens_day, t.tokens_week, t.images_day FROM (VALUES
    ('free'::public.account_tier,      10::numeric,  40::numeric,  5),
    ('go'::public.account_tier,        25::numeric, 100::numeric,  20),
    ('pro'::public.account_tier,       50::numeric, 400::numeric,  NULL::integer),
    ('exclusive'::public.account_tier, NULL::numeric, NULL::numeric, NULL::integer)
  ) AS t(tier, tokens_day, tokens_week, images_day)
  WHERE t.tier = _tier;
$function$;

-- Images allowed in a single prompt
CREATE OR REPLACE FUNCTION public.images_per_prompt(_tier account_tier)
 RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $function$
  SELECT CASE _tier WHEN 'free' THEN 1 WHEN 'go' THEN 2 ELSE 3 END;
$function$;
REVOKE ALL ON FUNCTION public.images_per_prompt(account_tier) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.images_per_prompt(account_tier) TO authenticated, service_role;

-- Free tier: one Pro Lite message a day
ALTER TABLE public.usage_quota
  ADD COLUMN IF NOT EXISTS day_pro_lite integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pro_lite_per_day(_tier account_tier)
 RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $function$
  SELECT CASE _tier WHEN 'free' THEN 1 ELSE NULL::integer END;
$function$;
REVOKE ALL ON FUNCTION public.pro_lite_per_day(account_tier) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pro_lite_per_day(account_tier) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.charge_pro_lite()
 RETURNS TABLE(ok boolean, used integer, allowance integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  lim integer;
  q public.usage_quota%ROWTYPE;
  cur integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  lim := public.pro_lite_per_day(COALESCE(v_tier, 'free'));
  IF lim IS NULL THEN
    RETURN QUERY SELECT true, 0, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.usage_quota (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid FOR UPDATE;
  cur := CASE WHEN q.day_date = public.usage_day() THEN q.day_pro_lite ELSE 0 END;

  IF cur + 1 > lim THEN
    RETURN QUERY SELECT false, cur, lim;
    RETURN;
  END IF;

  UPDATE public.usage_quota
     SET day_date = public.usage_day(),
         day_tokens = CASE WHEN day_date = public.usage_day() THEN day_tokens ELSE 0 END,
         day_images = CASE WHEN day_date = public.usage_day() THEN day_images ELSE 0 END,
         day_pro_lite = cur + 1,
         updated_at = now()
   WHERE user_id = uid;

  RETURN QUERY SELECT true, cur + 1, lim;
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_pro_lite() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_pro_lite() TO authenticated, service_role;

-- charge_usage: per-tier per-prompt image cap
CREATE OR REPLACE FUNCTION public.charge_usage(_cost numeric, _images integer DEFAULT 0)
 RETURNS TABLE(ok boolean, reason text, day_used numeric, day_limit numeric, week_used numeric, week_limit numeric, images_used integer, images_limit integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  lim record;
  per_prompt integer;
  q public.usage_quota%ROWTYPE;
  d_date date; d_tok numeric; d_img integer;
  w_at timestamptz; w_tok numeric;
  n_day numeric; n_week numeric; n_img integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN RAISE EXCEPTION 'Invalid charge.'; END IF;
  IF _images IS NULL OR _images < 0 THEN RAISE EXCEPTION 'Invalid image count.'; END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  SELECT * INTO lim FROM public.usage_limit(COALESCE(v_tier, 'free'));
  per_prompt := public.images_per_prompt(COALESCE(v_tier, 'free'));
  IF _images > per_prompt THEN
    RAISE EXCEPTION 'Your plan allows % image(s) per prompt.', per_prompt;
  END IF;

  INSERT INTO public.usage_quota (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid FOR UPDATE;

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
     SET day_date = d_date, day_tokens = n_day, day_images = n_img,
         day_pro_lite = CASE WHEN q.day_date = public.usage_day() THEN q.day_pro_lite ELSE 0 END,
         week_started_at = w_at, week_tokens = n_week, updated_at = now()
   WHERE user_id = uid;

  RETURN QUERY SELECT true, NULL::text,
    n_day, lim.tokens_day, n_week, lim.tokens_week, n_img, lim.images_day;
END;
$function$;

-- refund_usage: allow refunding up to the per-prompt cap
CREATE OR REPLACE FUNCTION public.refund_usage(_cost numeric, _images integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN RAISE EXCEPTION 'Invalid refund.'; END IF;
  IF _images IS NULL OR _images < 0 OR _images > 3 THEN RAISE EXCEPTION 'Invalid refund.'; END IF;

  UPDATE public.usage_quota
     SET day_tokens = GREATEST(0, day_tokens - CASE WHEN day_date = public.usage_day() THEN _cost ELSE 0 END),
         day_images = GREATEST(0, day_images - CASE WHEN day_date = public.usage_day() THEN _images ELSE 0 END),
         week_tokens = GREATEST(0, week_tokens - CASE WHEN week_started_at = public.usage_week() THEN _cost ELSE 0 END),
         updated_at = now()
   WHERE user_id = uid;
END;
$function$;

-- my_usage now reports the Pro Lite daily allowance too
DROP FUNCTION IF EXISTS public.my_usage();
CREATE OR REPLACE FUNCTION public.my_usage()
 RETURNS TABLE(day_used numeric, day_limit numeric, week_used numeric, week_limit numeric, images_used integer, images_limit integer, images_per_prompt integer, pro_lite_used integer, pro_lite_limit integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  lim record;
  q public.usage_quota%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT tier INTO v_tier FROM public.profiles WHERE id = uid;
  SELECT * INTO lim FROM public.usage_limit(COALESCE(v_tier, 'free'));
  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid;

  IF q.user_id IS NULL THEN
    RETURN QUERY SELECT 0::numeric, lim.tokens_day, 0::numeric, lim.tokens_week, 0, lim.images_day,
      public.images_per_prompt(COALESCE(v_tier,'free')), 0, public.pro_lite_per_day(COALESCE(v_tier,'free'));
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN q.day_date = public.usage_day() THEN q.day_tokens ELSE 0 END,
    lim.tokens_day,
    CASE WHEN q.week_started_at = public.usage_week() THEN q.week_tokens ELSE 0 END,
    lim.tokens_week,
    CASE WHEN q.day_date = public.usage_day() THEN q.day_images ELSE 0 END,
    lim.images_day,
    public.images_per_prompt(COALESCE(v_tier,'free')),
    CASE WHEN q.day_date = public.usage_day() THEN q.day_pro_lite ELSE 0 END,
    public.pro_lite_per_day(COALESCE(v_tier,'free'));
END;
$function$;
REVOKE ALL ON FUNCTION public.my_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_usage() TO authenticated, service_role;