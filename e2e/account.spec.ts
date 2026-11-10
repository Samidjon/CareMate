import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const MOCK = "http://localhost:54399";
const PASSWORD = "test-password-1";

const newEmail = (prefix = "user") => `${prefix}-${randomUUID()}@example.test`;

async function register(page: Page, email: string, role: "Bemor" | "Qarindosh yoki yordamchi" = "Bemor") {
  await page.goto("/register");
  await page.getByRole("radio", { name: new RegExp(role) }).check();
  await page.getByLabel("Ism").fill("Aziza");
  await page.getByLabel("Familiya").fill("Karimova");
  await page.getByLabel("Elektron pochta").fill(email);
  await page.getByLabel("Parol").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
}

async function stored(page: Page, email: string) {
  const response = await page.request.get(`${MOCK}/__test/profile?email=${encodeURIComponent(email)}`);
  return response.json();
}

test.describe("registration", () => {
  test("creates an account and opens the profile", async ({ page }) => {
    const email = newEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel("Ism")).toHaveValue("Aziza");
    await expect(page.getByText("Foydalanuvchi")).toBeVisible();
  });

  test("the chosen account type is stored", async ({ page }) => {
    const email = newEmail();
    await register(page, email, "Qarindosh yoki yordamchi");
    await expect(page).toHaveURL(/\/caregiver$/);
    await page.goto("/profile");
    await expect(page.getByText("Hisob turi: Yordamchi")).toBeVisible();
    expect((await stored(page, email)).profile.role).toBe("caregiver");
  });

  test("does not ask for medical details", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Allergiya")).toHaveCount(0);
    await expect(page.getByLabel("Qon guruhi")).toHaveCount(0);
  });

  test("shows clear errors for each invalid field", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Elektron pochta").fill("not-an-email");
    await page.getByLabel("Parol").fill("short");
    await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
    await expect(page.getByText("Pochta manzilini tekshiring.")).toBeVisible();
    await expect(page.getByText(/Parol juda oddiy/)).toBeVisible();
    await expect(page.getByText("Davom etish uchun rozilik kerak.")).toBeVisible();
    await expect(page.getByLabel("Elektron pochta")).toHaveAttribute("aria-invalid", "true");
  });

  test("tells the user to check their email when confirmation is required", async ({ page }) => {
    await register(page, newEmail("confirm"));
    await expect(page.getByText(/Hisob yaratildi/)).toBeVisible();
  });

  test("a used address gets a clear message", async ({ page, context }) => {
    const email = newEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/profile$/);
    await context.clearCookies();
    await register(page, email);
    await expect(page.getByText(/allaqachon ro‘yxatdan o‘tgan/)).toBeVisible();
  });
});

test.describe("sign in and out", () => {
  test("protected pages send visitors to login, then back", async ({ page, context }) => {
    const email = newEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/profile$/);
    await context.clearCookies();

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile|\/login\?next=\/profile/);
    await expect(page.getByText("Bu bo‘lim uchun hisobingizga kiring.")).toBeVisible();

    await page.getByLabel("Elektron pochta").fill(email);
    await page.getByLabel("Parol").fill(PASSWORD);
    await page.getByRole("button", { name: "Kirish" }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("a wrong password gets a plain message and no technical detail", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Elektron pochta").fill(newEmail());
    await page.getByLabel("Parol").fill("wrong-password");
    await page.getByRole("button", { name: "Kirish" }).click();
    await expect(page.getByText("Pochta yoki parol noto‘g‘ri.")).toBeVisible();
    await expect(page.getByText(/invalid_credentials|Invalid login/)).toHaveCount(0);
  });

  test("a crafted link cannot redirect away from the site after login", async ({ page, context }) => {
    const email = newEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/profile$/);
    await context.clearCookies();
    await page.goto("/login?next=//evil.example/steal");
    await page.getByLabel("Elektron pochta").fill(email);
    await page.getByLabel("Parol").fill(PASSWORD);
    await page.getByRole("button", { name: "Kirish" }).click();
    await page.waitForURL("http://localhost:3100/");
  });

  test("signing out ends the session", async ({ page }) => {
    await register(page, newEmail());
    await page.getByRole("button", { name: "Chiqish" }).click();
    await page.waitForURL("http://localhost:3100/");
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });

  test("repeated failed logins are limited", async ({ page }) => {
    const email = newEmail();
    await page.goto("/login");
    for (let attempt = 0; attempt < 11; attempt++) {
      await page.getByLabel("Elektron pochta").fill(email);
      await page.getByLabel("Parol").fill("wrong-password");
      await page.getByRole("button", { name: "Kirish" }).click();
      await expect(page.getByRole("status").filter({ hasText: /./ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Kirish" })).toBeEnabled();
    }
    await expect(page.getByText(/Urinishlar juda ko‘p/)).toBeVisible();
  });
});

test.describe("password recovery", () => {
  test("gives the same answer for known and unknown addresses", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Elektron pochta").fill(newEmail());
    await page.getByRole("button", { name: "Havolani yuborish" }).click();
    await expect(page.getByText(/Agar bu pochta ro‘yxatdan o‘tgan bo‘lsa/)).toBeVisible();
  });

  test("the reset page needs a valid link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.getByText(/Havola eskirgan/)).toBeVisible();
  });

  test("a bad code in the email link is refused", async ({ page }) => {
    await page.goto("/auth/callback?code=bad");
    await expect(page).toHaveURL(/\/login\?error=link/);
  });
});

