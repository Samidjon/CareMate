-- "I need help" is not a final answer: the person may still take the dose afterwards.
drop index public.medication_logs_final_idx;
create unique index medication_logs_final_idx on public.medication_logs (schedule_id, scheduled_for)
  where schedule_id is not null and status not in ('snoozed', 'need_help');

-- If location is unavailable, the person can type an address after the alert goes out.
grant update (manual_address) on public.emergency_events to authenticated;
