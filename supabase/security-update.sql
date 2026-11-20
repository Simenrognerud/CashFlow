-- Kjør denne BARE hvis du allerede har kjørt en eldre schema.sql.
-- (Ny database: bare kjør schema.sql, den inneholder alt.)

drop policy if exists "egen profil" on public.profiles;
create policy "les egen profil" on public.profiles
  for select using (auth.uid() = id);
create policy "endre egen profil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "egne vakter" on public.shifts;
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
