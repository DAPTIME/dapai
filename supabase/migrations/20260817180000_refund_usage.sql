-- Give back what was charged when no answer arrived.
--
-- Usage is charged before the orchestrator is dialled, which is the right
-- order: a reply that lands after the allowance ran out is a reply we gave
-- away. But it means an outage takes the tokens too, and the person is left
-- paying for "Sorry, DAP AI is offline right now."
--
-- ── What is refunded, and what is not ───────────────────────────────────
--
--   refunded   the backend was unreachable, returned nothing usable, or
--              timed out. Nothing was generated; there is nothing to pay
--              for.
--
--   not        a safety refusal. The prompt was processed and answered,
--              just not the way the sender hoped. Refunding these would
--              make probing for a jailbreak free, which is the opposite of
--              what the filter is for.
--
--   not        the sender pressed stop. Tokens were produced and shown;
--              stopping early is a choice about the rest of them.
--
-- Clamped at zero and scoped to the current windows, so a refund arriving
-- after midnight cannot push the new day negative and hand out a larger
-- allowance than the plan gives.
CREATE OR REPLACE FUNCTION public.refund_usage(_cost numeric, _images integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  q public.usage_quota%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN
    RAISE EXCEPTION 'Invalid refund.';
  END IF;
  IF _images IS NULL OR _images < 0 OR _images > 1 THEN
    RAISE EXCEPTION 'Invalid refund.';
  END IF;

  SELECT * INTO q FROM public.usage_quota WHERE user_id = uid FOR UPDATE;
  IF q.user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Only if the charge is still inside the window it was made in. Once the
  -- day has rolled the spend is already zeroed, and subtracting again would
  -- be a gift rather than a refund.
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
   WHERE user_id = uid;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_usage(numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_usage(numeric, integer) TO authenticated;

COMMENT ON FUNCTION public.refund_usage(numeric, integer) IS
  'Returns usage tokens charged for a request that produced no answer (backend unreachable, empty, or timed out). Not used for safety refusals or user cancellations — both of those were served.';
