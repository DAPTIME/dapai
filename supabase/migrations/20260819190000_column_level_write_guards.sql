-- Row-level security decides *which rows* an account may write. It says
-- nothing about *which columns*, and three tables were granted every column
-- and left to RLS alone. Each of the following needed a signed-in account
-- and one request straight to /rest/v1 — no admin, no bug in the app, just
-- the endpoint the grant already allowed:
--
--   1. custom_daps — the author could set published = true and
--      moderation_status = 'approved' on their own row. marketplace_daps()
--      lists exactly that pair, so an unreviewed system prompt, and an
--      unreviewed mcp_url, would appear in the marketplace every Pro Lite
--      account installs from. install_custom_dap copies both into the
--      installer's account, so this reached other people's AI sessions.
--      install_count and author_name were writable too, which is the
--      ranking and the byline.
--
--   2. custom_daps — separately: reviewed_hash is written when a DAP is
--      submitted and never compared again, and it never covered mcp_url at
--      all. An approved listing could be edited afterwards and stayed
--      approved — reviewers saw one thing, installers got another.
--
--   3. custom_tracks — UPDATE was already restricted to the five columns a
--      track editor touches, which is the pattern this migration follows.
--      INSERT was not: a new row could be inserted with verified_at,
--      verified_time_ms and is_public already set, which is precisely what
--      verify_own_track (it bounds the lap time) and set_track_published
--      (it refuses to publish an undriven track) exist to prevent.
--
--   4. track_scores — best_time_ms had no bound and no direction, so any
--      account could write a world record onto any track_ref, including the
--      built-in ones. submitScore checks 500..600000 and "only if faster",
--      but that is a server function and the table did not need it.
--
-- Column grants are the fix wherever the rule is "these columns, never
-- those" — the engine enforces them ahead of RLS and there is nothing to
-- keep in sync. A trigger is used only for (2), where the rule is about how
-- one column may change rather than whether it may.
--
-- Nothing the app does is affected: every server function writes only the
-- columns its feature owns, and everything else goes through a SECURITY
-- DEFINER function, which runs as the table owner and so is not subject to
-- the authenticated grants at all.

-- ---------------------------------------------------------------------------
-- 1. custom_daps: authors own their draft, reviewers own its status
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE ON public.custom_daps FROM anon, authenticated;

-- What the "edit this DAP" screen sends, and nothing else. Creating one
-- goes through create_custom_dap(), which is where the Pro-plan gate and
-- the per-day cap live — direct inserts skipped both.
GRANT UPDATE (name, description, emoji, system_prompt, opener)
  ON public.custom_daps TO authenticated;

-- With INSERT revoked this policy can no longer admit anything, and leaving
-- it would suggest a direct insert is a supported path. It never was: the
-- app has always created Custom DAPs through create_custom_dap().
DROP POLICY IF EXISTS "Users insert own custom DAPs" ON public.custom_daps;

CREATE OR REPLACE FUNCTION public.guard_custom_dap_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- current_user, not auth.uid(): the legitimate writers here are SECURITY
  -- DEFINER functions *called by the author*, so their auth.uid() is the
  -- author's. What separates them from a direct REST write is the role they
  -- run as — the table owner, rather than anon/authenticated.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Editing what a reviewer approved sends it back to the start. Without
  -- this, "get approved, then swap the prompt" is a single request against
  -- everyone who installs it afterwards.
  IF (NEW.name, NEW.emoji, NEW.description, NEW.opener, NEW.system_prompt)
     IS DISTINCT FROM
     (OLD.name, OLD.emoji, OLD.description, OLD.opener, OLD.system_prompt)
     AND (OLD.published OR OLD.moderation_status IN ('approved', 'pending'))
  THEN
    NEW.published         := false;
    NEW.moderation_status := 'draft';
    NEW.reviewed_hash     := NULL;
    NEW.submitted_at      := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_daps_author_guard ON public.custom_daps;
CREATE TRIGGER custom_daps_author_guard
BEFORE UPDATE ON public.custom_daps
FOR EACH ROW EXECUTE FUNCTION public.guard_custom_dap_writes();

