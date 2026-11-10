import { describe, expect, it } from "vitest";
import { normalizePhone, phonesOf, primaryPhone } from "@/lib/facilities/phones";

describe("phone numbers", () => {
  it("reads Uzbek numbers written in different ways", () => {
    expect(normalizePhone("+998 73 244 93 93")).toBe("+998732449393");
    expect(normalizePhone("73 244 93 93")).toBe("+998732449393");
    expect(normalizePhone("+998 (73) 244-93-93")).toBe("+998732449393");
  });

  it("keeps international numbers international", () => {
    expect(normalizePhone("+7 495 123 45 67")).toBe("+74951234567");
  });

  it("refuses incomplete or ambiguous numbers rather than guessing", () => {
    expect(normalizePhone("12-34")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("tel")).toBeNull();
  });
});

describe("a facility's numbers", () => {
  const base = { data_source: "OpenStreetMap", contact_verification_status: "provider_supplied" };

  it("splits several numbers and keeps the original text", () => {
    const phones = phonesOf({ ...base, phone: "+998 73 244 93 93; 12-34" });
    expect(phones.map((p) => [p.display, p.e164, p.verification])).toEqual([
      ["+998 73 244 93 93", "+998732449393", "provider_supplied"],
      ["12-34", null, "provider_supplied"],
    ]);
  });

  it("uses labelled numbers when present, and recomputes the dialled number", () => {
    const phones = phonesOf({
      ...base,
      phone: "+998 73 000 00 00",
      phone_numbers: [
        { display: "+998 73 000 00 01", e164: "+999", type: "reception", source: "Official website", verification: "officially_verified" },
        { display: "+998 73 000 00 02", type: "appointments" },
        { nonsense: true },
      ],
    });
    expect(phones).toHaveLength(2);
    expect(phones[0]).toMatchObject({ display: "+998 73 000 00 01", e164: "+998730000001", type: "reception", verification: "officially_verified" });
    expect(phones[1]).toMatchObject({ type: "appointments", verification: "provider_supplied", source: "OpenStreetMap" });
  });

  it("offers a call button only for a number that can be dialled", () => {
    expect(primaryPhone({ ...base, phone: "12-34; +998 73 244 93 93" })?.e164).toBe("+998732449393");
    expect(primaryPhone({ ...base, phone: "12-34" })).toBeNull();
    expect(primaryPhone({ ...base, phone: null })).toBeNull();
  });

  it("never invents a verification it does not have", () => {
    expect(phonesOf({ data_source: "x", phone: "+998732449393", contact_verification_status: "made_up" })[0].verification).toBe("unverified");
  });
});
