-- Richer facility directory: more categories, sources for photos, corrections
-- reported by people, and places a person saves for later.

alter type public.facility_category add value if not exists 'dental';
alter type public.facility_category add value if not exists 'diagnostic';
alter type public.facility_category add value if not exists 'specialist';

alter table public.medical_facilities
  add column if not exists website text check (char_length(website) <= 300),
  add column if not exists specialities text[] not null default '{}',
  -- Where the record comes from at its source, e.g. "osm/node/123".
  add column if not exists provider_id text check (char_length(provider_id) <= 100),
  -- When the source data was last fetched (not the same as a person verifying it).
  add column if not exists source_updated_at timestamptz,
  -- Only real, licensed photographs, always with their author and licence.
  add column if not exists photo_url text check (char_length(photo_url) <= 1000),
  add column if not exists photo_page_url text check (char_length(photo_page_url) <= 1000),
  add column if not exists photo_author text check (char_length(photo_author) <= 300),
  add column if not exists photo_license text check (char_length(photo_license) <= 100),
  add constraint photo_needs_credit check (photo_url is null or (photo_author is not null and photo_license is not null));

create unique index if not exists medical_facilities_provider_idx on public.medical_facilities (provider_id) where provider_id is not null;

alter table public.facility_accessibility
  add column if not exists hearing_impairment_assistance boolean;

-- Corrections reported by users, reviewed by an administrator before anything changes.
create type public.report_status as enum ('open', 'accepted', 'rejected');

create table public.facility_reports (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.medical_facilities (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  topic text not null check (topic in ('closed', 'address', 'phone', 'hours', 'accessibility', 'other')),
  details text not null check (char_length(details) between 3 and 1000),
  status public.report_status not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facility_reports_open_idx on public.facility_reports (created_at) where status = 'open';
create trigger set_updated_at before update on public.facility_reports
  for each row execute function public.set_updated_at();

create table public.user_saved_facilities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  facility_id uuid not null references public.medical_facilities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, facility_id)
);

alter table public.facility_reports enable row level security;
alter table public.user_saved_facilities enable row level security;
revoke all on public.facility_reports, public.user_saved_facilities from anon, authenticated;
grant all on public.facility_reports, public.user_saved_facilities to service_role;

grant select, insert on public.facility_reports to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.facility_reports to authenticated;
create policy "report a problem" on public.facility_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "see own reports" on public.facility_reports for select to authenticated
  using (reporter_id = auth.uid());
create policy "admin reviews reports" on public.facility_reports for select to authenticated
  using (public.is_admin());
create policy "admin decides reports" on public.facility_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and reviewed_by = auth.uid());

grant select, insert, delete on public.user_saved_facilities to authenticated;
create policy "own saved places" on public.user_saved_facilities for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A home address the person types or confirms. Exact coordinates are never stored.
alter table public.profiles
  add column if not exists address text check (char_length(address) <= 300);
grant update (address) on public.profiles to authenticated;

-- Connection requests started by a helper. The patient sees who is asking, chooses
-- what to share, and approves or rejects. Nothing is shared before that.
create type public.request_status as enum ('pending', 'approved', 'rejected');

create table public.caregiver_requests (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  status public.request_status not null default 'pending',
  patient_id uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index caregiver_requests_caregiver_idx on public.caregiver_requests (caregiver_id);
create trigger set_updated_at before update on public.caregiver_requests
  for each row execute function public.set_updated_at();

alter table public.caregiver_requests enable row level security;
revoke all on public.caregiver_requests from anon, authenticated;
grant all on public.caregiver_requests to service_role;
grant select on public.caregiver_requests to authenticated;
create policy "helper sees own requests" on public.caregiver_requests for select to authenticated
  using (caregiver_id = auth.uid());
create policy "patient sees requests they decided" on public.caregiver_requests for select to authenticated
  using (patient_id = auth.uid());

create function public.create_caregiver_request() returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  random_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  i integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.caregiver_requests
      where caregiver_id = auth.uid() and status = 'pending' and expires_at > now()) >= 10 then
    raise exception 'too many open requests' using errcode = 'P0001';
  end if;
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11] loop
    code := code || substr(alphabet, get_byte(random_bytes, i) % 32 + 1, 1);
  end loop;
  insert into public.caregiver_requests (caregiver_id, code_hash) values (auth.uid(), public.invitation_code_hash(code));
  return code;
end;
$$;

-- Who is asking: the helper's name only, so the patient can recognise them.
create function public.preview_caregiver_request(code text)
returns table (first_name text, last_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select p.first_name, p.last_name
    from public.caregiver_requests r
    join public.profiles p on p.id = r.caregiver_id
    where r.code_hash = public.invitation_code_hash(code)
      and r.status = 'pending' and r.expires_at > now() and r.caregiver_id <> auth.uid();
end;
$$;

create function public.decide_caregiver_request(
  code text,
  approve boolean,
  view_profile boolean default true,
  view_health boolean default false,
  view_contacts boolean default true,
  view_medications boolean default false,
  view_appointments boolean default false,
  receive_sos boolean default true,
  manage_reminders boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  request public.caregiver_requests;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into request from public.caregiver_requests
    where code_hash = public.invitation_code_hash(code) and status = 'pending' and expires_at > now()
    for update;
  if not found then
    raise exception 'request is invalid or expired' using errcode = 'P0002';
  end if;
  if request.caregiver_id = auth.uid() then
    raise exception 'cannot approve your own request' using errcode = 'P0001';
  end if;
  update public.caregiver_requests
    set status = case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
        patient_id = auth.uid(), decided_at = now()
    where id = request.id;
  if approve then
    insert into public.caregiver_links (
      patient_id, caregiver_id, status, revoked_at, can_view_profile, can_view_health, can_view_contacts,
      can_view_medications, can_view_appointments, can_receive_sos, can_manage_reminders
    ) values (
      auth.uid(), request.caregiver_id, 'active', null, view_profile, view_health, view_contacts,
      view_medications, view_appointments, receive_sos, manage_reminders
    )
    on conflict (patient_id, caregiver_id) do update set
      status = 'active', revoked_at = null,
      can_view_profile = excluded.can_view_profile, can_view_health = excluded.can_view_health,
      can_view_contacts = excluded.can_view_contacts, can_view_medications = excluded.can_view_medications,
      can_view_appointments = excluded.can_view_appointments, can_receive_sos = excluded.can_receive_sos,
      can_manage_reminders = excluded.can_manage_reminders;
  end if;
end;
$$;

revoke all on function public.create_caregiver_request() from public, anon;
revoke all on function public.preview_caregiver_request(text) from public, anon;
revoke all on function public.decide_caregiver_request(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.create_caregiver_request() to authenticated;
grant execute on function public.preview_caregiver_request(text) to authenticated;
grant execute on function public.decide_caregiver_request(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
