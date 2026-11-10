import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser } from "./harness";

let db: PGlite;
let patient: string;
let helper: string;
let stranger: string;
let admin: string;
const facility = "00000000-0000-4000-8000-000000000001";
const denied = /row-level security|permission denied/;

beforeAll(async () => {
  db = await createDatabase();
  patient = await createUser(db, { first_name: "Aziza", last_name: "Karimova" });
  helper = await createUser(db, { role: "caregiver", first_name: "Bobur", last_name: "Tursunov" });
  stranger = await createUser(db, {});
  admin = await createUser(db, {});
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [admin]);
});

describe("facility reports", () => {
  it("a signed-in person can report, and sees only their own reports", async () => {
    await as(db, patient, `insert into public.facility_reports (facility_id, reporter_id, topic, details) values ($1, $2, 'phone', 'Raqam eskirgan')`, [facility, patient]);
    expect((await as(db, patient, `select id from public.facility_reports`)).length).toBe(1);
    expect(await as(db, stranger, `select id from public.facility_reports`)).toEqual([]);
  });

  it("nobody can report in someone else's name, or pre-approve their own report", async () => {
    await expect(as(db, stranger, `insert into public.facility_reports (facility_id, reporter_id, topic, details) values ($1, $2, 'other', 'xxx')`, [facility, patient])).rejects.toThrow(denied);
    await expect(as(db, patient, `insert into public.facility_reports (facility_id, reporter_id, topic, details, status) values ($1, $2, 'other', 'xxx', 'accepted')`, [facility, patient])).rejects.toThrow(denied);
    await expect(as(db, null, `insert into public.facility_reports (facility_id, topic, details) values ($1, 'other', 'xxx')`, [facility])).rejects.toThrow(denied);
  });

  it("only an administrator reviews, and the review records who did it", async () => {
    const [report] = await as<{ id: string }>(db, admin, `select id from public.facility_reports limit 1`);
    expect(report).toBeTruthy();
    const changed = await as(db, patient, `update public.facility_reports set status = 'accepted', reviewed_by = $1 returning id`, [patient]);
    expect(changed).toEqual([]);
    await expect(as(db, admin, `update public.facility_reports set status = 'accepted', reviewed_by = $1 where id = $2`, [patient, report.id])).rejects.toThrow(denied);
    await as(db, admin, `update public.facility_reports set status = 'accepted', reviewed_by = $1, reviewed_at = now() where id = $2`, [admin, report.id]);
    const [row] = await as<{ status: string }>(db, admin, `select status from public.facility_reports where id = $1`, [report.id]);
    expect(row.status).toBe("accepted");
  });
});

describe("saved places", () => {
  it("are private to each person, administrators included", async () => {
    await as(db, patient, `insert into public.user_saved_facilities (user_id, facility_id) values ($1, $2)`, [patient, facility]);
    expect((await as(db, patient, `select facility_id from public.user_saved_facilities`)).length).toBe(1);
    expect(await as(db, stranger, `select facility_id from public.user_saved_facilities`)).toEqual([]);
    expect(await as(db, admin, `select facility_id from public.user_saved_facilities`)).toEqual([]);
    await expect(as(db, stranger, `insert into public.user_saved_facilities (user_id, facility_id) values ($1, $2)`, [patient, facility])).rejects.toThrow(denied);
  });
});

describe("home address", () => {
  it("can be changed by its owner only", async () => {
    await as(db, patient, `update public.profiles set address = 'Mustaqillik 5' where id = $1`, [patient]);
    const changed = await as(db, stranger, `update public.profiles set address = 'x' where id = $1 returning id`, [patient]);
    expect(changed).toEqual([]);
  });
});

describe("connection requests from a helper", () => {
  const request = async () => (await as<{ code: string }>(db, helper, `select public.create_caregiver_request() as code`))[0].code;

  it("show the patient who is asking, and share nothing before approval", async () => {
    const code = await request();
    const [who] = await as<{ first_name: string; last_name: string }>(db, patient, `select * from public.preview_caregiver_request($1)`, [code]);
    expect(who).toEqual({ first_name: "Bobur", last_name: "Tursunov" });
    expect(await as(db, helper, `select id from public.profiles where id = $1`, [patient])).toEqual([]);
  });

  it("an approval grants exactly the chosen permissions, once", async () => {
    const code = await request();
    await as(db, patient, `select public.decide_caregiver_request($1, true, view_contacts => false, view_medications => true)`, [code]);
    const [link] = await as<{ id: string; can_view_contacts: boolean; can_view_medications: boolean; can_view_profile: boolean }>(
      db, patient, `select id, can_view_contacts, can_view_medications, can_view_profile from public.caregiver_links where caregiver_id = $1`, [helper],
    );
    expect(link).toMatchObject({ can_view_contacts: false, can_view_medications: true, can_view_profile: true });
    expect((await as(db, helper, `select id from public.profiles where id = $1`, [patient])).length).toBe(1);
    await expect(as(db, stranger, `select public.decide_caregiver_request($1, true)`, [code])).rejects.toThrow(/invalid or expired/);
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [link.id]);
  });

  it("a rejection grants nothing", async () => {
    const code = await request();
    await as(db, stranger, `select public.decide_caregiver_request($1, false)`, [code]);
    expect(await as(db, helper, `select id from public.profiles where id = $1`, [stranger])).toEqual([]);
    expect(await as(db, helper, `select * from public.my_care_recipients()`)).toEqual([]);
  });

  it("a helper cannot approve their own request or forge one", async () => {
    const code = await request();
    await expect(as(db, helper, `select public.decide_caregiver_request($1, true)`, [code])).rejects.toThrow(/own request/);
    expect(await as(db, helper, `select * from public.preview_caregiver_request($1)`, [code])).toEqual([]);
    await expect(as(db, helper, `insert into public.caregiver_requests (caregiver_id, code_hash) values ($1, 'x')`, [helper])).rejects.toThrow(denied);
  });

  it("are not available to visitors", async () => {
    await expect(as(db, null, `select public.create_caregiver_request()`)).rejects.toThrow(/permission denied/);
  });
});