test.describe("profile", () => {
  test("saves changes, including optional health details", async ({ page }) => {
    const email = newEmail();
    await register(page, email);
    await page.getByLabel(/Telefon/).fill("+998 90 123 45 67");
    await page.getByLabel("Allergiya").fill("Penitsillin");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Saqlandi.")).toBeVisible();
    const data = await stored(page, email);
    expect(data.profile.phone).toBe("+998901234567");
    expect(data.health.allergies).toBe("Penitsillin");
    await page.reload();
    await expect(page.getByLabel("Allergiya")).toHaveValue("Penitsillin");
  });

  test("refuses an invalid phone number", async ({ page }) => {
    await register(page, newEmail());
    await page.getByLabel(/Telefon/).fill("abc");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText(/Telefon raqamini/)).toBeVisible();
  });

  test("changing the language in the profile changes the interface", async ({ page }) => {
    await register(page, newEmail());
    await page.getByLabel("Interfeys tili").selectOption("ru");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("accessibility settings are kept in the account and return on a new device", async ({ page, context }) => {
    const email = newEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/profile$/);
    await page.goto("/settings");
    await expect(page.getByText("Sozlamalar hisobingizda ham saqlanadi.")).toBeVisible();
    await page.getByRole("radio", { name: "Katta", exact: true }).check();
    await expect.poll(async () => (await stored(page, email)).profile.accessibility?.textSize).toBe("large");

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Elektron pochta").fill(email);
    await page.getByLabel("Parol").fill(PASSWORD);
    await page.getByRole("button", { name: "Kirish" }).click();
    await page.waitForURL("http://localhost:3100/");
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  });
});

test.describe("account deletion", () => {
  test("needs the confirmation word", async ({ page }) => {
    const email = newEmail();
    await register(page, email);
    await page.getByLabel(/Tasdiqlash uchun/).fill("xato");
    await page.getByRole("button", { name: /butunlay o‘chirish/ }).click();
    await expect(page.getByText("Tasdiqlash so‘zi noto‘g‘ri.")).toBeVisible();
    expect(await stored(page, email)).not.toBeNull();
  });

  test("removes the account and signs out", async ({ page }) => {
    const email = newEmail();
    await register(page, email);
    await page.getByLabel(/Tasdiqlash uchun/).fill("OCHIRISH");
    await page.getByRole("button", { name: /butunlay o‘chirish/ }).click();
    await expect(page.getByText("Hisobingiz o‘chirildi.")).toBeVisible();
    expect(await stored(page, email)).toBeNull();
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("when Supabase is not configured", () => {
  const BASE = "http://localhost:3101";

  for (const path of ["/login", "/register", "/forgot-password", "/reset-password", "/profile"]) {
    test(`${path} says so honestly and offers no form`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await expect(page.getByText(/Hisob xizmati hali sozlanmagan/)).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
    });
  }

  test("the rest of the app keeps working", async ({ page }) => {
    await page.goto(`${BASE}/sos`);
    await expect(page.getByRole("link", { name: /103/ })).toHaveAttribute("href", "tel:103");
    await page.goto(`${BASE}/settings`);
    await page.getByRole("radio", { name: "Katta", exact: true }).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  });
});

test.describe("automated accessibility checks on account pages", () => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  }

  test("/profile", async ({ page }) => {
    await register(page, newEmail());
    await expect(page).toHaveURL(/\/profile$/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });
});
