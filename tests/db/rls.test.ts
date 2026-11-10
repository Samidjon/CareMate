import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser } from "./harness";

let db: PGlite;
let patient: string;
let otherPatient: string;
let caregiver: string;
let stranger: string;
let admin: string;
let linkId: string;
let medicationId: string;

const denied = /row-level security|permission denied|cannot be changed|belongs to another/;

async function count(user: string | null, table: string, where = "true", params: unknown[] = []) {
  const rows = await as<{ n: number }>(db, user, `select count(*)::int as n from public.${table} where ${where}`, params);
  return rows[0].n;
}

async function invite(permissions: Record<string, boolean> = {}) {
  const names = Object.keys(permissions);
  const args = names.map((name, i) => `${name} => $${i + 1}`).join(", ");
  const rows = await as<{ code: string }>(
    db,
    patient,
    `select public.create_caregiver_invitation(${args}) as code`,
    names.map((name) => permissions[name]),
  );
  return rows[0].code;
}

beforeAll(async () => {
  db = await createDatabase();
  patient = await createUser(db, { role: "patient", first_name: "Aziza", consent: "true" });
  otherPatient = await createUser(db, { role: "patient" });
  caregiver = await createUser(db, { role: "caregiver", first_name: "Bobur" });
  stranger = await createUser(db, { role: "patient" });
  admin = await createUser(db, { role: "patient" });
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [admin]);

  await as(db, patient, `insert into public.patient_health_info (patient_id, allergies) values ($1, 'secret-allergy')`, [patient]);
  await as(db, patient, `insert into public.emergency_contacts (patient_id, name, phone) values ($1, 'Kontakt', '+998901112233')`, [patient]);
  const rows = await as<{ id: string }>(db, patient, `insert into public.medications (patient_id, name) values ($1, 'Dori') returning id`, [patient]);
  medicationId = rows[0].id;
  await as(db, patient, `insert into public.medication_schedules (medication_id, patient_id, time_of_day) values ($1, $2, '08:00')`, [medicationId, patient]);
  await as(db, patient, `insert into public.appointments (patient_id, title, starts_at) values ($1, 'Qabul', now() + interval '1 day')`, [patient]);
  await as(db, patient, `insert into public.emergency_events (patient_id, is_demo) values ($1, true)`, [patient]);
});

describe("sign-up", () => {
  it("creates a profile with the chosen role and records consent", async () => {
    const [profile] = await as<{ role: string; first_name: string }>(db, patient, `select role, first_name from public.profiles where id = $1`, [patient]);
    expect(profile).toEqual({ role: "patient", first_name: "Aziza" });
    expect(await count(patient, "consent_records", "user_id = $1", [patient])).toBe(1);
  });

  it("cannot be used to become an admin", async () => {
    const hacker = await createUser(db, { role: "admin" });
    const [profile] = await as<{ role: string }>(db, hacker, `select role from public.profiles where id = $1`, [hacker]);
    expect(profile.role).toBe("patient");
  });
});

describe("privilege escalation", () => {
  it("a user cannot change their own role", async () => {
    await expect(as(db, patient, `update public.profiles set role = 'admin' where id = $1`, [patient])).rejects.toThrow(denied);
  });

  it("a user cannot insert a profile for someone else", async () => {
    await expect(as(db, patient, `insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')`)).rejects.toThrow(denied);
  });

  it("a user cannot write the audit log or touch rate limits", async () => {
    await expect(as(db, patient, `insert into public.admin_audit_logs (action, target_table) values ('x', 'y')`)).rejects.toThrow(denied);
    await expect(as(db, patient, `select * from public.rate_limit_counters`)).rejects.toThrow(denied);
    await expect(as(db, patient, `select public.check_rate_limit('k', 1, 60)`)).rejects.toThrow(denied);
  });
});

