-- Give the leaderboard function back its EXECUTE grant.
--
-- Every leaderboard on the site was answering "Something went wrong".
-- Calling the RPC directly with the publishable key returns:
--
--   42501: permission denied for function get_track_leaderboard
--
-- while a plain table read on the same key succeeds, so the role and the
-- key are fine — EXECUTE had simply been revoked from anon.
--
-- It was almost certainly revoked to silence two database-linter warnings:
--
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--
-- Those warnings are expected here and must not be "fixed" by revoking
-- this grant again. The advisor flags every SECURITY DEFINER function that
-- an unauthenticated caller can reach, because most of them should not be
-- reachable. This one should:
--
--   * Track leaderboards are shown on the track page before sign-in. That
--     is the feature.
--   * It returns name, time, date and rank — no user ids, no emails.
--   * SECURITY DEFINER is what lets it read track_scores, whose RLS is
--     owner-only. Dropping to SECURITY INVOKER would return an empty
--     board to everyone rather than fixing anything.
--   * Its arguments are clamped internally (LIMIT is bounded 1..100), so
--     it cannot be used to pull the table.
--
-- If the linter warning needs to go away, the answer is to acknowledge it,
-- not to revoke the grant. Revoking it breaks the leaderboards.

REVOKE EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_track_leaderboard(text, integer) IS
  'Public leaderboard. Deliberately executable by anon: track pages show it before sign-in. Returns no user identifiers. Do not revoke EXECUTE to silence linter 0028/0029 — that breaks every leaderboard on the site.';
