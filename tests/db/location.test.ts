import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, createUser } from "./harness";

let db: PGlite;
let patient: string;
let helper: string;
let otherHelper: string;
let stranger: string;
let admin: string;
let linkId: string;
const denied = /row-level security|permission denied/;

async function connect(caregiver: string) {
  const [{ code }] = await as<{ code: string }>(db, patient, `select public.create_caregiver_invitation() as code`);
  const [{ id }] = await as<{ id: string }>(db, caregiver, `select public.accept_caregiver_invitation($1) as id`, [code]);
  return id;
}
const share = (caregiver: string, status: string) => as(db, patient, `select public.set_location_share($1, $2)`, [caregiver, status]);
const seen = async (who: string) => as(db, who, `select latitude from public.patient_last_locations where patient_id = $1`, [patient]);

beforeAll(async () => {
  db = await createDatabase();
  patient = await createUser(db, { first_name: "Samira" });
  helper = await createUser(db, { role: "caregiver" });
  otherHelper = await createUser(db, { role: "caregiver" });
  stranger = await createUser(db, {});
  admin = await createUser(db, {});
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [admin]);
  linkId = await connect(helper);
  await connect(otherHelper);
  await as(db, patient, `insert into public.patient_last_locations (patient_id, latitude, longitude, accuracy_meters, recorded_at) values ($1, 40.3864, 71.7864, 15, now())`, [patient]);
});

describe("location sharing", () => {
  it("is off after connecting: a link alone shows no location", async () => {
    expect(await seen(helper)).toEqual([]);
    expect(await as(db, helper, `select * from public.location_shares`)).toEqual([]);
  });

  it("only the patient can turn it on, and only for connected helpers", async () => {
    await expect(as(db, helper, `select public.set_location_share($1, 'active')`, [helper])).rejects.toThrow(/not a connected helper/);
    await expect(share(stranger, "active")).rejects.toThrow(/not a connected helper/);
    await expect(as(db, helper, `insert into public.location_shares (patient_id, caregiver_id) values ($1, $2)`, [patient, helper])).rejects.toThrow(denied);
  });

  it("shows the position to the chosen helper only", async () => {
    await share(helper, "active");
    expect(await seen(helper)).toEqual([{ latitude: 40.3864 }]);
    expect(await seen(otherHelper)).toEqual([]);
    expect(await seen(stranger)).toEqual([]);
    expect(await seen(admin)).toEqual([]);
    await expect(as(db, null, `select * from public.patient_last_locations`)).rejects.toThrow(denied);
  });

  it("a helper can see the sharing state but never change the position", async () => {
    expect((await as<{ status: string }>(db, helper, `select status from public.location_shares`))[0].status).toBe("active");
    const moved = await as(db, helper, `update public.patient_last_locations set latitude = 1 where patient_id = $1 returning patient_id`, [patient]);
    expect(moved).toEqual([]);
    await expect(as(db, helper, `insert into public.patient_last_locations (patient_id, latitude, longitude, recorded_at) values ($1, 1, 1, now())`, [patient])).rejects.toThrow(denied);
  });

  it("pausing hides the position at once, resuming shows it again", async () => {
    await share(helper, "paused");
    expect(await seen(helper)).toEqual([]);
    expect((await as<{ status: string }>(db, helper, `select status from public.location_shares`))[0].status).toBe("paused");
    await share(helper, "active");
    expect(await seen(helper)).toEqual([{ latitude: 40.3864 }]);
  });

  it("revoking hides the position at once", async () => {
    await share(helper, "revoked");
    expect(await seen(helper)).toEqual([]);
    await share(helper, "active");
  });

  it("ending the helper connection ends location sharing too", async () => {
    await as(db, patient, `select public.revoke_caregiver_link($1)`, [linkId]);
    expect(await seen(helper)).toEqual([]);
    expect((await as<{ status: string }>(db, helper, `select status from public.location_shares`))[0].status).toBe("revoked");
    // Reconnecting does not bring location back: it needs a new decision.
    await connect(helper);
    expect(await seen(helper)).toEqual([]);
  });

  it("is not available to visitors", async () => {
    await expect(as(db, null, `select public.set_location_share(gen_random_uuid(), 'active')`)).rejects.toThrow(/permission denied/);
  });
});

describe("facility contacts", () => {
  it("only administrators change them", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const changed = await as(db, patient, `update public.medical_facilities set phone_numbers = '[]' where id = $1 returning id`, [id]);
    expect(changed).toEqual([]);
    await as(db, admin, `update public.medical_facilities set phone_numbers = '[{"display":"+998 73 000 00 00"}]', contact_verification_status = 'officially_verified' where id = $1`, [id]);
    const [row] = await as<{ contact_verification_status: string }>(db, null, `select contact_verification_status from public.medical_facilities where id = $1`, [id]);
    expect(row.contact_verification_status).toBe("officially_verified");
  });

  it("must be a list", async () => {
    await expect(as(db, admin, `update public.medical_facilities set phone_numbers = '{}' where id = '00000000-0000-4000-8000-000000000001'`)).rejects.toThrow(/check constraint/);
  });
});
