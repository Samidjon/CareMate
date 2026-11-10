import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { MOCK, newEmail, PASSWORD, registerUser, storedUser } from "./helpers";

const FACILITY = "/map/00000000-0000-4000-8000-000000000001";

async function signUp(page: Page, firstName: string, role: "Bemor" | "Qarindosh yoki yordamchi") {
  const email = newEmail(firstName.toLowerCase());
  await page.goto("/register");
  await page.getByRole("radio", { name: new RegExp(role) }).check();
  await page.getByLabel("Ism").fill(firstName);
  await page.getByLabel("Familiya").fill("Test");
  await page.getByLabel("Elektron pochta").fill(email);
  await page.getByLabel("Parol").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
  await expect(page).toHaveURL(role === "Bemor" ? /\/profile$/ : /\/caregiver$/);
  return email;
}

async function twoPeople(browser: Browser) {
  const context = () => browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const patient = await (await context()).newPage();
  const helper = await (await context()).newPage();
  await signUp(patient, "Aziza", "Bemor");
  await signUp(helper, "Bobur", "Qarindosh yoki yordamchi");
  return { patient, helper };
}

async function helperCode(helper: Page) {
  await helper.goto("/caregiver");
  await helper.getByRole("button", { name: "So‘rov kodini yaratish" }).click();
  return (await helper.getByTestId("request-code").textContent())!.trim();
}

test.describe("a helper asking to connect", () => {
  test("the patient sees who asks, chooses what to share and approves", async ({ browser }) => {
    const { patient, helper } = await twoPeople(browser);
    const code = await helperCode(helper);
    await expect(helper.getByRole("link", { name: /Aziza/ })).toHaveCount(0);

    await patient.goto("/circle");
    await patient.getByLabel("So‘rov kodi").fill(code);
    await patient.getByRole("button", { name: "Kodni tekshirish" }).click();
    await expect(patient.getByText("Bobur Test sizga yordamchi bo‘lishni so‘ramoqda.")).toBeVisible();
    await patient.getByRole("region", { name: "Yordamchidan kelgan so‘rov" }).getByRole("checkbox", { name: "Shoshilinch kontaktlarim" }).uncheck();
    await patient.getByRole("button", { name: "Ruxsat berish" }).click();
    await expect(patient.getByText("Ruxsat berildi.")).toBeVisible();
    await expect(patient.getByText("Bobur Test", { exact: true })).toBeVisible();

    await helper.goto("/caregiver");
    await helper.getByRole("link", { name: /Aziza Test/ }).click();
    await expect(helper.getByText(/Ruxsat berilmagan: Shoshilinch kontaktlarim/)).toBeVisible();
  });

  test("a rejection shares nothing", async ({ browser }) => {
    const { patient, helper } = await twoPeople(browser);
    const code = await helperCode(helper);
    await patient.goto("/circle");
    await patient.getByLabel("So‘rov kodi").fill(code);
    await patient.getByRole("button", { name: "Kodni tekshirish" }).click();
    await patient.getByRole("button", { name: "Rad etish" }).click();
    await expect(patient.getByText(/Hech narsa ulashilmadi/)).toBeVisible();
    await helper.goto("/caregiver");
    await expect(helper.getByText(/Hali hech kim ulanmagan/)).toBeVisible();
  });

  test("a wrong code is refused clearly", async ({ page }) => {
    await registerUser(page);
    await page.goto("/circle");
    await page.getByLabel("So‘rov kodi").fill("NOTACODE12");
    await page.getByRole("button", { name: "Kodni tekshirish" }).click();
    await expect(page.getByText(/Kod noto‘g‘ri yoki eskirgan/)).toBeVisible();
  });

  test("email invitations are honestly marked as not available", async ({ page }) => {
    await registerUser(page);
    await page.goto("/circle");
    await expect(page.getByText(/pochta xizmati ulanmagan/)).toBeVisible();
  });
});

