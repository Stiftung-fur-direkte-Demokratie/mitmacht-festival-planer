ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_morning_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_morning_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_evening_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_evening_email boolean NOT NULL DEFAULT false;

CREATE TABLE public.notification_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day text NOT NULL,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (user_id, kind, day, channel)
);
CREATE INDEX notification_log_user_sent ON public.notification_log (user_id, kind, sent_at);
GRANT ALL ON public.notification_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notification_log_id_seq TO service_role;
REVOKE ALL ON public.notification_log FROM anon, authenticated;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;