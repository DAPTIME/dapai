-- One queue, three lanes, a fast-pass ratio between them.
--
-- Replaces the earlier two-lane design (one slot for free, one for
-- everybody paying). That gave free and paid traffic a slot each, which is
-- a different promise: it meant a lone free user and a lone Pro user got
-- identical service. This is a theme-park fast pass instead — a single
-- line, dispatched one at a time, where paying moves you up the order but
-- never lets you skip forever.
--
--   pro  (Pro and Exclusive)  highest
--   go                        middle
--   free                      lowest
--
-- ── The ratio ───────────────────────────────────────────────────────────
--
-- Two counters, both persistent, so a restart does not hand somebody a
-- fresh run of priority:
--
--   pro_since_go   pro requests served since the last go
--   go_since_free  go requests served since the last free
--
-- pro is blocked after 2 while a go waits; go is blocked after 2 while a
-- free waits. The cascade rule covers the case those two miss: when there
-- are no go users at all, nothing ever resets go_since_free, and free would
-- wait until pro emptied out. So pro is also blocked when no go is waiting,
-- a free is, and both counters have run out.
--
-- Serving pro with no go waiting advances go_since_free as well, for the
-- same reason: the pro run has to count against free's turn too, or the
-- cascade never fires.
--
-- ── One slot ────────────────────────────────────────────────────────────
--
-- Exactly one request is dispatched at a time. The counters are read and
-- written inside the same transaction that dispatches, under a row lock on
-- the counter row, so two browsers claiming at the same moment cannot both
-- win or leave the counters half-updated.

DROP FUNCTION IF EXISTS public.queue_claim(uuid);
DROP FUNCTION IF EXISTS public.queue_status(uuid);
DROP FUNCTION IF EXISTS public.queue_join(uuid);
DROP FUNCTION IF EXISTS public.queue_lane_for(public.account_tier);
DROP FUNCTION IF EXISTS public.queue_priority(public.account_tier);
DROP FUNCTION IF EXISTS public.queue_eta_seconds(text);
DROP TABLE IF EXISTS public.ai_queue_lane_state;

-- Lanes are now named after the tier group they serve rather than 'a'/'b'.
ALTER TABLE public.ai_queue DROP CONSTRAINT IF EXISTS ai_queue_lane_check;
UPDATE public.ai_queue
   SET lane = CASE
     WHEN tier IN ('pro', 'exclusive') THEN 'pro'
     WHEN tier = 'go' THEN 'go'
     ELSE 'free'
   END
 WHERE lane IN ('a', 'b');
ALTER TABLE public.ai_queue
  ADD CONSTRAINT ai_queue_lane_check CHECK (lane IN ('pro', 'go', 'free'));

DROP INDEX IF EXISTS public.ai_queue_live_idx;
CREATE INDEX IF NOT EXISTS ai_queue_live_idx
  ON public.ai_queue (created_at)
  WHERE state IN ('waiting', 'running');

