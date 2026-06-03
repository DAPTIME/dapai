REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name) ON public.profiles TO authenticated;