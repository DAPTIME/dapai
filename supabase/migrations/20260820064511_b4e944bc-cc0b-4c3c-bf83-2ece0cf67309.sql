REVOKE ALL ON public.email_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.password_reset_sessions FROM anon, authenticated;
REVOKE ALL ON public.ai_queue_counters FROM anon, authenticated;
GRANT ALL ON public.email_rate_limits TO service_role;
GRANT ALL ON public.password_reset_sessions TO service_role;
GRANT ALL ON public.ai_queue_counters TO service_role;

ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_queue_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_sessions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_rate_limits IS 'Server-only rate-limit ledger. No grants and no policies on purpose: reached exclusively through the service-role client.';
COMMENT ON TABLE public.password_reset_sessions IS 'Server-only password-reset tickets (token hashes). No grants and no policies on purpose: reached exclusively through the service-role client.';
COMMENT ON TABLE public.ai_queue_counters IS 'Server-only queue fairness counters. No grants and no policies on purpose: maintained by SECURITY DEFINER queue functions and the service-role client.';

CREATE OR REPLACE FUNCTION public.queue_eta_seconds()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE (
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at))
           )::integer
      FROM (
        SELECT started_at, finished_at FROM public.ai_queue
         WHERE state = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL
         ORDER BY finished_at DESC LIMIT 20
      ) recent
  ) END;
$$;

REVOKE ALL ON FUNCTION public.queue_eta_seconds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_eta_seconds() TO authenticated;