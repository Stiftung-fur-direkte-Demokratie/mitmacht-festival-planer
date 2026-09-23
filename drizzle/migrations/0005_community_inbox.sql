ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accept_messages boolean NOT NULL DEFAULT true;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_push_at timestamptz,
  last_push_to uuid,
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
CREATE INDEX conversations_b_idx ON public.conversations(user_b);
CREATE INDEX conversations_creator_idx ON public.conversations(created_by, created_at);
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);
CREATE INDEX messages_sender_idx ON public.messages(sender_id, created_at);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)));

CREATE TABLE public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT ON public.conversation_reads TO authenticated;
GRANT ALL ON public.conversation_reads TO service_role;
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reads" ON public.conversation_reads FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON public.blocks(blocked_id);
GRANT SELECT ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks" ON public.blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());

CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  message_body_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.message_reports TO authenticated;
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read reports" ON public.message_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_blocked_pair(_a uuid, _b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a))
$$;

CREATE OR REPLACE FUNCTION public._mm_send(_conv uuid, _uid uuid, _body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.conversations; partner uuid; b text; mid uuid; do_push boolean := false;
BEGIN
  b := btrim(coalesce(_body, ''));
  IF char_length(b) < 1 OR char_length(b) > 1000 THEN RAISE EXCEPTION 'mm:body'; END IF;
  SELECT * INTO c FROM public.conversations WHERE id = _conv FOR UPDATE;
  IF c.id IS NULL OR (_uid <> c.user_a AND _uid <> c.user_b) THEN RAISE EXCEPTION 'mm:notfound'; END IF;
  partner := CASE WHEN c.user_a = _uid THEN c.user_b ELSE c.user_a END;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND NOT hidden_by_admin) THEN RAISE EXCEPTION 'mm:sender_hidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = partner) THEN RAISE EXCEPTION 'mm:gone'; END IF;
  IF public.is_blocked_pair(_uid, partner) THEN RAISE EXCEPTION 'mm:blocked'; END IF;
  IF (SELECT count(*) FROM public.messages WHERE sender_id = _uid AND created_at > now() - interval '10 minutes') >= 20 THEN
    RAISE EXCEPTION 'mm:rate_msg';
  END IF;
  INSERT INTO public.messages(conversation_id, sender_id, body) VALUES (_conv, _uid, b) RETURNING id INTO mid;
  IF c.last_push_at IS NULL OR c.last_push_to IS DISTINCT FROM partner OR c.last_push_at < now() - interval '2 minutes' THEN
    do_push := true;
  END IF;
  UPDATE public.conversations SET last_message_at = now(),
    last_push_at = CASE WHEN do_push THEN now() ELSE last_push_at END,
    last_push_to = CASE WHEN do_push THEN partner ELSE last_push_to END
  WHERE id = _conv;
  INSERT INTO public.conversation_reads(conversation_id, user_id, last_read_at) VALUES (_conv, _uid, now())
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now();
  RETURN jsonb_build_object('conversation_id', _conv, 'message_id', mid, 'recipient', partner, 'push', do_push);
