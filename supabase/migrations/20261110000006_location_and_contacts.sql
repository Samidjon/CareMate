-- Location sharing (opt-in, per helper, last known position only) and richer
-- facility contact details.

-- Location sharing ---------------------------------------------------------------

create type public.location_share_status as enum ('active', 'paused', 'revoked');

-- One row per patient and helper. Created only by the patient, never by an invitation.
create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  status public.location_share_status not null default 'active',
  activated_at timestamptz,
  paused_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, caregiver_id),
  check (patient_id <> caregiver_id)
);
create index location_shares_caregiver_idx on public.location_shares (caregiver_id) where status <> 'revoked';
create trigger set_updated_at before update on public.location_shares
  for each row execute function public.set_updated_at();

-- Only the latest position, never a history. "unavailable" records that the
-- device could not report, without touching the last known position.
create table public.patient_last_locations (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters real check (accuracy_meters is null or accuracy_meters between 0 and 100000),
  recorded_at timestamptz not null,
  device_state text not null default 'ok' check (device_state in ('ok', 'unavailable')),
  device_state_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.patient_last_locations
  for each row execute function public.set_updated_at();

-- True only while the patient shares with this helper and the helper link is active.
create function public.can_see_location(patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.location_shares s
    join public.caregiver_links l on l.patient_id = s.patient_id and l.caregiver_id = s.caregiver_id
    where s.patient_id = patient and s.caregiver_id = auth.uid()
      and s.status = 'active' and l.status = 'active'
  );
$$;

alter table public.location_shares enable row level security;
alter table public.patient_last_locations enable row level security;
revoke all on public.location_shares, public.patient_last_locations from anon, authenticated;
grant all on public.location_shares, public.patient_last_locations to service_role;

-- Both sides can see the sharing state; only the patient changes it (through the function below).
grant select on public.location_shares to authenticated;
create policy "patient sees own shares" on public.location_shares for select to authenticated using (patient_id = auth.uid());
create policy "helper sees shares with them" on public.location_shares for select to authenticated using (caregiver_id = auth.uid());

-- The patient writes their own position; a helper only reads it while sharing is active.
grant select, insert, update, delete on public.patient_last_locations to authenticated;
create policy "patient reads own location" on public.patient_last_locations for select to authenticated using (patient_id = auth.uid());
create policy "patient stores own location" on public.patient_last_locations for insert to authenticated with check (patient_id = auth.uid());
create policy "patient updates own location" on public.patient_last_locations for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient deletes own location" on public.patient_last_locations for delete to authenticated using (patient_id = auth.uid());
create policy "helper reads shared location" on public.patient_last_locations for select to authenticated
  using (public.can_see_location(patient_id));

-- The patient turns sharing on, pauses or revokes it for one helper. Sharing can
-- only start with someone already connected through an approved link.
create function public.set_location_share(caregiver uuid, new_status public.location_share_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if new_status <> 'revoked' and not exists (
    select 1 from public.caregiver_links
    where patient_id = auth.uid() and caregiver_id = caregiver and status = 'active'
  ) then
    raise exception 'not a connected helper' using errcode = 'P0002';
  end if;
  insert into public.location_shares (patient_id, caregiver_id, status, activated_at, paused_at, revoked_at)
  values (
    auth.uid(), caregiver, new_status,
    case when new_status = 'active' then now() end,
    case when new_status = 'paused' then now() end,
    case when new_status = 'revoked' then now() end
  )
  on conflict (patient_id, caregiver_id) do update set
    status = excluded.status,
    activated_at = case when excluded.status = 'active' then now() else public.location_shares.activated_at end,
    paused_at = case when excluded.status = 'paused' then now() else public.location_shares.paused_at end,
    revoked_at = case when excluded.status = 'revoked' then now() else null end;
end;
$$;

-- Ending a helper connection always ends location sharing with them too.
create function public.revoke_location_with_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'revoked' and old.status <> 'revoked' then
    update public.location_shares set status = 'revoked', revoked_at = now()
    where patient_id = new.patient_id and caregiver_id = new.caregiver_id and status <> 'revoked';
  end if;
  return new;
end;
$$;
create trigger revoke_location_with_link after update on public.caregiver_links
  for each row execute function public.revoke_location_with_link();

revoke all on function public.can_see_location(uuid) from public, anon;
revoke all on function public.set_location_share(uuid, public.location_share_status) from public, anon;
grant execute on function public.can_see_location(uuid) to authenticated;
grant execute on function public.set_location_share(uuid, public.location_share_status) to authenticated;

-- Facility contacts ----------------------------------------------------------------

create type public.contact_verification as enum ('officially_verified', 'provider_supplied', 'user_reported', 'unverified', 'unavailable');

-- Each number: { "display": "+998 73 244 93 93", "e164": "+998732449393" or null,
-- "type": "main|reception|appointments|emergency|pharmacy|mobile", "source": "...",
-- "verification": contact_verification, "verified_at": iso date or null }.
alter table public.medical_facilities
  add column if not exists phone_numbers jsonb not null default '[]'::jsonb check (jsonb_typeof(phone_numbers) = 'array'),
  add column if not exists contact_source text check (char_length(contact_source) <= 200),
  add column if not exists contact_verification_status public.contact_verification not null default 'unavailable',
  add column if not exists contact_verified_at timestamptz,
  add column if not exists contact_updated_at timestamptz;
