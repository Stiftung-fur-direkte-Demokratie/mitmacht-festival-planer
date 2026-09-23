ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_email text, ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_contact_email_chk CHECK (contact_email IS NULL OR (char_length(contact_email) <= 254 AND contact_email = lower(btrim(contact_email)) AND contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_chk CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

DROP FUNCTION IF EXISTS public.community_public();
CREATE FUNCTION public.community_public()
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role_title text, organisation text, linkedin_url text, session_ids text[], hidden boolean, accept_messages boolean, contact_email text, phone text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.avatar_url, p.role_title, p.organisation, p.linkedin_url,
    COALESCE((SELECT array_agg(a.session_id ORDER BY a.session_id) FROM public.attendance a WHERE a.user_id = p.id AND a.is_public), '{}'::text[]),
    p.hidden_by_admin, p.accept_messages, p.contact_email, p.phone
  FROM public.profiles p
  WHERE p.visible AND p.consent_at IS NOT NULL
    AND (NOT p.hidden_by_admin OR public.has_role(auth.uid(), 'admin'))
  ORDER BY p.display_name
$function$;
GRANT EXECUTE ON FUNCTION public.community_public() TO anon, authenticated;

CREATE TABLE public.session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL CHECK (public.is_known_session(session_id)),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid NOT NULL,
  q_overall smallint NOT NULL CHECK (q_overall BETWEEN 1 AND 5),
  q_content smallint NOT NULL CHECK (q_content BETWEEN 1 AND 5),
  q_interaction smallint NOT NULL CHECK (q_interaction BETWEEN 1 AND 5),
  comment text NULL CHECK (comment IS NULL OR char_length(comment) <= 1000),
  share_name boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX session_feedback_user_uq ON public.session_feedback (session_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX session_feedback_client_uq ON public.session_feedback (session_id, client_id) WHERE user_id IS NULL;
GRANT ALL ON public.session_feedback TO service_role;
REVOKE ALL ON public.session_feedback FROM anon, authenticated;
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.session_feedback_anon_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.share_name := false; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_feedback_anon_guard BEFORE INSERT OR UPDATE ON public.session_feedback
FOR EACH ROW EXECUTE FUNCTION public.session_feedback_anon_guard();

CREATE TABLE public.feedback_writes (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_writes_key_at ON public.feedback_writes (key, at);
GRANT ALL ON public.feedback_writes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.feedback_writes_id_seq TO service_role;
REVOKE ALL ON public.feedback_writes FROM anon, authenticated;
ALTER TABLE public.feedback_writes ENABLE ROW LEVEL SECURITY;