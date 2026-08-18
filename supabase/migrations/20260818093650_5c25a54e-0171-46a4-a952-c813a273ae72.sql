CREATE OR REPLACE FUNCTION public.chat_rate_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       SELECT count(*)
         FROM public.ai_queue q
        WHERE q.user_id = auth.uid()
          AND q.created_at > now() - interval '1 minute'
     ) < 4;
$$;

COMMENT ON FUNCTION public.chat_rate_ok() IS
  'True when the calling user has started fewer than 4 AI requests in the last minute. Applies to every tier, including exclusive: the system dispatches one request at a time, so this protects the shared slot.';

REVOKE ALL ON FUNCTION public.chat_rate_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_rate_ok() TO authenticated;