describe("isolation between users", () => {
  const privateTables = [
    "patient_health_info", "emergency_contacts", "medications", "medication_schedules",
    "appointments", "emergency_events", "consent_records",
  ];

  it.each(privateTables)("a stranger and a visitor see nothing in %s", async (table) => {
    const owner = table === "consent_records" ? "user_id" : "patient_id";
    expect(await count(stranger, table, `${owner} = $1`, [patient])).toBe(0);
    await expect(count(null, table)).rejects.toThrow(denied);
  });

  it("the owner sees their own data", async () => {
    for (const table of ["patient_health_info", "emergency_contacts", "medications", "appointments"]) {
      expect(await count(patient, table, "patient_id = $1", [patient])).toBe(1);
    }
  });

  it("a stranger cannot read another profile", async () => {
    expect(await count(stranger, "profiles", "id = $1", [patient])).toBe(0);
  });

  it("a stranger cannot write into another patient's data", async () => {
    await expect(as(db, stranger, `insert into public.medications (patient_id, name) values ($1, 'x')`, [patient])).rejects.toThrow(denied);
    await expect(as(db, stranger, `insert into public.emergency_contacts (patient_id, name, phone) values ($1, 'x', '+998900000000')`, [patient])).rejects.toThrow(denied);
    await expect(as(db, stranger, `insert into public.emergency_events (patient_id) values ($1)`, [patient])).rejects.toThrow(denied);
    const updated = await as(db, stranger, `update public.medications set name = 'x' where patient_id = $1 returning id`, [patient]);
    expect(updated).toEqual([]);
  });

  it("a patient cannot attach a schedule to someone else's medicine", async () => {
    await expect(
      as(db, otherPatient, `insert into public.medication_schedules (medication_id, patient_id, time_of_day) values ($1, $2, '09:00')`, [medicationId, otherPatient]),
    ).rejects.toThrow(denied);
  });

  it("push subscriptions are private", async () => {
    await as(db, patient, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/1', 'k', 'a')`, [patient]);
    expect(await count(stranger, "push_subscriptions")).toBe(0);
    expect(await count(admin, "push_subscriptions")).toBe(0);
  });
});

describe("caregiver access", () => {
  it("has no access before an invitation is accepted", async () => {
    expect(await count(caregiver, "profiles", "id = $1", [patient])).toBe(0);
    expect(await count(caregiver, "emergency_contacts", "patient_id = $1", [patient])).toBe(0);
  });

  it("cannot create a link or an invitation directly", async () => {
    await expect(as(db, caregiver, `insert into public.caregiver_links (patient_id, caregiver_id) values ($1, $2)`, [patient, caregiver])).rejects.toThrow(denied);
    await expect(as(db, caregiver, `insert into public.caregiver_invitations (patient_id, code_hash) values ($1, 'x')`, [patient])).rejects.toThrow(denied);
  });

  it("an invitation stores only a hash of its code", async () => {
    const code = await invite();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
    const rows = await as<{ code_hash: string }>(db, patient, `select code_hash from public.caregiver_invitations where patient_id = $1`, [patient]);
    expect(rows.some((row) => row.code_hash.includes(code))).toBe(false);
  });

  it("a wrong code is refused", async () => {
    await expect(as(db, caregiver, `select public.accept_caregiver_invitation('WRONGCODE2')`)).rejects.toThrow(/invalid or expired/);
    expect(await count(caregiver, "profiles", "id = $1", [patient])).toBe(0);
  });

  it("an expired code is refused", async () => {
    const code = await invite();
    await db.query(`update public.caregiver_invitations set expires_at = now() - interval '1 minute' where code_hash = public.invitation_code_hash($1)`, [code]);
    await expect(as(db, caregiver, `select public.accept_caregiver_invitation($1)`, [code])).rejects.toThrow(/invalid or expired/);
  });

  it("the patient cannot accept their own invitation", async () => {
    const code = await invite();
    await expect(as(db, patient, `select public.accept_caregiver_invitation($1)`, [code])).rejects.toThrow(/your own/);
  });

  it("gets exactly the granted permissions after accepting", async () => {
    const code = await invite({ view_contacts: true, view_health: false, view_medications: false });
    const [row] = await as<{ id: string }>(db, caregiver, `select public.accept_caregiver_invitation($1) as id`, [code]);
    linkId = row.id;
    expect(await count(caregiver, "profiles", "id = $1", [patient])).toBe(1);
    expect(await count(caregiver, "emergency_contacts", "patient_id = $1", [patient])).toBe(1);
    expect(await count(caregiver, "emergency_events", "patient_id = $1", [patient])).toBe(1);
    expect(await count(caregiver, "patient_health_info", "patient_id = $1", [patient])).toBe(0);
    expect(await count(caregiver, "medications", "patient_id = $1", [patient])).toBe(0);
    expect(await count(caregiver, "appointments", "patient_id = $1", [patient])).toBe(0);
  });

  it("a code works only once", async () => {
    const code = await invite();
    await as(db, stranger, `select public.accept_caregiver_invitation($1)`, [code]);
    await expect(as(db, otherPatient, `select public.accept_caregiver_invitation($1)`, [code])).rejects.toThrow(/invalid or expired/);
    const [link] = await as<{ id: string }>(db, patient, `select id from public.caregiver_links where caregiver_id = $1`, [stranger]);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [link.id]);
  });

  it("the patient sees who has access", async () => {
    expect(await count(patient, "profiles", "id = $1", [caregiver])).toBe(1);
    expect(await count(patient, "caregiver_links", "caregiver_id = $1", [caregiver])).toBe(1);
  });

  it("cannot change their own permissions", async () => {
    const updated = await as(db, caregiver, `update public.caregiver_links set can_view_health = true where id = $1 returning id`, [linkId]);
    expect(updated).toEqual([]);
    expect(await count(caregiver, "patient_health_info", "patient_id = $1", [patient])).toBe(0);
  });

  it("a patient cannot redirect a link to another person", async () => {
    await expect(as(db, patient, `update public.caregiver_links set caregiver_id = $1 where id = $2`, [stranger, linkId])).rejects.toThrow(denied);
  });

  it("sees more only after the patient grants it", async () => {
    await as(db, patient, `update public.caregiver_links set can_view_health = true, can_view_medications = true where id = $1`, [linkId]);
    expect(await count(caregiver, "patient_health_info", "patient_id = $1", [patient])).toBe(1);
    expect(await count(caregiver, "medications", "patient_id = $1", [patient])).toBe(1);
  });

  it("viewing medicines does not allow changing them", async () => {
    const updated = await as(db, caregiver, `update public.medications set name = 'x' where id = $1 returning id`, [medicationId]);
    expect(updated).toEqual([]);
    await expect(as(db, caregiver, `insert into public.medications (patient_id, name) values ($1, 'x')`, [patient])).rejects.toThrow(denied);
  });

  it("changes made with permission are attributed to the caregiver", async () => {
    await as(db, patient, `update public.caregiver_links set can_manage_reminders = true where id = $1`, [linkId]);
    const [row] = await as<{ updated_by: string; created_by: string }>(
      db, caregiver,
      `update public.medications set instructions = 'kuniga bir marta' where id = $1 returning updated_by, created_by`,
      [medicationId],
    );
    expect(row.updated_by).toBe(caregiver);
    expect(row.created_by).toBe(patient);
    await as(db, patient, `update public.caregiver_links set can_manage_reminders = false where id = $1`, [linkId]);
  });

  it("a patient cannot read a caregiver's other patients", async () => {
    expect(await count(otherPatient, "caregiver_links", "caregiver_id = $1", [caregiver])).toBe(0);
  });

  it("loses all access the moment the link is revoked", async () => {
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
    for (const [table, column] of [
      ["profiles", "id"], ["patient_health_info", "patient_id"], ["emergency_contacts", "patient_id"],
      ["medications", "patient_id"], ["emergency_events", "patient_id"],
    ]) {
      expect(await count(caregiver, table, `${column} = $1`, [patient]), table).toBe(0);
    }
  });

  it("a stranger cannot revoke someone else's link", async () => {
    await expect(as(db, stranger, `select public.revoke_caregiver_link($1)`, [linkId])).rejects.toThrow(/not found/);
  });
});