-- ── The counters ────────────────────────────────────────────────────────
-- One row, forced by the primary key, so there is nothing to disagree with.
CREATE TABLE IF NOT EXISTS public.ai_queue_counters (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  pro_since_go integer NOT NULL DEFAULT 0,
  go_since_free integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_queue_counters (only_row) VALUES (true)
ON CONFLICT (only_row) DO NOTHING;

ALTER TABLE public.ai_queue_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_queue_counters FROM anon, authenticated;

COMMENT ON TABLE public.ai_queue_counters IS
  'Fast-pass ratio state. Deliberately has no RLS policy: it is written only by queue_claim under a row lock, and showing a caller the ratios would tell them about other tiers.';

COMMENT ON TABLE public.ai_queue IS
  'One row per waiting or in-flight AI request. Single unified queue, one dispatch at a time, three priority lanes. Deliberately has no RLS policy — callers read their own ticket through queue_status(), which returns only their own row.';

CREATE OR REPLACE FUNCTION public.queue_lane_for(_tier public.account_tier)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _tier IN ('pro', 'exclusive') THEN 'pro'
    WHEN _tier = 'go' THEN 'go'
    ELSE 'free'
  END
$$;

-- ── Who goes next ───────────────────────────────────────────────────────
--
-- The selection rule, in one place. Takes the counters and what is waiting,
-- and returns a lane name or NULL. Written as a pure function of its
-- arguments so the dispatcher and the position estimate can share it and
-- cannot drift apart — a position calculated by different logic than the
-- dispatcher uses is worse than no position at all.
CREATE OR REPLACE FUNCTION public.queue_next_lane(
  _pro_since_go integer, _go_since_free integer,
  _pro_waiting boolean, _go_waiting boolean, _free_waiting boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- pro, unless the ratio holds it back
    WHEN _pro_waiting AND NOT (
      (_pro_since_go >= 2 AND _go_waiting)
      -- cascade: no go exists to reset the middle counter, so a pro run
      -- has to yield to free directly or free never moves
      OR (NOT _go_waiting AND _free_waiting AND _pro_since_go >= 2 AND _go_since_free >= 2)
    ) THEN 'pro'
    WHEN _go_waiting AND NOT (_go_since_free >= 2 AND _free_waiting) THEN 'go'
    WHEN _free_waiting THEN 'free'
    -- Fallbacks: a blocked lane still runs when it is the only one left.
    -- The ratio exists to stop starvation, not to idle the hardware.
    WHEN _go_waiting THEN 'go'
    WHEN _pro_waiting THEN 'pro'
    ELSE NULL
  END
$$;

-- ── Reaping ─────────────────────────────────────────────────────────────
-- A browser that closes mid-generation never releases its slot, and with a
-- single slot that would stop the whole queue rather than half of it.
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

-- ── Position ────────────────────────────────────────────────────────────
--
-- Replays the dispatcher over everything currently waiting and reports how
-- many turns away this ticket is. An exact answer rather than "how many are
-- ahead of you in your own lane", which would read as a promise the ratio
-- does not keep.
--
-- The loop is bounded by the number of waiting rows, which is tens at
-- worst; a closed-form version of a rule with two counters and a cascade
-- would be harder to check against the spec than the replay is.
CREATE OR REPLACE FUNCTION public.queue_position(_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pro_ids uuid[]; go_ids uuid[]; free_ids uuid[];
  pi integer := 1; gi integer := 1; fi integer := 1;
  psg integer; gsf integer;
  lane text;
  taken uuid;
  n integer := 0;
BEGIN
  SELECT COALESCE(array_agg(id ORDER BY created_at), '{}') INTO pro_ids
    FROM public.ai_queue WHERE state = 'waiting' AND lane = 'pro';
  SELECT COALESCE(array_agg(id ORDER BY created_at), '{}') INTO go_ids
    FROM public.ai_queue WHERE state = 'waiting' AND lane = 'go';
  SELECT COALESCE(array_agg(id ORDER BY created_at), '{}') INTO free_ids
    FROM public.ai_queue WHERE state = 'waiting' AND lane = 'free';

  SELECT pro_since_go, go_since_free INTO psg, gsf
    FROM public.ai_queue_counters WHERE only_row;

  LOOP
    lane := public.queue_next_lane(
      psg, gsf,
      pi <= COALESCE(array_length(pro_ids, 1), 0),
      gi <= COALESCE(array_length(go_ids, 1), 0),
      fi <= COALESCE(array_length(free_ids, 1), 0)
    );
    EXIT WHEN lane IS NULL;

    IF lane = 'pro' THEN
      taken := pro_ids[pi]; pi := pi + 1;
      psg := psg + 1;
      IF gi > COALESCE(array_length(go_ids, 1), 0) THEN gsf := gsf + 1; END IF;
    ELSIF lane = 'go' THEN
      taken := go_ids[gi]; gi := gi + 1;
      psg := 0; gsf := gsf + 1;
    ELSE
      taken := free_ids[fi]; fi := fi + 1;
      psg := 0; gsf := 0;
    END IF;

    n := n + 1;
    IF taken = _id THEN RETURN n; END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_position(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_position(uuid) TO authenticated;

-- ── Your ticket ─────────────────────────────────────────────────────────
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
  IF r.id IS NULL THEN RETURN; END IF;
  -- Your own ticket only. Nobody is shown another tier's queue.
  IF r.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request.';
  END IF;

  RETURN QUERY SELECT r.id, r.lane,
    CASE WHEN r.state = 'running' THEN 0 ELSE public.queue_position(_id) END,
    r.state;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_join(_chat_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, lane text, pos integer, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier public.account_tier;
  v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  PERFORM public.queue_reap();

  SELECT COALESCE(p.tier, 'free') INTO v_tier FROM public.profiles p WHERE p.id = uid;

  -- One live ticket per account: pressing send twice must not buy two
  -- places, and it is what lets a refresh rejoin rather than go to the back.
  SELECT q.id INTO v_id
    FROM public.ai_queue q
   WHERE q.user_id = uid AND q.state IN ('waiting', 'running')
   ORDER BY q.created_at
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.ai_queue (user_id, tier, lane, chat_id)
    VALUES (uid, COALESCE(v_tier, 'free'),
            public.queue_lane_for(COALESCE(v_tier, 'free')), _chat_id)
    RETURNING ai_queue.id INTO v_id;
  END IF;

  RETURN QUERY SELECT * FROM public.queue_status(v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_join(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_join(uuid) TO authenticated;

-- ── Dispatch ────────────────────────────────────────────────────────────
--
-- Locks the counter row first. Two browsers claiming at the same instant
-- serialise on it, so the second sees the first's dispatch already running
-- and is told to keep waiting — rather than both being told to go.
CREATE OR REPLACE FUNCTION public.queue_claim(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.ai_queue%ROWTYPE;
  c public.ai_queue_counters%ROWTYPE;
  v_lane text;
  v_next uuid;
  pro_w boolean; go_w boolean; free_w boolean;
BEGIN
  SELECT * INTO r FROM public.ai_queue WHERE ai_queue.id = _id;
  IF r.id IS NULL OR r.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request.';
  END IF;

  IF r.state = 'running' THEN
    UPDATE public.ai_queue SET heartbeat_at = now() WHERE ai_queue.id = _id;
    RETURN true;
  END IF;
  IF r.state <> 'waiting' THEN RETURN false; END IF;

  PERFORM public.queue_reap();

  SELECT * INTO c FROM public.ai_queue_counters WHERE only_row FOR UPDATE;

  -- One slot for the whole site.
  IF EXISTS (SELECT 1 FROM public.ai_queue o WHERE o.state = 'running') THEN
    RETURN false;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.ai_queue o WHERE o.state='waiting' AND o.lane='pro'),
         EXISTS (SELECT 1 FROM public.ai_queue o WHERE o.state='waiting' AND o.lane='go'),
         EXISTS (SELECT 1 FROM public.ai_queue o WHERE o.state='waiting' AND o.lane='free')
    INTO pro_w, go_w, free_w;

  v_lane := public.queue_next_lane(c.pro_since_go, c.go_since_free, pro_w, go_w, free_w);
  IF v_lane IS NULL THEN RETURN false; END IF;

  SELECT o.id INTO v_next
    FROM public.ai_queue o
   WHERE o.state = 'waiting' AND o.lane = v_lane
   ORDER BY o.created_at
   LIMIT 1;

  IF v_next IS DISTINCT FROM _id THEN RETURN false; END IF;

  UPDATE public.ai_queue
     SET state = 'running', started_at = now(), heartbeat_at = now()
   WHERE ai_queue.id = _id;

  -- Counters move in the same transaction as the dispatch.
  IF v_lane = 'pro' THEN
    UPDATE public.ai_queue_counters
       SET pro_since_go = pro_since_go + 1,
           -- With no go waiting, nothing else will ever advance the middle
           -- counter, so a pro run has to count toward free's turn.
           go_since_free = go_since_free + CASE WHEN go_w THEN 0 ELSE 1 END,
           updated_at = now()
     WHERE only_row;
  ELSIF v_lane = 'go' THEN
    UPDATE public.ai_queue_counters
       SET pro_since_go = 0, go_since_free = go_since_free + 1, updated_at = now()
     WHERE only_row;
  ELSE
    UPDATE public.ai_queue_counters
       SET pro_since_go = 0, go_since_free = 0, updated_at = now()
     WHERE only_row;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_claim(uuid) TO authenticated;

-- Releasing never touches the counters: the ratio is about who was served,
-- and a request that errored was still served its turn. Rewinding here
-- would hand the same account a second turn for failing.
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

CREATE OR REPLACE FUNCTION public.queue_beat(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ai_queue SET heartbeat_at = now()
   WHERE id = _id AND user_id = auth.uid() AND state = 'running';
$$;

REVOKE ALL ON FUNCTION public.queue_beat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_beat(uuid) TO authenticated;

-- Median of the last 20 completed requests. One slot now, so this is the
-- whole queue's rate rather than a per-lane one.
CREATE OR REPLACE FUNCTION public.queue_eta_seconds()
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
      SELECT started_at, finished_at FROM public.ai_queue
       WHERE state = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 20
    ) recent;
$$;

REVOKE ALL ON FUNCTION public.queue_eta_seconds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_eta_seconds() TO authenticated;
