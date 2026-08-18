-- Two small follow-ups to the three-lane fast-pass queue.
--
-- 1. queue_pick_lane: a pure, side-effect-free wrapper around
--    queue_next_lane plus the counter-update rule that queue_claim applies
--    after a dispatch. It exists solely so the SQL selection rule can be
--    driven through the same synthetic scenarios as the TypeScript port in
--    src/lib/queue-lanes.ts (see its test file) without touching real
--    queue rows — ai_queue has a foreign key to auth.users, so there is no
--    way to insert fake waiting requests to exercise queue_claim directly.
--    Internal only: granted to service_role, not to client roles.
--
-- 2. The reap interval for a running row: 2 minutes was generous relative
--    to a 30s heartbeat. With a single system-wide slot, a stuck running
--    row stalls every request in every lane, so the margin is tightened to
--    90 seconds — three missed heartbeats — which still tolerates a slow
--    network without leaving the whole site stuck for two minutes.

CREATE OR REPLACE FUNCTION public.queue_pick_lane(
  _pro_waiting integer, _go_waiting integer, _free_waiting integer,
  _pro_since_go integer, _go_since_free integer
)
RETURNS TABLE (lane text, pro_since_go integer, go_since_free integer)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH picked AS (
    SELECT public.queue_next_lane(
      _pro_since_go, _go_since_free,
      _pro_waiting > 0, _go_waiting > 0, _free_waiting > 0
    ) AS lane
  )
  SELECT
    picked.lane,
    CASE
      WHEN picked.lane = 'pro' THEN _pro_since_go + 1
      WHEN picked.lane = 'go' THEN 0
      WHEN picked.lane = 'free' THEN 0
      ELSE _pro_since_go
    END,
    CASE
      WHEN picked.lane = 'pro' THEN _go_since_free + CASE WHEN _go_waiting > 0 THEN 0 ELSE 1 END
      WHEN picked.lane = 'go' THEN _go_since_free + 1
      WHEN picked.lane = 'free' THEN 0
      ELSE _go_since_free
    END
  FROM picked;
$$;

COMMENT ON FUNCTION public.queue_pick_lane(integer, integer, integer, integer, integer) IS
  'Pure simulation of one dispatch decision (lane + resulting counters), for testing the selection rule against synthetic scenarios. Not used by queue_claim itself, which reads real rows; queue_claim and this function both call queue_next_lane so they cannot disagree on the rule.';

REVOKE ALL ON FUNCTION public.queue_pick_lane(integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_pick_lane(integer, integer, integer, integer, integer) TO service_role;

-- ── Tighter reap window ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_reap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_queue
     SET state = 'cancelled', finished_at = now()
   WHERE state = 'running' AND heartbeat_at < now() - interval '90 seconds';

  UPDATE public.ai_queue
     SET state = 'cancelled', finished_at = now()
   WHERE state = 'waiting' AND created_at < now() - interval '15 minutes';
END;
$function$;
