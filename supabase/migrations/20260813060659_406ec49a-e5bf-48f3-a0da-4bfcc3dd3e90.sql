REVOKE EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO service_role;