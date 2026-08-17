-- Two queues in front of the orchestrator.
--
-- Inference runs on one box. Left alone, ten people pressing send at once
-- means ten concurrent generations on hardware sized for two, and everyone
-- gets a slow answer instead of two people getting fast ones. So requests
-- take a numbered ticket and wait.
--
--   Lane A — free accounts. One slot. Strict FIFO.
--   Lane B — everyone paying. One slot. Higher tiers go first, with a
--            fairness rule so "first" does not become "only".
--
-- Total concurrency is two: one from each lane. A free user is therefore
-- never stuck behind a paying user, and vice versa.
--
-- ── Why this lives in the database ──────────────────────────────────────
--
-- There was already an in-process queue (src/lib/ai-queue.ts) and it is
-- not enough: it is per-worker, so two workers means two concurrent
-- generations, and it evaporates on redeploy, which loses everyone's
-- place. A queue whose whole job is to be the single arbiter of a shared
-- resource has to live where there is exactly one of it.
--
-- It also has to survive a page refresh — the spec's requirement, and the
-- reason the ticket is a row rather than a promise.

-- ── Where Exclusive sits ────────────────────────────────────────────────
--
-- The spec names lane A as free and lane B as go + pro, and does not say
-- where Exclusive goes. It joins lane B at the highest priority: leaving
-- it unqueued would let it stampede the very hardware the lanes exist to
-- protect, which is the one outcome no reading of the spec wants.

CREATE TABLE IF NOT EXISTS public.ai_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.account_tier NOT NULL,
  lane text NOT NULL CHECK (lane IN ('a', 'b')),
  state text NOT NULL DEFAULT 'waiting'
    CHECK (state IN ('waiting', 'running', 'done', 'cancelled')),
  chat_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Refreshed while a request is in flight. A running row that stops
  -- breathing is an abandoned one, and its slot has to come back.
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_queue IS
  'One row per in-flight or waiting AI request. Two lanes, one concurrent slot each.';

-- Only ever queried as "the live rows of one lane, oldest first", so that
-- is the index. Partial, because done and cancelled rows are the vast
-- majority and are never ordered over.
CREATE INDEX IF NOT EXISTS ai_queue_live_idx
  ON public.ai_queue (lane, created_at)
  WHERE state IN ('waiting', 'running');

CREATE INDEX IF NOT EXISTS ai_queue_user_idx
  ON public.ai_queue (user_id, created_at DESC);

-- ── Fairness counter ────────────────────────────────────────────────────
-- After two consecutive high-tier starts in lane B, the next waiting Go
-- request must go before any further Pro. Without this, a steady trickle
-- of Pro traffic starves Go entirely.
CREATE TABLE IF NOT EXISTS public.ai_queue_lane_state (
  lane text PRIMARY KEY,
  consecutive_high integer NOT NULL DEFAULT 0
);

INSERT INTO public.ai_queue_lane_state (lane) VALUES ('a'), ('b')
ON CONFLICT (lane) DO NOTHING;

-- Nobody talks to either table directly; the functions below are the only
-- door, so a client cannot promote its own ticket.
ALTER TABLE public.ai_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_queue_lane_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_queue FROM anon, authenticated;
REVOKE ALL ON public.ai_queue_lane_state FROM anon, authenticated;

-- ── Which lane does a tier use ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_lane_for(_tier public.account_tier)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN _tier = 'free' THEN 'a' ELSE 'b' END $$;

