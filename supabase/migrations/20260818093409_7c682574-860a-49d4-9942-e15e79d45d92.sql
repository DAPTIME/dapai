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

REVOKE ALL ON FUNCTION public.queue_pick_lane(integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_pick_lane(integer, integer, integer, integer, integer) TO service_role;

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