DROP POLICY IF EXISTS "Users update own profile name" ON public.profiles;
REVOKE UPDATE ON public.profiles FROM authenticated;