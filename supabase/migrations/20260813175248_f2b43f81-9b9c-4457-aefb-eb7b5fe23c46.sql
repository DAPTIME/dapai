-- ========== Custom AI marketplace ==========
ALTER TABLE public.custom_daps
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT 'A DAP user',
  ADD COLUMN IF NOT EXISTS install_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS mcp_url text;

CREATE INDEX IF NOT EXISTS custom_daps_published_idx
  ON public.custom_daps (published, install_count DESC);

DROP POLICY IF EXISTS "Anyone signed in can read published custom daps" ON public.custom_daps;
CREATE POLICY "Anyone signed in can read published custom daps"
  ON public.custom_daps FOR SELECT TO authenticated
  USING (published = true);

CREATE OR REPLACE FUNCTION public.install_custom_dap(_source_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.custom_daps;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO src FROM public.custom_daps
   WHERE id = _source_id AND published = true;
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

REVOKE ALL ON FUNCTION public.install_custom_dap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_custom_dap(uuid) TO authenticated;

-- ========== Study Rooms ==========
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Study Room',
  host_id uuid NOT NULL,
  model text NOT NULL DEFAULT 'dap-ai-lite',
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_room_members (
  room_id uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT 'Guest',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.study_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  author_name text NOT NULL DEFAULT 'DAP AI',
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_room_messages_room_idx
  ON public.study_room_messages (room_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_rooms TO authenticated;
GRANT ALL ON public.study_rooms TO service_role;
GRANT SELECT, INSERT, DELETE ON public.study_room_members TO authenticated;
GRANT ALL ON public.study_room_members TO service_role;
GRANT SELECT, INSERT ON public.study_room_messages TO authenticated;
GRANT ALL ON public.study_room_messages TO service_role;

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_room_members
     WHERE room_id = _room_id AND user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Signed in users can look up rooms" ON public.study_rooms;
CREATE POLICY "Signed in users can look up rooms"
  ON public.study_rooms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Signed in users can host a room" ON public.study_rooms;
CREATE POLICY "Signed in users can host a room"
  ON public.study_rooms FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "Hosts manage their rooms" ON public.study_rooms;
CREATE POLICY "Hosts manage their rooms"
  ON public.study_rooms FOR UPDATE TO authenticated
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "Hosts delete their rooms" ON public.study_rooms;
CREATE POLICY "Hosts delete their rooms"
  ON public.study_rooms FOR DELETE TO authenticated
  USING (host_id = auth.uid());

DROP POLICY IF EXISTS "Members can see who is in the room" ON public.study_room_members;
CREATE POLICY "Members can see who is in the room"
  ON public.study_room_members FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Users join rooms as themselves" ON public.study_room_members;
CREATE POLICY "Users join rooms as themselves"
  ON public.study_room_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.study_rooms r
                 WHERE r.id = room_id AND r.is_open = true)
  );

DROP POLICY IF EXISTS "Users can leave rooms" ON public.study_room_members;
CREATE POLICY "Users can leave rooms"
  ON public.study_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members read room messages" ON public.study_room_messages;
CREATE POLICY "Members read room messages"
  ON public.study_room_messages FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members post room messages" ON public.study_room_messages;
CREATE POLICY "Members post room messages"
  ON public.study_room_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'user'
    AND public.is_room_member(room_id, auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_members;