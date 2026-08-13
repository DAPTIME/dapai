-- Study rooms: stop every signed-in user from listing every room (and its code).
DROP POLICY IF EXISTS "Signed in users can look up rooms" ON public.study_rooms;

CREATE POLICY "Members and hosts can view their rooms"
ON public.study_rooms
FOR SELECT
TO authenticated
USING (
  host_id = auth.uid()
  OR public.is_room_member(id, auth.uid())
);

-- Joining by code needs one narrow, definer-scoped lookup instead of broad reads.
CREATE OR REPLACE FUNCTION public.find_study_room_by_code(_code text)
RETURNS TABLE (id uuid, code text, name text, is_open boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code, r.name, r.is_open
  FROM public.study_rooms r
  WHERE r.code = upper(_code)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_study_room_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_study_room_by_code(text) TO authenticated, service_role;

-- Admin moderation of community-published Custom AI's.
CREATE POLICY "Admins can moderate published custom daps"
ON public.custom_daps
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));