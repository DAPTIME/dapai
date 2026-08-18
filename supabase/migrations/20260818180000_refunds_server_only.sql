-- Take refunds away from the client.
--
-- refund_usage(_cost, _images) was granted to authenticated, and it
-- subtracts whatever _cost it is handed from the caller's own ledger. The
-- per-call clamp of 100 bounds one call, not the number of calls, so a
-- signed-in account could POST /rest/v1/rpc/refund_usage {"_cost":100} in a
-- loop and hold its daily and weekly usage at zero forever. No charge had
-- to have happened first; nothing tied the refund to a request.
--
-- The app never needed the client to hold this. Every legitimate refund is
-- decided on the server, which already knows the exact amount it charged a
-- moment earlier. So the grant comes off and refunds move to a function
-- only the service role can call, with the user named explicitly rather
-- than taken from auth.uid().
--
-- This does not make refunds unforgeable in principle -- server code still
-- passes an amount -- but that amount is now computed server-side from the
-- prompt it just charged for, and is unreachable from a browser.
CREATE OR REPLACE FUNCTION public.admin_refund_usage(
  _user_id uuid,
  _cost numeric,
  _images integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q public.usage_quota%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A user is required.';
  END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN
    RAISE EXCEPTION 'Invalid refund.';
  END IF;
  IF _images IS NULL OR _images < 0 OR _images > 1 THEN
    RAISE EXCEPTION 'Invalid refund.';
  END IF;

  SELECT * INTO q FROM public.usage_quota WHERE user_id = _user_id FOR UPDATE;
  IF q.user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Same window scoping as before: a refund arriving after the day rolled
  -- must not push the new day negative and hand out a bigger allowance.
  UPDATE public.usage_quota
     SET day_tokens = CASE
           WHEN day_date = public.usage_day() THEN GREATEST(0, day_tokens - _cost)
           ELSE day_tokens
         END,
         day_images = CASE
           WHEN day_date = public.usage_day() THEN GREATEST(0, day_images - _images)
           ELSE day_images
         END,
         week_tokens = CASE
           WHEN week_started_at = public.usage_week() THEN GREATEST(0, week_tokens - _cost)
           ELSE week_tokens
         END,
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_refund_usage(uuid, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_usage(uuid, numeric, integer) TO service_role;

COMMENT ON FUNCTION public.admin_refund_usage(uuid, numeric, integer) IS
  'Service-role only. Returns usage charged for a request that produced nothing. Never grant to authenticated: the caller chooses the amount.';

-- The client-callable version loses its grant. Kept, rather than dropped,
-- so an older deploy still in flight fails with a permission error instead
-- of a missing-function error -- both refuse, but the first says why.
REVOKE ALL ON FUNCTION public.refund_usage(numeric, integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.refund_usage(numeric, integer) IS
  'DEPRECATED and no longer granted to authenticated: it let any signed-in caller zero their own quota by calling it repeatedly. Use admin_refund_usage from the server.';

-- Unrelated to the above, and safe: nothing calls this. The app looks a
-- room up with find_study_room_by_code and then inserts into
-- study_room_members itself, and no RLS policy or other function
-- references this one.
--
-- The other functions linter 0029 names are NOT revoked, and that is
-- measured rather than assumed: has_role backs 11 RLS policies (ai_settings,
-- custom_daps, custom_tracks, profiles, user_roles) and both profile
-- privilege-guard triggers; is_room_member backs 6; can_join_study_room
-- backs 1. Policy expressions are evaluated with the caller's privileges,
-- so revoking EXECUTE on those would fail every query against those tables.
REVOKE ALL ON FUNCTION public.join_study_room_by_code(text) FROM anon, authenticated;