-- Belt and braces on the read side: installable means published *and*
-- approved. "published" alone was the state (1) could manufacture.
CREATE OR REPLACE FUNCTION public.install_custom_dap(_source_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  src public.custom_daps;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO src FROM public.custom_daps
   WHERE id = _source_id
     AND published = true
     AND moderation_status = 'approved';
  IF src.id IS NULL THEN
    RAISE EXCEPTION 'That Custom AI is not available';
  END IF;

  IF EXISTS (SELECT 1 FROM public.custom_daps
              WHERE user_id = auth.uid() AND source_id = _source_id) THEN
    RAISE EXCEPTION 'You already installed that Custom AI';
  END IF;

  INSERT INTO public.custom_daps
    (user_id, name, description, emoji, system_prompt, opener, source_id, mcp_url)
  VALUES
    (auth.uid(), src.name, src.description, src.emoji, src.system_prompt,
     src.opener, _source_id, src.mcp_url)
  RETURNING id INTO new_id;

  UPDATE public.custom_daps
     SET install_count = install_count + 1
   WHERE id = _source_id;

  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. custom_tracks: close INSERT the way UPDATE was already closed
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE ON public.custom_tracks FROM anon, authenticated;

-- verified_at, verified_time_ms and play_count are simply not granted, so
-- an insert that mentions them is refused outright. is_public is granted
-- because the track editor sends is_public: false explicitly, and forced to
-- false below so sending true achieves nothing.
GRANT INSERT (owner_id, name, season, params, goal, is_public)
  ON public.custom_tracks TO authenticated;
-- play_count is dropped from the UPDATE set it used to be in: nothing in
-- the app writes it, and a track's own owner setting it is only ever
-- inflation.
GRANT UPDATE (name, season, params, goal)
  ON public.custom_tracks TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_custom_track_inserts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- A track becomes public through set_track_published(), which will not
  -- publish one nobody has driven to the finish.
  NEW.is_public := false;
  RETURN NEW;
END;
$$;

-- Sorted ahead of custom_tracks_quota and custom_tracks_reset_verification
-- so it settles the row before either of them looks at it.
DROP TRIGGER IF EXISTS custom_tracks_author_guard ON public.custom_tracks;
CREATE TRIGGER custom_tracks_author_guard
BEFORE INSERT ON public.custom_tracks
FOR EACH ROW EXECUTE FUNCTION public.guard_custom_track_inserts();

-- ---------------------------------------------------------------------------
-- 3. track_scores: a lap time that is at least possible, and only improves
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE ON public.track_scores FROM anon, authenticated;

GRANT INSERT (user_id, track_ref, best_time_ms)
  ON public.track_scores TO authenticated;
GRANT UPDATE (best_time_ms) ON public.track_scores TO authenticated;

-- The game runs in the browser, so a determined player can always report a
-- time they did not drive. What the database can insist on is that the
-- number is inside the range a lap can physically take, that the row keeps
-- the account and track it was written for, and that a personal best only
-- ever goes down.
ALTER TABLE public.track_scores
  DROP CONSTRAINT IF EXISTS track_scores_time_plausible;
ALTER TABLE public.track_scores
  ADD CONSTRAINT track_scores_time_plausible
  CHECK (best_time_ms BETWEEN 500 AND 600000);

CREATE OR REPLACE FUNCTION public.guard_track_score_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.best_time_ms > OLD.best_time_ms THEN
    RAISE EXCEPTION 'A personal best only goes down.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_scores_author_guard ON public.track_scores;
CREATE TRIGGER track_scores_author_guard
BEFORE UPDATE ON public.track_scores
FOR EACH ROW EXECUTE FUNCTION public.guard_track_score_writes();

-- ---------------------------------------------------------------------------
-- 4. Two functions a signed-out caller had no use for
-- ---------------------------------------------------------------------------

-- Both raise 'Sign in first.' before doing anything, so the grant bought
-- anon nothing except a reachable SECURITY DEFINER entry point.
REVOKE EXECUTE ON FUNCTION public.charge_pro_lite() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_usage() FROM anon;
