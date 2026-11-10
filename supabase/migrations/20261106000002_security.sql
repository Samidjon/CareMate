-- Row Level Security, helper functions and secure operations.
--
-- Principles:
--  * A patient sees and changes their own data.
--  * A caregiver only reaches a patient's data through an active link, per permission.
--  * An admin manages facilities and has NO policy on any medical table.
--  * Anything a client must not write directly goes through a checked function.

-- Helpers --------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.has_care_access(patient uuid, scope text) returns boolean
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
        when 'medications' then l.can_view_medications
        when 'appointments' then l.can_view_appointments
        when 'sos' then l.can_receive_sos
        when 'manage_reminders' then l.can_manage_reminders
        else false
      end
  );
$$;

-- New accounts ---------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, first_name, last_name, locale)
  values (
    new.id,
    -- Sign-up data comes from the client, so only these two roles can be chosen.
    case when requested = 'caregiver' then 'caregiver'::public.user_role else 'patient'::public.user_role end,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 100),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 100),
    case when new.raw_user_meta_data ->> 'locale' = 'ru' then 'ru' else 'uz' end
  );
  if (new.raw_user_meta_data ->> 'consent') = 'true' then
    insert into public.consent_records (user_id, consent_type, granted)
    values (new.id, 'data_processing', true);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody can raise their own privileges, whatever the policies allow.
create function public.protect_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'role cannot be changed by the user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Records who last changed shared data, so a caregiver's edit is never silent.
create function public.stamp_actor() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger stamp_actor before insert or update on public.medications
  for each row execute function public.stamp_actor();
create trigger stamp_actor before insert or update on public.medication_schedules
  for each row execute function public.stamp_actor();
create trigger stamp_actor before insert or update on public.appointments
  for each row execute function public.stamp_actor();

create function public.stamp_log_actor() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.acted_by := auth.uid();
  return new;
end;
$$;

create trigger stamp_log_actor before insert or update on public.medication_logs
  for each row execute function public.stamp_log_actor();

-- A schedule or log must belong to the same patient as its medication.
create function public.check_medication_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.medications m where m.id = new.medication_id and m.patient_id = new.patient_id
  ) then
    raise exception 'medication belongs to another patient' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_medication_owner before insert or update on public.medication_schedules
  for each row execute function public.check_medication_owner();
create trigger check_medication_owner before insert or update on public.medication_logs
  for each row execute function public.check_medication_owner();

-- Invitations ----------------------------------------------------------------

create function public.invitation_code_hash(code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(upper(trim(code)), 'UTF8')), 'hex');
$$;

-- Returns the code once. Unambiguous letters and digits, easy to read over the phone.
create function public.create_caregiver_invitation(
  view_profile boolean default true,
  view_health boolean default false,
  view_contacts boolean default true,
  view_medications boolean default false,
  view_appointments boolean default false,
  receive_sos boolean default true,
  manage_reminders boolean default false
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  i integer;
  random_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.caregiver_invitations
      where patient_id = auth.uid() and status = 'pending' and expires_at > now()) >= 10 then
    raise exception 'too many open invitations' using errcode = 'P0001';
  end if;
  -- 10 characters of 32 give 50 random bits. Bytes 6 and 8 of a UUID hold fixed bits, so they are skipped.
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11] loop
    code := code || substr(alphabet, get_byte(random_bytes, i) % 32 + 1, 1);
  end loop;
  insert into public.caregiver_invitations (
    patient_id, code_hash, can_view_profile, can_view_health, can_view_contacts,
    can_view_medications, can_view_appointments, can_receive_sos, can_manage_reminders
  ) values (
    auth.uid(), public.invitation_code_hash(code), view_profile, view_health, view_contacts,
    view_medications, view_appointments, receive_sos, manage_reminders
  );
  return code;
end;
$$;

