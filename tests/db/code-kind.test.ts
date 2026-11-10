import { describe, expect, it } from "vitest";
import { codeHash, wrongPlaceError } from "@/lib/caregiver/code-kind";
import { as, createDatabase, createUser } from "./harness";

describe("recognising a code typed in the wrong place", () => {
  it("hashes codes exactly as the database does", async () => {
    const db = await createDatabase();
    const patient = await createUser(db, {});
    const helper = await createUser(db, { role: "caregiver" });
    const [{ code: invitation }] = await as<{ code: string }>(db, patient, `select public.create_caregiver_invitation() as code`);
    const [{ code: request }] = await as<{ code: string }>(db, helper, `select public.create_caregiver_request() as code`);
    const stored = await db.query<{ code_hash: string }>(
      `select code_hash from public.caregiver_invitations union all select code_hash from public.caregiver_requests`,
    );
    const hashes = stored.rows.map((row) => row.code_hash);
    // Typed in lower case and with spaces, as people do.
    expect(hashes).toContain(codeHash(` ${invitation.toLowerCase()} `));
    expect(hashes).toContain(codeHash(request));
  });

  it("explains each mix-up", () => {
    expect(wrongPlaceError(null, "invitation")).toBe("invalidCode");
    expect(wrongPlaceError({ kind: "request", mine: false }, "invitation")).toBe("codeIsRequest");
    expect(wrongPlaceError({ kind: "request", mine: true }, "invitation")).toBe("codeIsOwnRequest");
    expect(wrongPlaceError({ kind: "invitation", mine: true }, "request")).toBe("codeIsOwnInvitation");
    expect(wrongPlaceError({ kind: "invitation", mine: false }, "request")).toBe("codeIsInvitation");
    expect(wrongPlaceError({ kind: "invitation", mine: true }, "invitation")).toBe("ownInvite");
  });
});
