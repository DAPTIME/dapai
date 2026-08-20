-- How many messages a minute each plan may send: free 5, go 8, pro 10,
-- exclusive 15.
--
-- The old ceiling was a flat "fewer than 4 in the last minute" for
-- everybody, so a paying account was throttled exactly as hard as a free
-- one. Worth knowing when judging the change: this limit counts rows in
-- ai_queue, and queue_join was failing with 42702 until it was fixed
-- earlier today, so almost no rows were ever written and the limit was
-- barely being enforced at all. It starts binding now that the queue
-- works, which is the more reason for it to be the right shape.
CREATE OR REPLACE FUNCTION public.messages_per_minute(_tier public.account_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE _tier
    WHEN 'free'      THEN 5
    WHEN 'go'        THEN 8
    WHEN 'pro'       THEN 10
    WHEN 'exclusive' THEN 15
    ELSE 5
  END;
$$;

-- "< limit" counts what has already gone out this minute, so a limit of 5
-- lets the fifth message through and stops the sixth.
CREATE OR REPLACE FUNCTION public.chat_rate_ok()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       SELECT count(*)
         FROM public.ai_queue q
        WHERE q.user_id = auth.uid()
          AND q.created_at > now() - interval '1 minute'
     ) < public.messages_per_minute(
           COALESCE(
             (SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid()),
             'free'
           )
         );
$$;

-- So the app can tell someone what their own allowance is, rather than
-- only that they went past it.
CREATE OR REPLACE FUNCTION public.my_messages_per_minute()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.messages_per_minute(
    COALESCE((SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid()), 'free')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.my_messages_per_minute() FROM anon;
