create table public.push_config (
  id int primary key default 1 check (id = 1),
  cron_token text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
grant all on public.push_config to service_role;
revoke all on public.push_config from anon, authenticated;
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1);