create function public.accept_caregiver_invitation(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invitation public.caregiver_invitations;
  link_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into invitation from public.caregiver_invitations
    where code_hash = public.invitation_code_hash(code)
      and status = 'pending' and expires_at > now()
    for update;
  if not found then
    raise exception 'invitation is invalid or expired' using errcode = 'P0002';
  end if;
  if invitation.patient_id = auth.uid() then
    raise exception 'cannot accept your own invitation' using errcode = 'P0001';
  end if;
  insert into public.caregiver_links (
    patient_id, caregiver_id, status, revoked_at, can_view_profile, can_view_health, can_view_contacts,
    can_view_medications, can_view_appointments, can_receive_sos, can_manage_reminders
  ) values (
    invitation.patient_id, auth.uid(), 'active', null, invitation.can_view_profile, invitation.can_view_health,
    invitation.can_view_contacts, invitation.can_view_medications, invitation.can_view_appointments,
    invitation.can_receive_sos, invitation.can_manage_reminders
  )
  on conflict (patient_id, caregiver_id) do update set
    status = 'active', revoked_at = null,
    can_view_profile = excluded.can_view_profile, can_view_health = excluded.can_view_health,
    can_view_contacts = excluded.can_view_contacts, can_view_medications = excluded.can_view_medications,
    can_view_appointments = excluded.can_view_appointments, can_receive_sos = excluded.can_receive_sos,
    can_manage_reminders = excluded.can_manage_reminders
  returning id into link_id;
  update public.caregiver_invitations
    set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = invitation.id;
  return link_id;
end;
$$;

-- The patient revokes a link, or the caregiver steps away from it.
create function public.revoke_caregiver_link(link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.caregiver_links
    set status = 'revoked', revoked_at = now()
    where id = link and (patient_id = auth.uid() or caregiver_id = auth.uid());
  if not found then
    raise exception 'link not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Rate limiting: database-backed, because serverless functions share no memory.
create function public.check_rate_limit(limit_key text, max_hits integer, window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_hits integer;
begin
  insert into public.rate_limit_counters as c (key, window_start, hits)
  values (limit_key, now(), 1)
  on conflict (key) do update set
    window_start = case when c.window_start < now() - make_interval(secs => window_seconds) then now() else c.window_start end,
    hits = case when c.window_start < now() - make_interval(secs => window_seconds) then 1 else c.hits + 1 end
  returning hits into current_hits;
  return current_hits <= max_hits;
end;
$$;

-- Admin audit ----------------------------------------------------------------

create function public.audit_medical_facility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), lower(tg_op), 'medical_facilities', case when tg_op = 'DELETE' then old.id else new.id end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.audit_facility_accessibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id)
  values (
    auth.uid(), lower(tg_op), 'facility_accessibility',
    case when tg_op = 'DELETE' then old.facility_id else new.facility_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_medical_facility after insert or update or delete on public.medical_facilities
  for each row execute function public.audit_medical_facility();
create trigger audit_facility_accessibility after insert or update or delete on public.facility_accessibility
  for each row execute function public.audit_facility_accessibility();

-- Function access ------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_care_access(uuid, text) to authenticated;
grant execute on function public.create_caregiver_invitation(boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.accept_caregiver_invitation(text) to authenticated;
grant execute on function public.revoke_caregiver_link(uuid) to authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Table access ---------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- profiles: no insert (the sign-up trigger creates them) or delete (via the account deletion endpoint).
grant select on public.profiles to authenticated;
grant update (first_name, last_name, birth_date, locale, phone, city, district, accessibility) on public.profiles to authenticated;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "linked caregiver with permission" on public.profiles for select to authenticated
  using (public.has_care_access(id, 'profile'));
-- A patient needs the name and phone of the people they have let in.
create policy "patient sees own caregivers" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.caregiver_links l
    where l.caregiver_id = profiles.id and l.patient_id = auth.uid() and l.status = 'active'
  ));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update, delete on public.patient_health_info to authenticated;
create policy "own health info" on public.patient_health_info for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver reads health with permission" on public.patient_health_info for select to authenticated
  using (public.has_care_access(patient_id, 'health'));

grant select, insert on public.consent_records to authenticated;
create policy "own consents read" on public.consent_records for select to authenticated using (user_id = auth.uid());
create policy "own consents add" on public.consent_records for insert to authenticated with check (user_id = auth.uid());

-- Links and invitations are created only by the functions above.
grant select on public.caregiver_links to authenticated;
grant update (can_view_profile, can_view_health, can_view_contacts, can_view_medications, can_view_appointments, can_receive_sos, can_manage_reminders)
  on public.caregiver_links to authenticated;
create policy "either side reads link" on public.caregiver_links for select to authenticated
  using (patient_id = auth.uid() or caregiver_id = auth.uid());
create policy "patient sets permissions" on public.caregiver_links for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());

grant select on public.caregiver_invitations to authenticated;
grant update (status) on public.caregiver_invitations to authenticated;
create policy "patient reads own invitations" on public.caregiver_invitations for select to authenticated
  using (patient_id = auth.uid());
create policy "patient revokes invitation" on public.caregiver_invitations for update to authenticated
  using (patient_id = auth.uid() and status = 'pending') with check (patient_id = auth.uid() and status = 'revoked');

grant select, insert, update, delete on public.emergency_contacts to authenticated;
create policy "own contacts" on public.emergency_contacts for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver reads contacts with permission" on public.emergency_contacts for select to authenticated
  using (public.has_care_access(patient_id, 'contacts'));

-- Facilities: everyone reads active ones, only admins change them.
grant select on public.medical_facilities, public.facility_accessibility to anon, authenticated;
grant insert, update, delete on public.medical_facilities, public.facility_accessibility to authenticated;
create policy "public reads active facilities" on public.medical_facilities for select to anon, authenticated
  using (status = 'active');