describe("admin", () => {
  it("has no access to any medical or personal table", async () => {
    for (const table of [
      "patient_health_info", "emergency_contacts", "medications", "medication_schedules", "medication_logs",
      "appointments", "reminders", "emergency_events", "emergency_notifications", "push_subscriptions", "consent_records",
    ]) {
      expect(await count(admin, table), table).toBe(0);
    }
    expect(await count(admin, "profiles", "id = $1", [patient])).toBe(0);
  });

  it("can manage facilities, and every change is audited", async () => {
    const [facility] = await as<{ id: string }>(
      db, admin,
      `insert into public.medical_facilities (name_uz, category, latitude, longitude, data_source) values ('Test', 'clinic', 40.38, 71.78, 'test') returning id`,
    );
    await as(db, admin, `update public.medical_facilities set status = 'active' where id = $1`, [facility.id]);
    const log = await as<{ action: string; actor_id: string }>(db, admin, `select action, actor_id from public.admin_audit_logs where target_id = $1 order by created_at`, [facility.id]);
    expect(log.map((entry) => entry.action).sort()).toEqual(["insert", "update"]);
    expect(log[0].actor_id).toBe(admin);
  });

  it("the audit log cannot be altered, even by an admin", async () => {
    await expect(as(db, admin, `delete from public.admin_audit_logs`)).rejects.toThrow(denied);
    await expect(as(db, admin, `update public.admin_audit_logs set action = 'x'`)).rejects.toThrow(denied);
  });
});

