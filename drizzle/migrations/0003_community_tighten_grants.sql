REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.attendance FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.oauth_states FROM anon, authenticated;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_hidden(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profiles_guard() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;