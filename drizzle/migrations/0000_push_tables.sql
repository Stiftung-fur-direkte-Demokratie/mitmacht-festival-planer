CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  session_ids text[] NOT NULL DEFAULT '{}',
  lead_minutes int NOT NULL DEFAULT 10 CHECK (lead_minutes IN (5,10,15)),
  enabled boolean NOT NULL DEFAULT true,
  platform text NOT NULL DEFAULT 'desktop' CHECK (char_length(platform) <= 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_sent (
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, session_id)
);
GRANT ALL ON public.push_sent TO service_role;
ALTER TABLE public.push_sent ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL
);
GRANT ALL ON public.push_tests TO service_role;
ALTER TABLE public.push_tests ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_tests_due_idx ON public.push_tests(due_at);

REVOKE ALL ON public.push_subscriptions, public.push_sent, public.push_tests FROM anon, authenticated;