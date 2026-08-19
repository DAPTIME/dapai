-- The AI queue has never worked.
--
-- Every call to queue_join came back 400 with 42702, "column reference
-- \"lane\" is ambiguous", and public.ai_queue held exactly one row, created
-- 2026-08-17. Found by reading the project's own edge logs while verifying
-- something else: /rest/v1/rpc/queue_join and /rest/v1/rpc/queue_claim were
-- returning 400 on every single chat request.
--
-- The ambiguity is not in queue_join, which is where it surfaces.
-- queue_position declares a local `lane text` to hold the lane it is
-- walking, then filters the table with
--
--     WHERE state = 'waiting' AND lane = 'pro'
--
-- where `lane` resolves both to that local and to ai_queue.lane. The call
-- chain is queue_join -> queue_status -> queue_position, so the error came
-- back two frames above its cause.
--
-- None of this was visible from outside. api/chat.ts catches a queue
-- failure and dispatches anyway — deliberately, so a queue problem cannot
-- take chat down — so chat kept working while the one thing the queue
-- exists for never happened: a single in-flight generation, because
-- inference runs on one box. Every request since 17 August went straight at
-- the hardware with no lane and no ordering, which is its own explanation
-- for requests that take far longer than they should when more than one
-- person is talking to it.
--
-- Fixed by aliasing the table so every column reference is qualified, and
-- by renaming the local to v_lane so the two cannot collide again. The
-- local is not an OUT parameter, so no caller can tell the difference.
CREATE OR REPLACE FUNCTION public.queue_position(_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pro_ids uuid[]; go_ids uuid[]; free_ids uuid[];
  pi integer := 1; gi integer := 1; fi integer := 1;
  psg integer; gsf integer;
  v_lane text;
  taken uuid;
  n integer := 0;
BEGIN
  SELECT COALESCE(array_agg(q.id ORDER BY q.created_at), '{}') INTO pro_ids
    FROM public.ai_queue q WHERE q.state = 'waiting' AND q.lane = 'pro';
  SELECT COALESCE(array_agg(q.id ORDER BY q.created_at), '{}') INTO go_ids
    FROM public.ai_queue q WHERE q.state = 'waiting' AND q.lane = 'go';
  SELECT COALESCE(array_agg(q.id ORDER BY q.created_at), '{}') INTO free_ids
    FROM public.ai_queue q WHERE q.state = 'waiting' AND q.lane = 'free';

  SELECT c.pro_since_go, c.go_since_free INTO psg, gsf
    FROM public.ai_queue_counters c WHERE c.only_row;

  LOOP
    v_lane := public.queue_next_lane(
      psg, gsf,
      pi <= COALESCE(array_length(pro_ids, 1), 0),
      gi <= COALESCE(array_length(go_ids, 1), 0),
      fi <= COALESCE(array_length(free_ids, 1), 0)
    );
    EXIT WHEN v_lane IS NULL;

    IF v_lane = 'pro' THEN
      taken := pro_ids[pi]; pi := pi + 1;
      psg := psg + 1;
      IF gi > COALESCE(array_length(go_ids, 1), 0) THEN gsf := gsf + 1; END IF;
    ELSIF v_lane = 'go' THEN
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