create policy "admin reads all facilities" on public.medical_facilities for select to authenticated using (public.is_admin());
create policy "admin adds facilities" on public.medical_facilities for insert to authenticated with check (public.is_admin());
create policy "admin edits facilities" on public.medical_facilities for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes facilities" on public.medical_facilities for delete to authenticated using (public.is_admin());
create policy "public reads accessibility" on public.facility_accessibility for select to anon, authenticated
  using (exists (select 1 from public.medical_facilities f where f.id = facility_id and f.status = 'active'));
create policy "admin reads all accessibility" on public.facility_accessibility for select to authenticated using (public.is_admin());
create policy "admin adds accessibility" on public.facility_accessibility for insert to authenticated with check (public.is_admin());
create policy "admin edits accessibility" on public.facility_accessibility for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes accessibility" on public.facility_accessibility for delete to authenticated using (public.is_admin());

grant select, insert on public.facility_verification_logs to authenticated;
create policy "admin reads verification log" on public.facility_verification_logs for select to authenticated using (public.is_admin());
create policy "admin adds verification log" on public.facility_verification_logs for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());

grant select on public.admin_audit_logs to authenticated;
create policy "admin reads audit log" on public.admin_audit_logs for select to authenticated using (public.is_admin());

-- Medicines: the patient, or a caregiver with the matching permission.
grant select, insert, update, delete on public.medications, public.medication_schedules to authenticated;
create policy "own medications" on public.medications for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver reads medications" on public.medications for select to authenticated
  using (public.has_care_access(patient_id, 'medications'));
create policy "caregiver adds medications" on public.medications for insert to authenticated
  with check (public.has_care_access(patient_id, 'manage_reminders'));
create policy "caregiver edits medications" on public.medications for update to authenticated
  using (public.has_care_access(patient_id, 'manage_reminders'))
  with check (public.has_care_access(patient_id, 'manage_reminders'));

create policy "own schedules" on public.medication_schedules for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver reads schedules" on public.medication_schedules for select to authenticated
  using (public.has_care_access(patient_id, 'medications'));
create policy "caregiver adds schedules" on public.medication_schedules for insert to authenticated
  with check (public.has_care_access(patient_id, 'manage_reminders'));
create policy "caregiver edits schedules" on public.medication_schedules for update to authenticated
  using (public.has_care_access(patient_id, 'manage_reminders'))
  with check (public.has_care_access(patient_id, 'manage_reminders'));

-- Logs are history: nobody edits or deletes them, except the patient's account deletion.
grant select, insert on public.medication_logs to authenticated;
create policy "own logs read" on public.medication_logs for select to authenticated using (patient_id = auth.uid());
create policy "own logs add" on public.medication_logs for insert to authenticated with check (patient_id = auth.uid());
create policy "caregiver reads logs" on public.medication_logs for select to authenticated
  using (public.has_care_access(patient_id, 'medications'));
create policy "caregiver adds logs" on public.medication_logs for insert to authenticated
  with check (public.has_care_access(patient_id, 'manage_reminders'));

grant select, insert, update, delete on public.appointments to authenticated;
create policy "own appointments" on public.appointments for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver reads appointments" on public.appointments for select to authenticated
  using (public.has_care_access(patient_id, 'appointments'));
create policy "caregiver adds appointments" on public.appointments for insert to authenticated
  with check (public.has_care_access(patient_id, 'manage_reminders'));
create policy "caregiver edits appointments" on public.appointments for update to authenticated
  using (public.has_care_access(patient_id, 'manage_reminders'))
  with check (public.has_care_access(patient_id, 'manage_reminders'));

-- Reminders are created and sent by the server; the patient can only dismiss.
grant select on public.reminders to authenticated;
grant update (status) on public.reminders to authenticated;
create policy "own reminders" on public.reminders for select to authenticated using (patient_id = auth.uid());
create policy "dismiss own reminder" on public.reminders for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid() and status = 'dismissed');
create policy "caregiver reads reminders" on public.reminders for select to authenticated
  using (public.has_care_access(patient_id, 'medications'));

grant select, insert, delete on public.push_subscriptions to authenticated;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.emergency_events to authenticated;
grant update (status, resolved_at) on public.emergency_events to authenticated;
create policy "own emergency events" on public.emergency_events for select to authenticated using (patient_id = auth.uid());
create policy "raise own emergency" on public.emergency_events for insert to authenticated with check (patient_id = auth.uid());
create policy "close own emergency" on public.emergency_events for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "caregiver receives emergencies" on public.emergency_events for select to authenticated
  using (public.has_care_access(patient_id, 'sos'));

grant select on public.emergency_notifications to authenticated;
create policy "patient reads delivery status" on public.emergency_notifications for select to authenticated
  using (patient_id = auth.uid());
create policy "recipient reads own notification" on public.emergency_notifications for select to authenticated
  using (recipient_id = auth.uid());

-- rate_limit_counters: no policies and no grants; only the server can reach it.