END $$;
REVOKE ALL ON FUNCTION public._mm_send(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_message(_conversation_id uuid, _body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  RETURN public._mm_send(_conversation_id, uid, _body);
END $$;

CREATE OR REPLACE FUNCTION public.start_conversation(_other uuid, _body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a uuid; bb uuid; cid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  IF _other IS NULL OR _other = uid THEN RAISE EXCEPTION 'mm:self'; END IF;
  a := least(uid, _other); bb := greatest(uid, _other);
  SELECT id INTO cid FROM public.conversations WHERE user_a = a AND user_b = bb;
  IF cid IS NOT NULL THEN RETURN public._mm_send(cid, uid, _body); END IF;
  IF char_length(btrim(coalesce(_body, ''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'mm:body'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND NOT hidden_by_admin) THEN RAISE EXCEPTION 'mm:sender_hidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _other AND visible AND consent_at IS NOT NULL AND NOT hidden_by_admin AND accept_messages) THEN
    RAISE EXCEPTION 'mm:not_reachable';
  END IF;
  IF public.is_blocked_pair(uid, _other) THEN RAISE EXCEPTION 'mm:blocked'; END IF;
  IF (SELECT count(*) FROM public.conversations WHERE created_by = uid AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'mm:rate_conv';
  END IF;
  INSERT INTO public.conversations(user_a, user_b, created_by) VALUES (a, bb, uid) RETURNING id INTO cid;
  RETURN public._mm_send(cid, uid, _body);
END $$;

CREATE OR REPLACE FUNCTION public.mark_read(_conversation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = _conversation_id AND (user_a = uid OR user_b = uid)) THEN RAISE EXCEPTION 'mm:notfound'; END IF;
  INSERT INTO public.conversation_reads(conversation_id, user_id, last_read_at) VALUES (_conversation_id, uid, now())
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.inbox() RETURNS TABLE(
  conversation_id uuid, partner_id uuid, display_name text, avatar_url text, role_title text, organisation text,
  linkedin_url text, partner_exists boolean, last_body text, last_sender uuid, last_message_at timestamptz,
  unread integer, blocked_me boolean, can_reply boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  cs AS (
    SELECT c.*, CASE WHEN c.user_a = me.uid THEN c.user_b ELSE c.user_a END AS partner, me.uid
    FROM public.conversations c, me
    WHERE me.uid IS NOT NULL AND (c.user_a = me.uid OR c.user_b = me.uid)
  )
  SELECT cs.id, cs.partner, coalesce(p.display_name, 'Konto gelöscht'), p.avatar_url, p.role_title, p.organisation,
    p.linkedin_url, p.id IS NOT NULL, lm.body, lm.sender_id, cs.last_message_at,
    (SELECT count(*)::int FROM public.messages m WHERE m.conversation_id = cs.id AND m.sender_id <> cs.uid
       AND m.created_at > coalesce((SELECT r.last_read_at FROM public.conversation_reads r WHERE r.conversation_id = cs.id AND r.user_id = cs.uid), '-infinity')),
    EXISTS (SELECT 1 FROM public.blocks bl WHERE bl.blocker_id = cs.partner AND bl.blocked_id = cs.uid),
    p.id IS NOT NULL AND NOT public.is_blocked_pair(cs.uid, cs.partner)
      AND EXISTS (SELECT 1 FROM public.profiles s WHERE s.id = cs.uid AND NOT s.hidden_by_admin)
  FROM cs
  LEFT JOIN public.profiles p ON p.id = cs.partner
  JOIN LATERAL (SELECT m.body, m.sender_id FROM public.messages m WHERE m.conversation_id = cs.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
  WHERE NOT EXISTS (SELECT 1 FROM public.blocks bl WHERE bl.blocker_id = cs.uid AND bl.blocked_id = cs.partner)
  ORDER BY cs.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.block_user(_other uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  IF _other IS NULL OR _other = uid THEN RAISE EXCEPTION 'mm:self'; END IF;
  INSERT INTO public.blocks(blocker_id, blocked_id) VALUES (uid, _other) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.unblock_user(_other uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  DELETE FROM public.blocks WHERE blocker_id = auth.uid() AND blocked_id = _other;
END $$;

CREATE OR REPLACE FUNCTION public.my_blocks() RETURNS TABLE(user_id uuid, display_name text, avatar_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.blocked_id, coalesce(p.display_name, 'Konto gelöscht'), p.avatar_url, b.created_at
  FROM public.blocks b LEFT JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid() ORDER BY b.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.report_message(_message_id uuid, _reported uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.messages; target uuid; snap text; r text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'mm:auth'; END IF;
  r := left(btrim(coalesce(_reason, '')), 500);
  IF (SELECT count(*) FROM public.message_reports WHERE reporter_id = uid AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'mm:rate_report';
  END IF;
  IF _message_id IS NOT NULL THEN
    SELECT msg.* INTO m FROM public.messages msg JOIN public.conversations c ON c.id = msg.conversation_id
      WHERE msg.id = _message_id AND (c.user_a = uid OR c.user_b = uid);
    IF m.id IS NULL THEN RAISE EXCEPTION 'mm:notfound'; END IF;
    target := m.sender_id; snap := m.body;
  ELSE
    target := _reported;
    IF target IS NULL OR target = uid OR NOT EXISTS (
      SELECT 1 FROM public.conversations c WHERE (c.user_a = uid AND c.user_b = target) OR (c.user_b = uid AND c.user_a = target)
    ) THEN RAISE EXCEPTION 'mm:notfound'; END IF;
    SELECT string_agg(x.body, E'\n---\n') INTO snap FROM (
      SELECT msg.body FROM public.messages msg JOIN public.conversations c ON c.id = msg.conversation_id
      WHERE msg.sender_id = target AND (c.user_a = uid OR c.user_b = uid) ORDER BY msg.created_at DESC LIMIT 5) x;
  END IF;
  INSERT INTO public.message_reports(reporter_id, reported_user_id, message_id, reason, message_body_snapshot)
    VALUES (uid, target, _message_id, r, left(snap, 5000));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reports() RETURNS TABLE(
  id uuid, created_at timestamptz, reason text, message_body_snapshot text,
  reporter_name text, reported_user_id uuid, reported_name text, reported_hidden boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id, r.created_at, r.reason, r.message_body_snapshot,
    coalesce(pr.display_name, 'Konto gelöscht'), r.reported_user_id, coalesce(pt.display_name, 'Konto gelöscht'), coalesce(pt.hidden_by_admin, false)
  FROM public.message_reports r
  LEFT JOIN public.profiles pr ON pr.id = r.reporter_id
  LEFT JOIN public.profiles pt ON pt.id = r.reported_user_id
  ORDER BY r.created_at DESC LIMIT 200;
END $$;

DROP FUNCTION IF EXISTS public.community_public();
CREATE FUNCTION public.community_public()
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role_title text, organisation text, linkedin_url text, session_ids text[], hidden boolean, accept_messages boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.avatar_url, p.role_title, p.organisation, p.linkedin_url,
    COALESCE((SELECT array_agg(a.session_id ORDER BY a.session_id) FROM public.attendance a WHERE a.user_id = p.id AND a.is_public), '{}'::text[]),
    p.hidden_by_admin, p.accept_messages
  FROM public.profiles p
  WHERE p.visible AND p.consent_at IS NOT NULL
    AND (NOT p.hidden_by_admin OR public.has_role(auth.uid(), 'admin'))
  ORDER BY p.display_name
$function$;
GRANT EXECUTE ON FUNCTION public.community_public() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_conversation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inbox() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_blocks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_message(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_blocks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_message(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reports() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

DO $cron$
BEGIN
  PERFORM cron.unschedule('mm-message-retention') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mm-message-retention');
  PERFORM cron.schedule('mm-message-retention', '17 3 * * *',
    $job$DELETE FROM public.messages WHERE created_at < now() - interval '90 days';
DELETE FROM public.conversations c WHERE c.created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = c.id);$job$);
END $cron$;