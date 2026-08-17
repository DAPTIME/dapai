ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

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
     SET deleted_at = now(), deleted_by = auth.uid(), is_open = false
   WHERE id = _id AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_study_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_study_room(uuid) TO authenticated;

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