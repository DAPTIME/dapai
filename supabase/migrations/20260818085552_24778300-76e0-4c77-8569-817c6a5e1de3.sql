REVOKE EXECUTE ON FUNCTION public.my_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tier() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_usage(numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_usage(numeric, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.queue_reap() FROM PUBLIC, anon, authenticated;