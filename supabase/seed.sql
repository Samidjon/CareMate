-- Demonstration facilities only. These places do not exist: every row is marked
-- is_demo and named DEMO, so they can never be taken for real clinics.
insert into public.medical_facilities
  (id, name_uz, name_ru, category, status, address, district, latitude, longitude, opening_hours, is_demo, data_source, verification_status)
values
  ('00000000-0000-4000-8000-000000000001', 'DEMO — Namunaviy shifoxona', 'DEMO — Образец больницы', 'hospital', 'active', 'DEMO manzil 1', 'Farg‘ona shahri', 40.3864, 71.7864, 'DEMO: 24/7', true, 'CareMate demo data', 'unverified'),
  ('00000000-0000-4000-8000-000000000002', 'DEMO — Namunaviy klinika', 'DEMO — Образец клиники', 'clinic', 'active', 'DEMO manzil 2', 'Farg‘ona shahri', 40.3912, 71.7790, 'DEMO: 08:00–18:00', true, 'CareMate demo data', 'unverified'),
  ('00000000-0000-4000-8000-000000000003', 'DEMO — Namunaviy poliklinika', 'DEMO — Образец поликлиники', 'polyclinic', 'active', 'DEMO manzil 3', 'Farg‘ona shahri', 40.3801, 71.7935, 'DEMO: 08:00–17:00', true, 'CareMate demo data', 'unverified'),
  ('00000000-0000-4000-8000-000000000004', 'DEMO — Namunaviy dorixona', 'DEMO — Образец аптеки', 'pharmacy', 'active', 'DEMO manzil 4', 'Farg‘ona shahri', 40.3845, 71.7755, 'DEMO: 09:00–21:00', true, 'CareMate demo data', 'unverified'),
  ('00000000-0000-4000-8000-000000000005', 'DEMO — Namunaviy tez yordam punkti', 'DEMO — Образец пункта скорой помощи', 'emergency', 'active', 'DEMO manzil 5', 'Farg‘ona shahri', 40.3950, 71.7880, 'DEMO: 24/7', true, 'CareMate demo data', 'unverified'),
  ('00000000-0000-4000-8000-000000000006', 'DEMO — Namunaviy reabilitatsiya markazi', 'DEMO — Образец реабилитационного центра', 'rehabilitation', 'active', 'DEMO manzil 6', 'Farg‘ona shahri', 40.3775, 71.7820, 'DEMO: 09:00–17:00', true, 'CareMate demo data', 'unverified')
on conflict (id) do nothing;

insert into public.facility_accessibility
  (facility_id, wheelchair_ramp, accessible_entrance, elevator, accessible_toilet, wheelchair_route, accessibility_verified, accessibility_notes)
values
  ('00000000-0000-4000-8000-000000000001', true, true, true, true, true, 'unverified', 'DEMO: example data, not a real place.'),
  ('00000000-0000-4000-8000-000000000002', true, true, null, null, null, 'unverified', 'DEMO: example data, not a real place.'),
  ('00000000-0000-4000-8000-000000000004', false, true, null, null, null, 'unverified', 'DEMO: example data, not a real place.')
on conflict (facility_id) do nothing;
