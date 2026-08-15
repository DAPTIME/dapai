-- Joining a room by code, and letting the owner close one down.
--
-- ── Why joining is now a single function ────────────────────────────────
--
-- The old path did the work in three steps from the browser's own key:
-- resolve the code through find_study_room_by_code, then upsert a row into
-- study_room_members. That upsert is an INSERT ... ON CONFLICT DO UPDATE,
-- so it needs the INSERT privilege, the INSERT policy, the UPDATE
-- privilege and the UPDATE policy all to line up — four things, spread
-- across three migrations, any one of which failing produces the same
-- silent "join didn't work".
--
-- join_study_room_by_code() does the lookup and the membership in one
-- SECURITY DEFINER call. It still refuses everything it should: you join
-- as yourself, only rooms that exist, only rooms that are open, and only
-- rooms that have not been deleted. But it cannot be defeated by a grant
-- that went missing, because it does not depend on the caller's grants at
-- all.

-- ── Soft delete ─────────────────────────────────────────────────────────
--
-- Deleted rather than dropped, because a row that is gone cannot tell the
-- people who were in it why. The room page reads these columns to show the
-- notice; a hard DELETE would just give everyone "no room with that code",
-- which reads as a bug rather than as a decision.
ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.study_rooms.deleted_at IS
  'Set when an admin closes the room down. The room stays in the table so its members can be told why it is gone.';

-- ── Joining ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_study_room_by_code(_code text)
RETURNS TABLE (id uuid, code text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r public.study_rooms%ROWTYPE;
  v_name text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to join a study room.';
  END IF;

  SELECT * INTO r FROM public.study_rooms
   WHERE study_rooms.code = upper(trim(_code))
   LIMIT 1;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'No study room with that code.';
  END IF;
  IF r.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sorry, this room has been deleted by the admin. Please contact us for any inquiries.';
  END IF;
  IF NOT r.is_open THEN
    RAISE EXCEPTION 'That study room has been closed.';
  END IF;

  -- Prefer the profile name; fall back rather than failing the join, since
  -- a missing display name is not a reason to keep someone out.
  SELECT COALESCE(NULLIF(TRIM(p.name), ''), split_part(COALESCE(p.email, ''), '@', 1), 'Guest')
    INTO v_name
    FROM public.profiles p WHERE p.id = uid;

  INSERT INTO public.study_room_members (room_id, user_id, display_name)
  VALUES (r.id, uid, COALESCE(v_name, 'Guest'))
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET display_name = EXCLUDED.display_name;

  RETURN QUERY SELECT r.id, r.code, r.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_study_room_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_study_room_by_code(text) TO authenticated;

-- A deleted room is not joinable through the older path either.
CREATE OR REPLACE FUNCTION public.can_join_study_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_rooms
    WHERE id = _room_id AND is_open = true AND deleted_at IS NULL
  );
$$;

-- ── The owner's view ────────────────────────────────────────────────────
--
-- Admin is profiles.site_admin, checked inside the function rather than
-- trusted from the caller.
CREATE OR REPLACE FUNCTION public.admin_list_study_rooms()
RETURNS TABLE (
  id uuid, code text, name text, model text,
  is_open boolean, created_at timestamptz,
  deleted_at timestamptz,
  host_name text, member_count bigint, message_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT site_admin FROM public.profiles WHERE profiles.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  RETURN QUERY
  SELECT r.id, r.code, r.name, r.model, r.is_open, r.created_at, r.deleted_at,
         COALESCE(NULLIF(TRIM(p.name), ''), p.email, 'Unknown'),
         (SELECT count(*) FROM public.study_room_members m WHERE m.room_id = r.id),
         (SELECT count(*) FROM public.study_room_messages g WHERE g.room_id = r.id)
  FROM public.study_rooms r
  LEFT JOIN public.profiles p ON p.id = r.host_id
  ORDER BY r.deleted_at NULLS FIRST, r.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_study_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_study_rooms() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_study_room(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT site_admin FROM public.profiles WHERE profiles.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  UPDATE public.study_rooms
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         is_open = false
   WHERE id = _id AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_study_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_study_room(uuid) TO authenticated;

-- Restoring, because deleting the wrong room by one misread code is an
-- easy mistake and a soft delete makes it a recoverable one.
CREATE OR REPLACE FUNCTION public.admin_restore_study_room(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT site_admin FROM public.profiles WHERE profiles.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  UPDATE public.study_rooms
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = _id AND deleted_at IS NOT NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_restore_study_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_study_room(uuid) TO authenticated;

-- Posting to a deleted room stops as well; otherwise a tab left open keeps
-- talking to a room the owner has closed down.
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_room_members m
    JOIN public.study_rooms r ON r.id = m.room_id
    WHERE m.room_id = _room_id
      AND m.user_id = _user_id
      AND r.deleted_at IS NULL
  );
$$;
