-- CareMate core schema. Row Level Security is enabled in the next migration.

create type public.user_role as enum ('patient', 'caregiver', 'admin');
create type public.link_status as enum ('active', 'revoked');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');
create type public.facility_category as enum ('hospital', 'clinic', 'polyclinic', 'pharmacy', 'emergency', 'rehabilitation');
create type public.verification_status as enum ('verified', 'partially_verified', 'unverified');
create type public.facility_status as enum ('active', 'closed', 'pending_review');
create type public.medication_log_status as enum ('taken', 'skipped', 'snoozed', 'need_help', 'missed');
create type public.reminder_kind as enum ('medication', 'missed_medication', 'appointment');
create type public.reminder_status as enum ('pending', 'sent', 'failed', 'dismissed');
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled');
create type public.emergency_status as enum ('active', 'cancelled', 'resolved');
create type public.delivery_status as enum ('preparing', 'sending', 'sent', 'failed', 'delivered', 'not_configured');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Accounts ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'patient',
  first_name text not null default '' check (char_length(first_name) <= 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  birth_date date check (birth_date > '1900-01-01'),
  locale text not null default 'uz' check (locale in ('uz', 'ru')),
  phone text check (phone ~ '^\+?[0-9]{7,15}$'),
  city text not null default 'Farg‘ona' check (char_length(city) <= 100),
  district text check (char_length(district) <= 100),
  accessibility jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kept apart from profiles: RLS works per row, and a helper allowed to see a
-- name and phone number must not thereby see medical details.
create table public.patient_health_info (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  blood_type text check (char_length(blood_type) <= 10),
  allergies text check (char_length(allergies) <= 2000),
  conditions text check (char_length(conditions) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  consent_type text not null check (char_length(consent_type) <= 60),
  granted boolean not null,
  version text not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, consent_type);

-- Caregivers ----------------------------------------------------------------

create table public.caregiver_invitations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  -- Only a hash is stored: the code itself is shown once, to the patient.
  code_hash text not null unique,
  status public.invitation_status not null default 'pending',
  can_view_profile boolean not null default true,
  can_view_health boolean not null default false,
  can_view_contacts boolean not null default true,
  can_view_medications boolean not null default false,
  can_view_appointments boolean not null default false,
  can_receive_sos boolean not null default true,
  can_manage_reminders boolean not null default false,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index caregiver_invitations_patient_idx on public.caregiver_invitations (patient_id);

create table public.caregiver_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  status public.link_status not null default 'active',
  can_view_profile boolean not null default true,
  can_view_health boolean not null default false,
  can_view_contacts boolean not null default true,
  can_view_medications boolean not null default false,
  can_view_appointments boolean not null default false,
  can_receive_sos boolean not null default true,
  can_manage_reminders boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, caregiver_id),
  check (patient_id <> caregiver_id)
);
create index caregiver_links_caregiver_idx on public.caregiver_links (caregiver_id) where status = 'active';

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  relationship text check (char_length(relationship) <= 60),
  priority smallint not null default 1 check (priority between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emergency_contacts_patient_idx on public.emergency_contacts (patient_id, priority);

-- Facilities ----------------------------------------------------------------

create table public.medical_facilities (
  id uuid primary key default gen_random_uuid(),
  name_uz text not null check (char_length(name_uz) between 1 and 200),
  name_ru text check (char_length(name_ru) <= 200),
  category public.facility_category not null,
  status public.facility_status not null default 'pending_review',
  address text check (char_length(address) <= 300),
  district text check (char_length(district) <= 100),
  city text not null default 'Farg‘ona',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  phone text check (char_length(phone) <= 40),
  opening_hours text check (char_length(opening_hours) <= 200),
  is_demo boolean not null default false,
  data_source text not null check (char_length(data_source) between 1 and 200),
  source_url text check (char_length(source_url) <= 500),
  verification_status public.verification_status not null default 'unverified',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medical_facilities_category_idx on public.medical_facilities (category) where status = 'active';
create index medical_facilities_location_idx on public.medical_facilities (latitude, longitude);

-- For each feature, null means "not known": never shown as present or absent.
create table public.facility_accessibility (
  facility_id uuid primary key references public.medical_facilities (id) on delete cascade,
  wheelchair_ramp boolean,
  accessible_entrance boolean,
  elevator boolean,
  accessible_toilet boolean,
  wheelchair_route boolean,
  visual_impairment_assistance boolean,
  accessibility_verified public.verification_status not null default 'unverified',
  accessibility_notes text check (char_length(accessibility_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.facility_verification_logs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.medical_facilities (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  previous_status public.verification_status,
  new_status public.verification_status not null,
  source text check (char_length(source) <= 500),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index facility_verification_logs_facility_idx on public.facility_verification_logs (facility_id, created_at desc);

-- Medicines -----------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  -- What the user typed from the doctor's prescription. Never calculated.
  instructions text check (char_length(instructions) <= 2000),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index medications_patient_idx on public.medications (patient_id) where is_active;

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  time_of_day time not null,
  -- ISO weekdays: 1 is Monday, 7 is Sunday.
  days_of_week smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[]),
  timezone text not null default 'Asia/Tashkent',
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medication_schedules_medication_idx on public.medication_schedules (medication_id);
create index medication_schedules_patient_idx on public.medication_schedules (patient_id) where is_active;

create table public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.medication_schedules (id) on delete set null,
  medication_id uuid not null references public.medications (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.medication_log_status not null,
  acted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medication_logs_patient_idx on public.medication_logs (patient_id, scheduled_for desc);
-- One final answer per dose; "remind later" may come any number of times before it.
create unique index medication_logs_final_idx on public.medication_logs (schedule_id, scheduled_for)
  where schedule_id is not null and status <> 'snoozed';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  facility_id uuid references public.medical_facilities (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  doctor_name text check (char_length(doctor_name) <= 200),
  notes text check (char_length(notes) <= 2000),
  starts_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_patient_idx on public.appointments (patient_id, starts_at);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reminder_kind not null,
  schedule_id uuid references public.medication_schedules (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  due_at timestamptz not null,
  status public.reminder_status not null default 'pending',
  attempts smallint not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'appointment') = (appointment_id is not null)),
  check ((kind <> 'appointment') = (schedule_id is not null))
);
-- Stops the scheduler from creating the same reminder twice.
create unique index reminders_schedule_due_idx on public.reminders (schedule_id, kind, due_at) where schedule_id is not null;
create unique index reminders_appointment_due_idx on public.reminders (appointment_id, due_at) where appointment_id is not null;
create index reminders_pending_idx on public.reminders (due_at) where status = 'pending';
create index reminders_patient_idx on public.reminders (patient_id, due_at desc);

-- Notifications and emergencies ---------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 300),
  auth text not null check (char_length(auth) <= 100),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  is_demo boolean not null default false,
  status public.emergency_status not null default 'active',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m real,
  manual_address text check (char_length(manual_address) <= 300),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index emergency_events_patient_idx on public.emergency_events (patient_id, created_at desc);

-- One row per person and channel, so each delivery reports its real status.
create table public.emergency_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.emergency_events (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('web_push', 'sms')),
  status public.delivery_status not null default 'preparing',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emergency_notifications_event_idx on public.emergency_notifications (event_id);
create index emergency_notifications_recipient_idx on public.emergency_notifications (recipient_id);

-- Administration and protection ---------------------------------------------

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  target_table text not null check (char_length(target_table) <= 80),
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);

create table public.rate_limit_counters (
  key text primary key check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null
);

-- updated_at on every table that has the column.
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t
    );
  end loop;
end;
$$;
