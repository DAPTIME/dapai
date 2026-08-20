-- People wait for the host to let them in.
--
-- Joining with a code used to put you straight into the room. A code is one
-- short string that spreads by being pasted, so anyone who ends up with it
-- is in — the host has no say after the moment they share it. This adds the
-- say: a join creates a pending membership, and the host approves or
-- declines it.
--
-- 'approved' is the default so every membership that already exists stays
-- exactly as it is. Nobody currently in a room is asked to re-ask.
ALTER TABLE public.study_room_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

ALTER TABLE public.study_room_members
  DROP CONSTRAINT IF EXISTS study_room_members_status_check;
ALTER TABLE public.study_room_members
  ADD CONSTRAINT study_room_members_status_check
  CHECK (status IN ('pending', 'approved'));

-- Reading a room, posting into it and being counted as present all mean
-- "approved", never merely "asked". is_room_member is what the RLS policies
-- on study_room_messages consult, so pending members can neither post nor
-- read by any route, not only in the UI.
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_room_members m
     WHERE m.room_id = _room_id
       AND m.user_id = _user_id
       AND m.status = 'approved'
  );
$$;

-- Unchanged in spirit: still granted to authenticated, because the policies
-- that call it run as the caller.
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS study_room_members_pending_idx
  ON public.study_room_members (room_id)
  WHERE status = 'pending';