describe("facilities", () => {
  it("are public to read, including for visitors", async () => {
    expect(await count(null, "medical_facilities")).toBeGreaterThanOrEqual(6);
  });

  it("every seeded facility is clearly marked as a demo", async () => {
    const rows = await as<{ name_uz: string; name_ru: string; is_demo: boolean; data_source: string }>(
      db, null, `select name_uz, name_ru, is_demo, data_source from public.medical_facilities where is_demo`,
    );
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect(row.name_uz).toMatch(/^DEMO/);
      expect(row.name_ru).toMatch(/^DEMO/);
      expect(row.data_source).toBeTruthy();
    }
  });

  it("drafts are hidden from the public", async () => {
    await as(db, admin, `insert into public.medical_facilities (name_uz, category, latitude, longitude, data_source) values ('Draft', 'clinic', 40.38, 71.78, 'test')`);
    expect(await count(null, "medical_facilities", "name_uz = 'Draft'")).toBe(0);
    expect(await count(admin, "medical_facilities", "name_uz = 'Draft'")).toBe(1);
  });

  it("only admins can change them", async () => {
    await expect(as(db, patient, `insert into public.medical_facilities (name_uz, category, latitude, longitude, data_source) values ('x', 'clinic', 1, 1, 'x')`)).rejects.toThrow(denied);
    const updated = await as(db, patient, `update public.medical_facilities set name_uz = 'x' returning id`);
    expect(updated).toEqual([]);
    await expect(as(db, null, `delete from public.medical_facilities`)).rejects.toThrow(denied);
  });
});

describe("medication history", () => {
  it("is append-only for the patient", async () => {
    await as(db, patient, `insert into public.medication_logs (medication_id, patient_id, scheduled_for, status) values ($1, $2, now(), 'taken')`, [medicationId, patient]);
    await expect(as(db, patient, `update public.medication_logs set status = 'skipped'`)).rejects.toThrow(denied);
    await expect(as(db, patient, `delete from public.medication_logs`)).rejects.toThrow(denied);
  });
});

describe("medication answers", () => {
  it("allow several snoozes but only one final answer per dose", async () => {
    const [schedule] = await as<{ id: string }>(db, patient, `select id from public.medication_schedules where medication_id = $1`, [medicationId]);
    const log = (status: string) =>
      as(db, patient, `insert into public.medication_logs (schedule_id, medication_id, patient_id, scheduled_for, status) values ($1, $2, $3, '2026-11-06 08:00+05', $4)`, [schedule.id, medicationId, patient, status]);
    await log("snoozed");
    await log("snoozed");
    await log("need_help");
    await log("need_help");
    await log("taken");
    await expect(log("skipped")).rejects.toThrow(/duplicate key/);
  });
});