test.describe("home address", () => {
  test("is filled from the location when empty, and saved without coordinates", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.39, longitude: 71.78 });
    const email = await registerUser(page);
    await expect(page.getByText(/Koordinatalar saqlanmaydi/)).toBeVisible();
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText(/Manzil to‘ldirildi/)).toBeVisible();
    await expect(page.getByLabel(/Uy manzili/)).toHaveValue("Al-Farg‘oniy 5");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Saqlandi.")).toBeVisible();
    const { profile } = await storedUser(page, email);
    expect(profile.address).toBe("Al-Farg‘oniy 5");
    expect(JSON.stringify(profile)).not.toContain("40.39");
  });

  test("asks before replacing an address the person typed", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.39, longitude: 71.78 });
    await registerUser(page);
    await page.getByLabel(/Uy manzili/).fill("Mening uyim 7");
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText("Topildi: Al-Farg‘oniy 5, Farg‘ona")).toBeVisible();
    await page.getByRole("button", { name: "Hozirgi manzilni qoldirish" }).click();
    await expect(page.getByLabel(/Uy manzili/)).toHaveValue("Mening uyim 7");
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await page.getByRole("button", { name: "Hozirgi manzilni almashtirish" }).click();
    await expect(page.getByLabel(/Uy manzili/)).toHaveValue("Al-Farg‘oniy 5");
  });

  test("manual entry still works when location is refused", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    await registerUser(page);
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText(/Uni qo‘lda yozing/)).toBeVisible();
    await page.getByLabel(/Uy manzili/).fill("Qo‘lda yozilgan 3");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Saqlandi.")).toBeVisible();
  });
});

test.describe("saved places", () => {
  test("appear on the profile page", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings");
    await expect(page.getByText(/Hali saqlangan joy yo‘q/)).toBeVisible();
    await page.goto(FACILITY);
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("✓ Saqlangan")).toBeVisible();
    await page.goto("/settings");
    await page.getByRole("link", { name: /Namunaviy shifoxona/ }).click();
    await expect(page).toHaveURL(new RegExp(`${FACILITY}$`));
  });
});

test.describe("reviewing reported errors", () => {
  test("is hidden from people who are not administrators", async ({ page }) => {
    await registerUser(page);
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });

  test("an administrator sees reports and records a decision", async ({ page, context }) => {
    const reporter = await registerUser(page);
    await page.goto(FACILITY);
    await page.getByText("Ma’lumotda xato bormi?").click();
    await page.getByLabel("Nima noto‘g‘ri?").selectOption("hours");
    await page.getByLabel("Qisqacha yozing").fill("Shanba kuni yopiq");
    await page.getByRole("button", { name: "Yuborish" }).click();
    await expect(page.getByText(/Administrator tekshiradi/)).toBeVisible();

    await context.clearCookies();
    const adminEmail = await registerUser(page);
    await page.request.post(`${MOCK}/__test/admin`, { data: { email: adminEmail } });
    await page.goto("/admin/reports");
    const item = page.getByRole("listitem").filter({ hasText: "Shanba kuni yopiq" });
    await expect(item).toContainText("Ish vaqti");
    await expect(item).toContainText("Namunaviy shifoxona");
    await expect(page.getByText(/Qabul qilish muassasa ma’lumotini o‘zi o‘zgartirmaydi/)).toBeVisible();
    await item.getByRole("button", { name: "Qabul qilish" }).click();
    await expect(page.getByText("Ko‘rib chiqilmagan xabar yo‘q.")).toBeVisible();
    expect((await storedUser(page, reporter)).reports[0].status).toBe("accepted");
  });
});

test("the new pages pass automated accessibility checks", async ({ browser }) => {
  const { patient, helper } = await twoPeople(browser);
  const check = async (page: Page) => {
    const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  };
  const code = await helperCode(helper);
  await check(helper);
  await patient.goto("/circle");
  await patient.getByLabel("So‘rov kodi").fill(code);
  await patient.getByRole("button", { name: "Kodni tekshirish" }).click();
  await expect(patient.getByRole("button", { name: "Ruxsat berish" })).toBeVisible();
  await check(patient);
  await patient.goto("/profile");
  await check(patient);
});
