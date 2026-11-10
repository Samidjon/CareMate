import { describe, expect, it } from "vitest";
import { loginSchema, profileSchema, registerSchema, safeNextPath, toFormError } from "@/lib/account/validation";

const validProfile = {
  firstName: "Aziza",
  lastName: "Karimova",
  birthDate: "",
  phone: "",
  locale: "uz",
  city: "Farg‘ona",
  district: "",
  address: "",
  bloodType: "",
  allergies: "",
  conditions: "",
};

describe("registration validation", () => {
  const valid = {
    email: "User@Example.test",
    password: "long-enough",
    firstName: "Aziza",
    lastName: "Karimova",
    role: "patient",
    consent: "on",
  };

  it("accepts valid data and normalizes the address", () => {
    expect(registerSchema.parse(valid).email).toBe("user@example.test");
  });

  it("does not allow choosing the admin role", () => {
    expect(registerSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });

  it("requires consent", () => {
    const result = registerSchema.safeParse({ ...valid, consent: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFormError(result.error).fieldErrors?.consent).toBe("consentRequired");
  });

  it("reports errors as translatable keys", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFormError(result.error).fieldErrors).toEqual({ email: "invalidEmail", password: "required" });
    }
  });
});

describe("profile validation", () => {
  it("treats optional fields as empty, not as errors", () => {
    const parsed = profileSchema.parse(validProfile);
    expect(parsed.phone).toBeNull();
    expect(parsed.birthDate).toBeNull();
    expect(parsed.allergies).toBeNull();
  });

  it("normalizes phone numbers and refuses invalid ones", () => {
    expect(profileSchema.parse({ ...validProfile, phone: "+998 (90) 123-45-67" }).phone).toBe("+998901234567");
    expect(profileSchema.safeParse({ ...validProfile, phone: "abc" }).success).toBe(false);
  });

  it("refuses a birth date in the future", () => {
    expect(profileSchema.safeParse({ ...validProfile, birthDate: "2999-01-01" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...validProfile, birthDate: "1950-05-20" }).success).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("allows paths on this site", () => {
    expect(safeNextPath("/profile")).toBe("/profile");
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "", null, undefined, 5])(
    "refuses %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});