-- Ordering weight within lane B. Lower sorts first.
CREATE OR REPLACE FUNCTION public.queue_priority(_tier public.account_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'exclusive' THEN 0
    WHEN 'pro' THEN 1
    WHEN 'go' THEN 2
    ELSE 3
  END
$$;

-- ── Reaping ─────────────────────────────────────────────────────────────
--
-- A browser that closes mid-generation never calls finish, and its slot
-- would be held forever. Anything running without a heartbeat for 2
-- minutes is released; anything still waiting after 15 is abandoned.
-- Called at the top of every claim, so the queue heals itself without a
-- cron job.
CREATE OR REPLACE FUNCTION public.queue_reap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_queue
     SET state = 'cancelled', finished_at = now()
   WHERE state = 'running' AND heartbeat_at < now() - interval '2 minutes';

  UPDATE public.ai_queue
     SET state = 'cancelled', finished_at = now()
   WHERE state = 'waiting' AND created_at < now() - interval '15 minutes';
END;
$function$;

-- ── Where am I ──────────────────────────────────────────────────────────
--
-- Position counts only the rows that would be served before this one under
-- the lane's own ordering, so the number a Go user sees accounts for the
-- Pro requests that will jump them.
CREATE OR REPLACE FUNCTION public.queue_status(_id uuid)
RETURNS TABLE (id uuid, lane text, pos integer, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.ai_queue%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.ai_queue WHERE ai_queue.id = _id;
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  -- Your own ticket only. Position leaks nothing, but who else is in the
  -- queue is not the caller's business.
  IF r.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request.';
  END IF;

  RETURN QUERY
  SELECT r.id, r.lane,
         CASE WHEN r.state = 'running' THEN 0 ELSE (
           SELECT count(*)::integer + 1
             FROM public.ai_queue o
            WHERE o.lane = r.lane
              AND o.state = 'waiting'
              AND o.id <> r.id
              AND (
                r.lane = 'a'
                  -- Lane A is strict arrival order.
                  AND o.created_at < r.created_at
                OR r.lane = 'b'
                  AND (public.queue_priority(o.tier), o.created_at)
                      < (public.queue_priority(r.tier), r.created_at)
              )
         ) END,
         r.state;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_status(uuid) TO authenticated;

-- ── Joining ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_join(_chat_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, lane text, pos integer, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  v_lane text;
  v_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  PERFORM public.queue_reap();

  SELECT COALESCE(tier, 'free') INTO v_tier FROM public.profiles WHERE profiles.id = uid;
  v_lane := public.queue_lane_for(COALESCE(v_tier, 'free'));

  -- One live ticket per account. Pressing send twice should not buy two
  -- places in the line, and it is also what makes a page refresh rejoin
  -- the existing ticket instead of taking a worse one.
  SELECT q.id INTO v_id
    FROM public.ai_queue q
   WHERE q.user_id = uid AND q.state IN ('waiting', 'running')
   ORDER BY q.created_at
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.ai_queue (user_id, tier, lane, chat_id)
    VALUES (uid, COALESCE(v_tier, 'free'), v_lane, _chat_id)
    RETURNING ai_queue.id INTO v_id;
  END IF;

  RETURN QUERY SELECT * FROM public.queue_status(v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_join(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_join(uuid) TO authenticated;

-- ── Claiming the slot ───────────────────────────────────────────────────
--
-- Returns true when this ticket may now dial the orchestrator. The caller
-- polls it. Everything happens under a lock on the lane's counter row, so
-- two tickets cannot both be told the same slot is theirs.
CREATE OR REPLACE FUNCTION public.queue_claim(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.ai_queue%ROWTYPE;
  v_streak integer;
  v_next uuid;
  v_go_waiting boolean;
BEGIN
  SELECT * INTO r FROM public.ai_queue WHERE ai_queue.id = _id;
  IF r.id IS NULL OR r.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request.';
  END IF;

  IF r.state = 'running' THEN
    UPDATE public.ai_queue SET heartbeat_at = now() WHERE ai_queue.id = _id;
    RETURN true;
  END IF;
  IF r.state <> 'waiting' THEN
    RETURN false;
  END IF;

  PERFORM public.queue_reap();

  -- Serialise the whole decision on the lane. Without this, two waiting
  -- tickets can both see an empty slot in the same instant.
  SELECT consecutive_high INTO v_streak
    FROM public.ai_queue_lane_state
   WHERE lane = r.lane
     FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.ai_queue o
     WHERE o.lane = r.lane AND o.state = 'running'
  ) THEN
    RETURN false;  -- the lane's one slot is busy
  END IF;

  -- Who is actually next?
  IF r.lane = 'a' THEN
    SELECT o.id INTO v_next
      FROM public.ai_queue o
     WHERE o.lane = 'a' AND o.state = 'waiting'
     ORDER BY o.created_at
     LIMIT 1;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.ai_queue o
       WHERE o.lane = 'b' AND o.state = 'waiting' AND o.tier = 'go'
    ) INTO v_go_waiting;

    IF v_streak >= 2 AND v_go_waiting THEN
      -- Fairness: two high-tier requests have been served back to back,
      -- so the longest-waiting Go request goes now regardless of rank.
      SELECT o.id INTO v_next
        FROM public.ai_queue o
       WHERE o.lane = 'b' AND o.state = 'waiting' AND o.tier = 'go'
       ORDER BY o.created_at
       LIMIT 1;
    ELSE
      SELECT o.id INTO v_next
        FROM public.ai_queue o
       WHERE o.lane = 'b' AND o.state = 'waiting'
       ORDER BY public.queue_priority(o.tier), o.created_at
       LIMIT 1;
    END IF;
  END IF;

  IF v_next IS DISTINCT FROM _id THEN
    RETURN false;  -- somebody else's turn
  END IF;

  UPDATE public.ai_queue
     SET state = 'running', started_at = now(), heartbeat_at = now()
   WHERE ai_queue.id = _id;

  -- Update the streak only for lane B, and only once the start is real.
  IF r.lane = 'b' THEN
    UPDATE public.ai_queue_lane_state
       SET consecutive_high =
             CASE WHEN r.tier = 'go' THEN 0 ELSE consecutive_high + 1 END
     WHERE lane = 'b';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_claim(uuid) TO authenticated;

-- ── Letting go ──────────────────────────────────────────────────────────
-- One function for both finishing and cancelling: the slot has to come
-- back either way, and having two paths is how one of them gets forgotten.
CREATE OR REPLACE FUNCTION public.queue_release(_id uuid, _cancelled boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_queue
     SET state = CASE WHEN _cancelled THEN 'cancelled' ELSE 'done' END,
         finished_at = now()
   WHERE ai_queue.id = _id
     AND ai_queue.user_id = auth.uid()
     AND ai_queue.state IN ('waiting', 'running');
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_release(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_release(uuid, boolean) TO authenticated;

-- ── Heartbeat ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_beat(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ai_queue
     SET heartbeat_at = now()
   WHERE id = _id AND user_id = auth.uid() AND state = 'running';
$$;

REVOKE ALL ON FUNCTION public.queue_beat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_beat(uuid) TO authenticated;

-- ── Estimating the wait ─────────────────────────────────────────────────
-- Median of the last 20 completed runs in the lane, times the number of
-- people ahead. Returns NULL rather than a guess when there is no history
-- — "about 30s" invented from nothing is worse than showing nothing.
CREATE OR REPLACE FUNCTION public.queue_eta_seconds(_lane text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at))
         )::integer
    FROM (
      SELECT started_at, finished_at
        FROM public.ai_queue
       WHERE lane = _lane
         AND state = 'done'
         AND started_at IS NOT NULL
         AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 20
    ) recent;
$$;

REVOKE ALL ON FUNCTION public.queue_eta_seconds(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_eta_seconds(text) TO authenticated;
