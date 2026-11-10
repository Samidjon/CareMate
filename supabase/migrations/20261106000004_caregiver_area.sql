-- Caregiver area: invitation preview, the list of people cared for, and a real
-- "I saw this" confirmation for emergencies.

-- Managing someone's reminders requires seeing them.
create or replace function public.has_care_access(patient uuid, scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.caregiver_links l
    where l.patient_id = patient
      and l.caregiver_id = auth.uid()
      and l.status = 'active'
      and case scope
        when 'profile' then l.can_view_profile
        when 'health' then l.can_view_health
        when 'contacts' then l.can_view_contacts
        when 'medications' then l.can_view_medications or l.can_manage_reminders
        when 'appointments' then l.can_view_appointments or l.can_manage_reminders
        when 'sos' then l.can_receive_sos
        when 'manage_reminders' then l.can_manage_reminders
        else false
      end
  );
$$;

-- What someone is agreeing to, before they accept. Reveals only the inviter's first name.
create function public.preview_caregiver_invitation(code text)
returns table (
  first_name text,
  can_view_profile boolean,
  can_view_health boolean,
  can_view_contacts boolean,
  can_view_medications boolean,
  can_view_appointments boolean,
  can_receive_sos boolean,
  can_manage_reminders boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select p.first_name, i.can_view_profile, i.can_view_health, i.can_view_contacts,
           i.can_view_medications, i.can_view_appointments, i.can_receive_sos, i.can_manage_reminders
    from public.caregiver_invitations i
    join public.profiles p on p.id = i.patient_id
    where i.code_hash = public.invitation_code_hash(code)
      and i.status = 'pending' and i.expires_at > now();
end;
$$;

-- A caregiver always needs to know whose card they are looking at, even when the
-- patient has not shared their full profile. So names come from here, not from profiles.
create function public.my_care_recipients()
returns table (
  link_id uuid,
  patient_id uuid,
  first_name text,
  last_name text,
  can_view_profile boolean,
  can_view_health boolean,
  can_view_contacts boolean,
  can_view_medications boolean,
  can_view_appointments boolean,
  can_receive_sos boolean,
  can_manage_reminders boolean
)
language sql stable security definer set search_path = '' as $$
  select l.id, l.patient_id, p.first_name, p.last_name, l.can_view_profile, l.can_view_health,
         l.can_view_contacts, l.can_view_medications, l.can_view_appointments, l.can_receive_sos, l.can_manage_reminders
  from public.caregiver_links l
  join public.profiles p on p.id = l.patient_id
  where l.caregiver_id = auth.uid() and l.status = 'active'
  order by p.first_name, p.last_name;
$$;

-- Set by the caregiver, so unlike a provider's status it means a person really saw it.
create table public.emergency_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.emergency_events (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, caregiver_id)
);
create index emergency_acknowledgements_patient_idx on public.emergency_acknowledgements (patient_id);

alter table public.emergency_acknowledgements enable row level security;
revoke all on public.emergency_acknowledgements from anon, authenticated;
grant all on public.emergency_acknowledgements to service_role;
grant select on public.emergency_acknowledgements to authenticated;
create policy "patient sees who acknowledged" on public.emergency_acknowledgements for select to authenticated
  using (patient_id = auth.uid());
create policy "caregiver sees own acknowledgement" on public.emergency_acknowledgements for select to authenticated
  using (caregiver_id = auth.uid());

create function public.acknowledge_emergency(event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select patient_id into owner from public.emergency_events where id = event;
  if owner is null or not public.has_care_access(owner, 'sos') then
    raise exception 'no access to this emergency' using errcode = '42501';
  end if;
  insert into public.emergency_acknowledgements (event_id, patient_id, caregiver_id)
  values (event, owner, auth.uid())
  on conflict (event_id, caregiver_id) do nothing;
end;
$$;

revoke all on function public.preview_caregiver_invitation(text) from public, anon;
revoke all on function public.my_care_recipients() from public, anon;
revoke all on function public.acknowledge_emergency(uuid) from public, anon;
grant execute on function public.preview_caregiver_invitation(text) to authenticated;
grant execute on function public.my_care_recipients() to authenticated;
grant execute on function public.acknowledge_emergency(uuid) to authenticated;
