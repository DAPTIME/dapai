
-- Custom Poly Racer tracks + per-track leaderboard scores.

CREATE TABLE public.custom_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  season text NOT NULL CHECK (season IN ('spring','summer','fall','winter')),
  params jsonb NOT NULL,
  goal integer NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  play_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_tracks TO authenticated;
GRANT SELECT ON public.custom_tracks TO anon;
GRANT ALL ON public.custom_tracks TO service_role;

ALTER TABLE public.custom_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public tracks are readable by anyone"
  ON public.custom_tracks FOR SELECT
  USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "Owner can insert own tracks"
  ON public.custom_tracks FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update own tracks"
  ON public.custom_tracks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner or admin can delete tracks"
  ON public.custom_tracks FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER custom_tracks_touch_updated_at
  BEFORE UPDATE ON public.custom_tracks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX custom_tracks_public_idx ON public.custom_tracks (is_public, created_at DESC);
CREATE INDEX custom_tracks_owner_idx ON public.custom_tracks (owner_id, created_at DESC);


CREATE TABLE public.track_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_ref text NOT NULL,
  best_time_ms integer NOT NULL CHECK (best_time_ms > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, track_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_scores TO authenticated;
GRANT ALL ON public.track_scores TO service_role;

ALTER TABLE public.track_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scores"
  ON public.track_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "User can insert own score"
  ON public.track_scores FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can update own score"
  ON public.track_scores FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can delete own score"
  ON public.track_scores FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER track_scores_touch_updated_at
  BEFORE UPDATE ON public.track_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX track_scores_ref_idx ON public.track_scores (track_ref, best_time_ms ASC);

-- Leaderboard function joins scores to profile names.
-- SECURITY DEFINER so it can read profile names without granting broad SELECT to authenticated.
CREATE OR REPLACE FUNCTION public.get_track_leaderboard(_track_ref text, _limit integer DEFAULT 20)
RETURNS TABLE (name text, best_time_ms integer, achieved_at timestamptz, rank integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO authenticated, anon;
