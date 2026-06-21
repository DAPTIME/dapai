
-- DELETE: admin only
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- INSERT: only self, only safe defaults (privileged fields locked)
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND tier = 'free'
  AND pro_messages_used = 0
);

-- UPDATE: users can update their own profile (privileged field changes still blocked by prevent_profile_privileged_updates trigger)
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Extend the privilege guard to also cover INSERT
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot insert profile for another user';
  END IF;

  IF NEW.tier IS DISTINCT FROM 'free' OR NEW.pro_messages_used IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Cannot set privileged fields on insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privileged_inserts_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privileged_inserts_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_inserts();
