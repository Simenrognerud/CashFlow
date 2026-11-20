-- Kjør hele denne filen i Supabase → SQL Editor → New query → Run.

-- Profil: bare navn, timelønn og en hemmelig nøkkel for kalender-abonnementet.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  hourly_wage numeric(10,2) not null default 0,
  feed_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

-- Skatteprosent med "gjelder fra"-dato, så gamle måneder ikke endres.
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  valid_from date not null,
  percent numeric(5,2) not null check (percent >= 0 and percent < 100),
  unique (user_id, valid_from)
);

-- Vaktmaler (Dagvakt, Kveldsvakt …) med tilleggsregler som JSON.
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  color text not null default '#0f766e',
  bonuses jsonb not null default '[]'
);

-- Vakter i kalenderen. Kopierer malens verdier, så endringer i en mal
-- ikke endrer vakter som allerede er lagt inn.
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  template_id uuid references public.templates on delete set null,
  name text not null,
  color text not null,
  start_time time not null,
  end_time time not null,
  bonuses jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index shifts_user_date on public.shifts (user_id, date);

-- Row Level Security: hver bruker ser og endrer bare sine egne rader.
alter table public.profiles enable row level security;
alter table public.tax_rates enable row level security;
alter table public.templates enable row level security;
alter table public.shifts enable row level security;

-- Profil: kan bare leses og endres av eieren. Opprettes av triggeren under,
-- og kan ikke slettes fra appen (slettes automatisk hvis brukeren slettes).
create policy "les egen profil" on public.profiles
  for select using (auth.uid() = id);
create policy "endre egen profil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "egne skattesatser" on public.tax_rates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "egne maler" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- En vakt kan bare peke på brukerens egne maler.
create policy "egne vakter" on public.shifts
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (template_id is null or exists (
      select 1 from public.templates t where t.id = template_id and t.user_id = auth.uid()))
  );

-- Fornuftige grenser på dataene, så ingen kan lagre søppel eller enorme verdier via API-et.
alter table public.profiles
  add constraint display_name_len check (char_length(display_name) <= 50),
  add constraint wage_range check (hourly_wage between 0 and 10000);
alter table public.templates
  add constraint template_name_len check (char_length(name) between 1 and 50),
  add constraint template_color check (color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint template_bonuses check (jsonb_typeof(bonuses) = 'array' and jsonb_array_length(bonuses) <= 10);
alter table public.shifts
  add constraint shift_name_len check (char_length(name) between 1 and 50),
  add constraint shift_color check (color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint shift_bonuses check (jsonb_typeof(bonuses) = 'array' and jsonb_array_length(bonuses) <= 10);

-- Lag profil automatisk når noen registrerer seg.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Liten tabell som keep-alive-jobben kan lese fra (holder gratisprosjektet våkent).
create table public.heartbeat (id int primary key, note text);
insert into public.heartbeat values (1, 'ok');
alter table public.heartbeat enable row level security;
create policy "alle kan lese heartbeat" on public.heartbeat for select using (true);
