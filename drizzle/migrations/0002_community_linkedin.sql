CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_known_session(_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _id = ANY (ARRAY['mi01','mi00','mi02','mi03','mi04','mi05','mi06','mi07','mi08','mi09','do00','do01','do02','do03','do04','do05','do06','do07','do08','do09','do10','do11','do-p1','do12','do13','do14','do15','do16','do17','do18','do19','do20','do-p2','do21','do-p3','do22','do23','do24','do25','do26','do27','do28','do29','do30','do-p4','do31','do31b','do32','do33','fr00','fr01','fr02','fr03','fr-p1','fr04','fr05','fr06','fr07','fr08','fr09','fr10','fr11','fr05b','fr-p2','fr12','fr13','fr14','fr15','fr16','fr17','fr18','fr19','fr20','fr21','fr-p3','fr22','fr23','fr24','fr25','fr26','fr27','fr28','fr29','fr30','fr31','sa00','sa01','sa02','sa03','sa04','sa04b','sa-end']::text[])
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  linkedin_sub text UNIQUE,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2000),
  role_title text CHECK (role_title IS NULL OR char_length(role_title) <= 80),
  organisation text CHECK (organisation IS NULL OR char_length(organisation) <= 80),
  linkedin_url text CHECK (linkedin_url IS NULL OR (char_length(linkedin_url) <= 200 AND linkedin_url ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9_%.-]+/?$')),
  visible boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  hidden_by_admin boolean NOT NULL DEFAULT false,
  profile_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.linkedin_sub := OLD.linkedin_sub;
    NEW.avatar_url := OLD.avatar_url;
    IF NEW.hidden_by_admin IS DISTINCT FROM OLD.hidden_by_admin AND NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.hidden_by_admin := OLD.hidden_by_admin;
    END IF;
  END IF;
  IF NEW.visible AND NEW.consent_at IS NULL THEN
    RAISE EXCEPTION 'consent required';
  END IF;
  IF NOT NEW.visible THEN NEW.consent_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

CREATE TABLE public.attendance (
  user_id uuid NOT NULL,
  session_id text NOT NULL CHECK (public.is_known_session(session_id)),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attendance read" ON public.attendance FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own attendance insert" ON public.attendance FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own attendance update" ON public.attendance FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own attendance delete" ON public.attendance FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  nonce text NOT NULL,
  return_path text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.community_public()
RETURNS TABLE (user_id uuid, display_name text, avatar_url text, role_title text, organisation text, linkedin_url text, session_ids text[], hidden boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.role_title, p.organisation, p.linkedin_url,
    COALESCE((SELECT array_agg(a.session_id ORDER BY a.session_id) FROM public.attendance a WHERE a.user_id = p.id AND a.is_public), '{}'::text[]),
    p.hidden_by_admin
  FROM public.profiles p
  WHERE p.visible AND p.consent_at IS NOT NULL
    AND (NOT p.hidden_by_admin OR public.has_role(auth.uid(), 'admin'))
  ORDER BY p.display_name
$$;
REVOKE ALL ON FUNCTION public.community_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_public() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_hidden(_user_id uuid, _hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET hidden_by_admin = _hidden WHERE id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_hidden(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_hidden(uuid, boolean) TO authenticated;