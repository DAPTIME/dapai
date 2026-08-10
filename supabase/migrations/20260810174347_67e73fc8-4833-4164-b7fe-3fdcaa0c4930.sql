CREATE OR REPLACE FUNCTION public.get_track_leaderboard(_track_ref text, _limit integer DEFAULT 20)
 RETURNS TABLE(name text, best_time_ms integer, achieved_at timestamp with time zone, rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uuid uuid;
  _allowed boolean := false;
BEGIN
  BEGIN
    _uuid := _track_ref::uuid;
  EXCEPTION WHEN others THEN
    _uuid := NULL;
  END;

  IF _uuid IS NULL THEN
    -- Built-in track reference (non-uuid): public leaderboard.
    _allowed := true;
  ELSE
    SELECT (t.is_public OR t.owner_id = auth.uid())
      INTO _allowed
    FROM public.custom_tracks t
    WHERE t.id = _uuid;
    _allowed := COALESCE(_allowed, false);
  END IF;

  IF NOT _allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(p.name, split_part(p.email, '@', 1), 'Player') AS name,
    s.best_time_ms,
    s.updated_at AS achieved_at,
    (row_number() OVER (ORDER BY s.best_time_ms ASC))::int AS rank
  FROM public.track_scores s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.track_ref = _track_ref
  ORDER BY s.best_time_ms ASC
  LIMIT LEAST(GREATEST(_limit, 1), 100);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO anon, authenticated, service_role;