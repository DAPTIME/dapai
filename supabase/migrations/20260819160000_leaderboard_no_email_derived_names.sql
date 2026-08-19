-- Stop publishing email local-parts on the public leaderboard.
--
-- get_track_leaderboard fell back to split_part(p.email, '@', 1) whenever a
-- profile had no name, and the function is granted to anon. So an account
-- that never set a display name had the first half of its email address
-- published to anyone who opened a track page — the half that is usually a
-- real person's name.
--
-- The fallback is now a stable pseudonym derived from the user id: the same
-- player keeps the same handle across runs and tracks, and it reveals
-- nothing. hashtext is deterministic within a database, which is all this
-- needs; it is a display label, not a security boundary.
CREATE OR REPLACE FUNCTION public.get_track_leaderboard(_track_ref text, _limit integer DEFAULT 20)
RETURNS TABLE (name text, best_time_ms integer, achieved_at timestamptz, rank integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      NULLIF(btrim(p.name), ''),
      'DAP Racer #' || lpad((abs(hashtext(s.user_id::text)) % 100000)::text, 5, '0')
    ) AS name,
    s.best_time_ms,
    s.updated_at AS achieved_at,
    (row_number() OVER (ORDER BY s.best_time_ms ASC))::int AS rank
  FROM public.track_scores s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.track_ref = _track_ref
  ORDER BY s.best_time_ms ASC
  LIMIT LEAST(GREATEST(_limit, 1), 100);
$$;

COMMENT ON FUNCTION public.get_track_leaderboard(text, integer) IS
  'Public leaderboard. Never derives a display name from an email address: profiles without a name get a stable pseudonym.';
