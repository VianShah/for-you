-- New couples can only start a diary from an invite link (…/app/#invite=<token>), one diary per invite.
-- The label ("Couple 2: Rahul & Priya") is the only way to tell couples apart: the diaries themselves are unreadable here.
create table if not exists invites (
  token text primary key,
  label text not null,
  couple_id text references couples(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table invites enable row level security;

-- Goldies set by hand, for one couple only: { "BONUS": { name: [{ at, pts, why }] }, "SET_TO": { name: { at, to } } }.
alter table couples add column if not exists label text;
alter table couples add column if not exists rules jsonb not null default '{}'::jsonb;

-- The phones fetch this key to switch notifications on (public by design). The private half is added by hand.
insert into config (key, value) values ('vapid_public', 'BAtscJGZ_lyQig8866R2cuR_-rotxNMLBw9GgsimXVw9IxlsPV4yqLRpI803yI0iyF17qMhYEWMvL4k4nQLu5qU')
on conflict (key) do nothing;
-- Only the scheduler knows this, so nobody else can set off the tick function.
insert into config (key, value) values ('tick_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;
