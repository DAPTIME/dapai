-- Track quotas per plan, publish-after-verify, and a Pro-and-up car editor.
--
-- All three are enforced in the database rather than in server functions,
-- for one reason: the app's own writes go through the caller's key under
-- RLS, so anything a server function checks can also be sent straight to
-- PostgREST with the publishable key. A check that only exists in
-- TypeScript is a suggestion.
--
-- Be honest about the ceiling on verification. The simulation runs in the
-- browser, so a determined person can call the verify RPC with a time they
-- did not drive. This makes verification the only path to publishing and
-- ties it to the owner and to a plausible time; it is not proof of a lap.

-- ── Tier ranking ────────────────────────────────────────────────────────
-- Not the enum's own order: 'go' and 'exclusive' were added to account_tier
-- after 'pro', so 'go' > 'pro' in SQL. Mirrors src/lib/tier-rank.ts.
CREATE OR REPLACE FUNCTION public.tier_rank(_tier public.account_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'free' THEN 0
    WHEN 'go' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'exclusive' THEN 3
    ELSE 0
  END;
$$;

-- ── Verification columns ────────────────────────────────────────────────
ALTER TABLE public.custom_tracks
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_time_ms integer;

COMMENT ON COLUMN public.custom_tracks.verified_at IS
  'Set when the owner finished their own track. Cleared by any edit to the layout, name, season or goal. Publishing requires it.';

-- Existing public tracks keep their status: they were published before this
-- rule existed, and silently unpublishing them would be a surprise.
UPDATE public.custom_tracks
SET verified_at = COALESCE(verified_at, updated_at)
WHERE is_public AND verified_at IS NULL;

-- ── Per-plan track quota ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_quota(_tier public.account_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  -- NULL means unlimited.
  SELECT CASE _tier
    WHEN 'free' THEN 1
    WHEN 'go' THEN 3
    WHEN 'pro' THEN 10
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_track_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier public.account_tier;
  v_quota integer;
  v_count integer;
BEGIN
  SELECT tier INTO v_tier FROM public.profiles WHERE id = NEW.owner_id;
  v_quota := public.track_quota(COALESCE(v_tier, 'free'));
  IF v_quota IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.custom_tracks WHERE owner_id = NEW.owner_id;

  IF v_count >= v_quota THEN
    RAISE EXCEPTION
      'Your plan allows % track(s). Delete one, or upgrade for more.', v_quota
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_track_quota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS custom_tracks_quota ON public.custom_tracks;
CREATE TRIGGER custom_tracks_quota
  BEFORE INSERT ON public.custom_tracks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_track_quota();

-- ── An edit invalidates verification ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_track_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.params IS DISTINCT FROM OLD.params
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.season IS DISTINCT FROM OLD.season
     OR NEW.goal IS DISTINCT FROM OLD.goal THEN
    NEW.verified_at := NULL;
    NEW.verified_time_ms := NULL;
    NEW.is_public := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS custom_tracks_reset_verification ON public.custom_tracks;
CREATE TRIGGER custom_tracks_reset_verification
  BEFORE UPDATE ON public.custom_tracks
  FOR EACH ROW EXECUTE FUNCTION public.reset_track_verification();

-- ── The only two ways to verify and to publish ──────────────────────────
CREATE OR REPLACE FUNCTION public.verify_own_track(_id uuid, _time_ms integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to verify a track.';
  END IF;
  IF _time_ms IS NULL OR _time_ms < 500 OR _time_ms > 600000 THEN
    RAISE EXCEPTION 'That lap time is not plausible.';
  END IF;

  SELECT owner_id INTO v_owner FROM public.custom_tracks WHERE id = _id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Track not found.';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the person who built a track can verify it.';
  END IF;

  UPDATE public.custom_tracks
     SET verified_at = v_now, verified_time_ms = _time_ms
   WHERE id = _id;
  RETURN v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_own_track(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_own_track(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_track_published(_id uuid, _public boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_verified timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT owner_id, verified_at INTO v_owner, v_verified
  FROM public.custom_tracks WHERE id = _id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Track not found.';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not your track.';
  END IF;
  IF _public AND v_verified IS NULL THEN
    RAISE EXCEPTION
      'Drive your track to the finish before publishing it.';
  END IF;

  UPDATE public.custom_tracks SET is_public = _public WHERE id = _id;
  RETURN _public;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_track_published(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_track_published(uuid, boolean) TO authenticated;

-- is_public and the verification columns are now reachable only through the
-- two functions above. Everything else about a track stays directly
-- editable by its owner, under the existing RLS policies.
REVOKE UPDATE ON public.custom_tracks FROM anon, authenticated;
GRANT UPDATE (name, season, params, goal, play_count)
  ON public.custom_tracks TO authenticated;

-- ── Car customisation, Pro and up ───────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS car jsonb;

COMMENT ON COLUMN public.profiles.car IS
  'DAP Track car appearance. Editable on Pro and above; the trigger enforces that.';

CREATE OR REPLACE FUNCTION public.enforce_car_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.car IS DISTINCT FROM OLD.car
     AND public.tier_rank(COALESCE(NEW.tier, 'free')) < public.tier_rank('pro')
  THEN
    RAISE EXCEPTION
      'Customising your car is a Pro feature.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_car_tier() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_car_tier ON public.profiles;
CREATE TRIGGER profiles_car_tier
  BEFORE UPDATE OF car ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_car_tier();

GRANT UPDATE (car) ON public.profiles TO authenticated;
