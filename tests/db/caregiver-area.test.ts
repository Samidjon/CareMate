import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser } from "./harness";

let db: PGlite;
let patient: string;
let caregiver: string;
let stranger: string;

const denied = /row-level security|permission denied|no access/;

type Recipient = { patient_id: string; first_name: string; can_view_health: boolean };

async function invite(args = "") {
  const [row] = await as<{ code: string }>(db, patient, `select public.create_caregiver_invitation(${args}) as code`);
  return row.code;
}

async function link(args = "") {
  const code = await invite(args);
  const [row] = await as<{ id: string }>(db, caregiver, `select public.accept_caregiver_invitation($1) as id`, [code]);
  return row.id;
}

beforeAll(async () => {
  db = await createDatabase();
  patient = await createUser(db, { first_name: "Aziza", last_name: "Karimova" });
  caregiver = await createUser(db, { role: "caregiver", first_name: "Bobur" });
  stranger = await createUser(db, { first_name: "Stranger" });
});

describe("invitation preview", () => {
  it("shows the first name and permissions, and changes nothing", async () => {
    const code = await invite("view_health => true");
    const rows = await as<Record<string, unknown>>(db, caregiver, `select * from public.preview_caregiver_invitation($1)`, [code]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ first_name: "Aziza", can_view_health: true, can_view_medications: false });
    expect(Object.keys(rows[0])).not.toContain("last_name");
    expect((await as(db, caregiver, `select public.my_care_recipients()`)).length).toBe(0);
  });

  it("returns nothing for a wrong or expired code", async () => {
    expect(await as(db, caregiver, `select * from public.preview_caregiver_invitation('WRONGCODE2')`)).toEqual([]);
    const code = await invite();
    await db.query(`update public.caregiver_invitations set expires_at = now() - interval '1 minute' where code_hash = public.invitation_code_hash($1)`, [code]);
    expect(await as(db, caregiver, `select * from public.preview_caregiver_invitation($1)`, [code])).toEqual([]);
  });

  it("is not available to visitors", async () => {
    await expect(as(db, null, `select * from public.preview_caregiver_invitation('X')`)).rejects.toThrow(denied);
  });

  it("the patient can withdraw a pending invitation", async () => {
    const code = await invite();
    await as(db, patient, `update public.caregiver_invitations set status = 'revoked' where status = 'pending'`);
    expect(await as(db, caregiver, `select * from public.preview_caregiver_invitation($1)`, [code])).toEqual([]);
    await expect(as(db, caregiver, `select public.accept_caregiver_invitation($1)`, [code])).rejects.toThrow(/invalid or expired/);
  });
});

describe("people I care for", () => {
  it("lists names even without profile permission, but not the profile itself", async () => {
    const linkId = await link("view_profile => false");
    const recipients = await as<Recipient>(db, caregiver, `select * from public.my_care_recipients()`);
    expect(recipients.map((row) => row.first_name)).toEqual(["Aziza"]);
    const profile = await as(db, caregiver, `select * from public.profiles where id = $1`, [patient]);
    expect(profile).toEqual([]);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
  });

  it("shows nothing to a stranger, and nothing after revocation", async () => {
    expect(await as(db, stranger, `select * from public.my_care_recipients()`)).toEqual([]);
    expect(await as(db, caregiver, `select * from public.my_care_recipients()`)).toEqual([]);
  });

  it("a new invitation reconnects with only the newly granted permissions", async () => {
    const first = await link("view_health => true");
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [first]);
    const second = await link("view_health => false");
    expect(second).toBe(first);
    const [row] = await as<Recipient>(db, caregiver, `select * from public.my_care_recipients()`);
    expect(row.can_view_health).toBe(false);
    await as(db, caregiver, `select public.revoke_caregiver_link($1)`, [second]);
    expect(await as(db, caregiver, `select * from public.my_care_recipients()`)).toEqual([]);
  });

  it("managing reminders includes seeing them", async () => {
    const linkId = await link("view_medications => false, view_appointments => false, manage_reminders => true");
    const [med] = await as<{ id: string; created_by: string }>(
      db, caregiver, `insert into public.medications (patient_id, name) values ($1, 'Dori') returning id, created_by`, [patient],
    );
    expect(med.created_by).toBe(caregiver);
    const [log] = await as<{ acted_by: string }>(
      db, caregiver,
      `insert into public.medication_logs (medication_id, patient_id, scheduled_for, status) values ($1, $2, now(), 'taken') returning acted_by`,
      [med.id, patient],
    );
    expect(log.acted_by).toBe(caregiver);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
    expect(await as(db, caregiver, `select * from public.medications where patient_id = $1`, [patient])).toEqual([]);
  });

  it("a caregiver can never delete a patient's medicine", async () => {
    const linkId = await link("manage_reminders => true");
    const [med] = await as<{ id: string }>(db, patient, `insert into public.medications (patient_id, name) values ($1, 'Saqlanadi') returning id`, [patient]);
    const removed = await as(db, caregiver, `delete from public.medications where id = $1 returning id`, [med.id]);
    expect(removed).toEqual([]);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
  });
});

describe("emergency acknowledgement", () => {
  async function raise() {
    const [event] = await as<{ id: string }>(db, patient, `insert into public.emergency_events (patient_id) values ($1) returning id`, [patient]);
    return event.id;
  }

  it("the patient sees who saw the alert, and repeating it changes nothing", async () => {
    const linkId = await link();
    const event = await raise();
    await as(db, caregiver, `select public.acknowledge_emergency($1)`, [event]);
    await as(db, caregiver, `select public.acknowledge_emergency($1)`, [event]);
    const rows = await as<{ caregiver_id: string }>(db, patient, `select caregiver_id from public.emergency_acknowledgements where event_id = $1`, [event]);
    expect(rows.map((row) => row.caregiver_id)).toEqual([caregiver]);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
  });

  it("nobody without SOS permission can acknowledge or see it", async () => {
    const linkId = await link("receive_sos => false");
    const event = await raise();
    await expect(as(db, caregiver, `select public.acknowledge_emergency($1)`, [event])).rejects.toThrow(denied);
    await expect(as(db, stranger, `select public.acknowledge_emergency($1)`, [event])).rejects.toThrow(denied);
    expect(await as(db, caregiver, `select * from public.emergency_events where id = $1`, [event])).toEqual([]);
    expect(await as(db, stranger, `select * from public.emergency_acknowledgements`)).toEqual([]);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
  });

  it("cannot be forged directly", async () => {
    const event = await raise();
    await expect(
      as(db, caregiver, `insert into public.emergency_acknowledgements (event_id, patient_id, caregiver_id) values ($1, $2, $3)`, [event, patient, caregiver]),
    ).rejects.toThrow(denied);
  });
});
