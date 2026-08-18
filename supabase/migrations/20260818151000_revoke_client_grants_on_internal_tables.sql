-- Take the client grants off three server-only tables.
--
-- password_reset_sessions, email_rate_limits and ai_queue_counters are
-- reached exclusively through the service-role client
-- (src/lib/reset-session.server.ts, src/lib/rate-limit.server.ts,
-- src/lib/attempt-limit.server.ts, and queue_claim), which bypasses both
-- RLS and table grants.
--
-- They nonetheless held the full default grant set for anon and
-- authenticated: INSERT, SELECT, UPDATE, DELETE, TRUNCATE. None of it was
-- usable, because RLS is enabled on all three with no policies, and a table
-- in that state denies everything. That is why the linter rates it INFO
-- (0008) rather than higher, and why nothing changes functionally here.
--
-- The reason to revoke anyway is that the safety rests on one fact staying
-- true. Add a permissive policy to password_reset_sessions later, or switch
-- RLS off for five minutes to debug something, and anon has immediate read
-- and write access to live password-reset tokens. After this it would take
-- two mistakes instead of one, and it costs nothing today.
--
-- 0008 stays on the advisor list for all three. That is the intended state,
-- recorded in the table comments so it reads as a decision.
REVOKE ALL ON TABLE public.password_reset_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_rate_limits       FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_queue_counters       FROM anon, authenticated;

COMMENT ON TABLE public.password_reset_sessions IS
  'Server-only. Reached exclusively through the service-role client; anon and authenticated hold no grants and no RLS policy exists. Both are deliberate - linter 0008 is expected.';
COMMENT ON TABLE public.email_rate_limits IS
  'Server-only rate-limit ledger. Service-role access only; no client grants, no RLS policy. Linter 0008 is expected.';
COMMENT ON TABLE public.ai_queue_counters IS
  'Server-only fast-pass queue counters (pro_since_go, go_since_free). Written only by queue_claim under a row lock. Linter 0008 is expected.';