describe("emergency events", () => {
  it("the owner can add an address and cancel, but not rewrite the event", async () => {
    const [event] = await as<{ id: string }>(db, patient, `insert into public.emergency_events (patient_id) values ($1) returning id`, [patient]);
    await as(db, patient, `update public.emergency_events set manual_address = 'Mustaqillik 5' where id = $1`, [event.id]);
    await as(db, patient, `update public.emergency_events set status = 'cancelled' where id = $1`, [event.id]);
    const [row] = await as<{ manual_address: string; status: string }>(db, patient, `select manual_address, status from public.emergency_events where id = $1`, [event.id]);
    expect(row).toEqual({ manual_address: "Mustaqillik 5", status: "cancelled" });
    await expect(as(db, patient, `update public.emergency_events set is_demo = true where id = $1`, [event.id])).rejects.toThrow(denied);
    await expect(as(db, patient, `update public.emergency_events set latitude = 1, longitude = 1 where id = $1`, [event.id])).rejects.toThrow(denied);
  });

  it("nobody else can change it", async () => {
    const [event] = await as<{ id: string }>(db, patient, `insert into public.emergency_events (patient_id) values ($1) returning id`, [patient]);
    const updated = await as(db, stranger, `update public.emergency_events set status = 'cancelled' where id = $1 returning id`, [event.id]);
    expect(updated).toEqual([]);
  });

  it("delivery status can only be written by the server", async () => {
    const [event] = await as<{ id: string }>(db, patient, `insert into public.emergency_events (patient_id) values ($1) returning id`, [patient]);
    await expect(as(db, patient, `insert into public.emergency_notifications (event_id, patient_id, channel, status) values ($1, $2, 'sms', 'delivered')`, [event.id, patient])).rejects.toThrow(denied);
    await as(db, null, `insert into public.emergency_notifications (event_id, patient_id, channel, status) values ($1, $2, 'sms', 'not_configured')`, [event.id, patient], "service_role");
    expect(await count(patient, "emergency_notifications", "event_id = $1", [event.id])).toBe(1);
  });
});

describe("generated facility data", () => {
  it("loads into the real schema, unverified and not marked as demo", async () => {
    await db.exec(readFileSync(path.resolve(__dirname, "../../supabase/facilities_osm.sql"), "utf8"));
    const rows = await as<{ verification_status: string; is_demo: boolean; data_source: string; source_url: string; last_verified_at: string | null }>(
      db, null, `select verification_status, is_demo, data_source, source_url, last_verified_at from public.medical_facilities where data_source = 'OpenStreetMap'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.verification_status).toBe("unverified");
      expect(row.is_demo).toBe(false);
      expect(row.last_verified_at).toBeNull();
      expect(row.source_url).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    }
  });

  it("can be loaded twice without duplicates", async () => {
    const before = await count(null, "medical_facilities");
    await db.exec(readFileSync(path.resolve(__dirname, "../../supabase/facilities_osm.sql"), "utf8"));
    expect(await count(null, "medical_facilities")).toBe(before);
  });
});

describe("rate limit", () => {
  it("blocks after the limit and resets after the window", async () => {
    const hit = async () => (await as<{ ok: boolean }>(db, null, `select public.check_rate_limit('test', 2, 3600) as ok`, [], "service_role"))[0].ok;
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(false);
    await db.query(`update public.rate_limit_counters set window_start = now() - interval '2 hours' where key = 'test'`);
    expect(await hit()).toBe(true);
  });
});

describe("account deletion", () => {
  it("removes all of the user's personal data", async () => {
    const leaving = await createUser(db, { consent: "true" });
    const [med] = await as<{ id: string }>(db, leaving, `insert into public.medications (patient_id, name) values ($1, 'x') returning id`, [leaving]);
    await as(db, leaving, `insert into public.medication_schedules (medication_id, patient_id, time_of_day) values ($1, $2, '08:00')`, [med.id, leaving]);
    await as(db, leaving, `insert into public.emergency_events (patient_id) values ($1)`, [leaving]);
    await as(db, leaving, `insert into public.patient_health_info (patient_id) values ($1)`, [leaving]);

    await db.query(`delete from auth.users where id = $1`, [leaving]);

    for (const [table, column] of [
      ["profiles", "id"], ["medications", "patient_id"], ["medication_schedules", "patient_id"],
      ["emergency_events", "patient_id"], ["patient_health_info", "patient_id"], ["consent_records", "user_id"],
    ]) {
      const result = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${column} = $1`, [leaving]);
      expect(result.rows[0].n, table).toBe(0);
    }
  });
});

describe("functions", () => {
  it("are not callable by visitors", async () => {
    await expect(as(db, null, `select public.create_caregiver_invitation()`)).rejects.toThrow(denied);
    await expect(as(db, null, `select public.accept_caregiver_invitation('x')`)).rejects.toThrow(denied);
  });

  it("every public table has row level security enabled", async () => {
    const result = await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(result.rows).toEqual([]);
  });
});
