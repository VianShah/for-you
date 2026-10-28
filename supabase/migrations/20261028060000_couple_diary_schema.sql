-- One private diary per couple. The server never sees anything readable: pages, pictures and settings
-- are encrypted on the phones with a key only the couple's code can unlock. The tables below are only
-- touched by the edge functions (service role); RLS is on with no policies, so the public key can't read them.
create table if not exists couples (
  id text primary key,                 -- derived from the couple's code (not the code itself)
  auth_hash text not null,             -- sha-256 of a secret also derived from the code
  created_at timestamptz not null default now()
);
create table if not exists docs (     -- small encrypted files that change often (the page list, settings)
  couple_id text not null references couples(id) on delete cascade,
  path text not null,
  body text not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (couple_id, path)
);
create table if not exists push_subs ( -- which phones get notifications (no diary content here)
  endpoint text primary key,
  couple_id text not null references couples(id) on delete cascade,
  person text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_couple on push_subs (couple_id, person);
create table if not exists alerts (    -- notifications to send later ("Goldiee is crying"), set by the phones
  couple_id text not null references couples(id) on delete cascade,
  key text not null,
  at timestamptz not null,
  person text not null,
  title text not null,
  body text not null default '',
  url text not null default 'diary/',
  primary key (couple_id, key)
);
create index if not exists alerts_due on alerts (at);
create table if not exists config (key text primary key, value text not null);

alter table couples enable row level security;
alter table docs enable row level security;
alter table push_subs enable row level security;
alter table alerts enable row level security;
alter table config enable row level security;

-- Pictures, videos and voice notes: encrypted files, readable by URL (they're scrambled), written only
-- through signed upload links handed out by the couple function.
insert into storage.buckets (id, name, public, file_size_limit) values ('couples', 'couples', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;
