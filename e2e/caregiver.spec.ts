import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { newEmail, PASSWORD, storedUser } from "./helpers";

const FERGANA = { latitude: 40.3864, longitude: 71.7864 };

/** Time in Fergana a couple of minutes from now, so the dose is due. */
const dueTime = () => new Date(Date.now() + 5 * 3600_000 + 2 * 60_000).toISOString().slice(11, 16);

async function signUp(page: Page, firstName: string, role: "Bemor" | "Qarindosh yoki yordamchi", path = "/register") {
  const email = newEmail(firstName.toLowerCase());
  await page.goto(path);
  await page.getByRole("radio", { name: new RegExp(role) }).check();
  await page.getByLabel("Ism").fill(firstName);
  await page.getByLabel("Familiya").fill("Test");
  await page.getByLabel("Elektron pochta").fill(email);
  await page.getByLabel("Parol").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
  return email;
}

async function createInvite(page: Page, share: string[] = []) {
  await page.goto("/circle");
  for (const label of share) await page.getByRole("checkbox", { name: label }).first().check();
  await page.getByRole("button", { name: "Taklif kodini yaratish" }).click();
  const code = (await page.getByTestId("invite-code").textContent())!.trim();
  return code;
}

async function acceptInvite(page: Page, code: string) {
  await page.goto("/caregiver/accept");
  await page.getByLabel("Taklif kodi").fill(code);
  await page.getByRole("button", { name: "Kodni tekshirish" }).click();
  await page.getByRole("button", { name: "Taklifni qabul qilish" }).click();
  await expect(page).toHaveURL(/\/caregiver$/);
}

/** A patient and a helper in separate browser sessions, joined by an invitation. */
async function connectedPair(browser: Browser, share: string[] = []) {
  const patientContext = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const helperContext = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const patient = await patientContext.newPage();
  const helper = await helperContext.newPage();
  const patientEmail = await signUp(patient, "Aziza", "Bemor");
  await expect(patient).toHaveURL(/\/profile$/);
  await signUp(helper, "Bobur", "Qarindosh yoki yordamchi");
  await expect(helper).toHaveURL(/\/caregiver$/);
  await acceptInvite(helper, await createInvite(patient, share));
  return { patient, helper, patientEmail };
}

async function openPatient(helper: Page) {
  await helper.getByRole("link", { name: /Aziza Test/ }).click();
  await expect(helper.getByRole("heading", { level: 1 })).toHaveText("Aziza Test");
}

test.describe("invitations", () => {
  test("a helper has an empty area and no access until invited", async ({ page }) => {
    await signUp(page, "Bobur", "Qarindosh yoki yordamchi");
    await expect(page.getByText(/Hali hech kim ulanmagan/)).toBeVisible();
  });

  test("the code is shown once, and the helper sees exactly what they will get before accepting", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://localhost:3100" });
    const patient = await context.newPage();
    await signUp(patient, "Aziza", "Bemor");
    await expect(patient).toHaveURL(/\/profile$/);
    const code = await createInvite(patient);
    await patient.reload();
    await expect(patient.getByTestId("invite-code")).toHaveCount(0);
    await expect(patient.getByText(/gacha amal qiladi/)).toBeVisible();

    const helperContext = await browser.newContext({ baseURL: "http://localhost:3100" });
    const helper = await helperContext.newPage();
    await signUp(helper, "Bobur", "Qarindosh yoki yordamchi");
    await expect(helper).toHaveURL(/\/caregiver$/);
    await helper.goto("/caregiver/accept");
    await helper.getByLabel("Taklif kodi").fill(code);
    await helper.getByRole("button", { name: "Kodni tekshirish" }).click();
    await expect(helper.getByText("Aziza sizni yordamchi sifatida taklif qilmoqda.")).toBeVisible();
    const list = helper.getByRole("listitem");
    await expect(list.filter({ hasText: "SOS signallarim" })).toBeVisible();
    await expect(list.filter({ hasText: "Sog‘lig‘im" })).toHaveCount(0);
    await expect(helper.getByRole("link", { name: /Aziza/ })).toHaveCount(0);
  });

  test("a link from a message survives signing up", async ({ browser }) => {
    const { patient } = await connectedPair(browser);
    const code = await createInvite(patient);
    const context = await browser.newContext({ baseURL: "http://localhost:3100" });
    const page = await context.newPage();
    await page.goto(`/caregiver/accept?code=${code}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByRole("link", { name: /Ro‘yxatdan o‘ting/ }).click();
    await expect(page.getByRole("radio", { name: /Qarindosh yoki yordamchi/ })).toBeChecked();
    await signUp(page, "Yangi", "Qarindosh yoki yordamchi", page.url());
    await expect(page.getByLabel("Taklif kodi")).toHaveValue(code);
  });

  test("a wrong code gets a clear message", async ({ page }) => {
    await signUp(page, "Bobur", "Qarindosh yoki yordamchi");
    await expect(page).toHaveURL(/\/caregiver$/);
    await page.goto("/caregiver/accept");
    await page.getByLabel("Taklif kodi").fill("NOTACODE12");
    await page.getByRole("button", { name: "Kodni tekshirish" }).click();
    await expect(page.getByText(/Kod noto‘g‘ri yoki eskirgan/)).toBeVisible();
  });

  test("you cannot accept your own invitation", async ({ page }) => {
    await signUp(page, "Aziza", "Bemor");
    await expect(page).toHaveURL(/\/profile$/);
    const code = await createInvite(page);
    await page.goto("/caregiver/accept");
    await page.getByLabel("Taklif kodi").fill(code);
    await page.getByRole("button", { name: "Kodni tekshirish" }).click();
    await page.getByRole("button", { name: "Taklifni qabul qilish" }).click();
    await expect(page.getByText(/O‘z taklifingizni/)).toBeVisible();
  });

  test("a pending invitation can be withdrawn", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    const code = await createInvite(patient);
    await patient.getByRole("button", { name: "Taklifni bekor qilish" }).click();
    await expect(patient.getByText(/gacha amal qiladi/)).toHaveCount(0);
    await helper.goto("/caregiver/accept");
    await helper.getByLabel("Taklif kodi").fill(code);
    await helper.getByRole("button", { name: "Kodni tekshirish" }).click();
    await expect(helper.getByText(/Kod noto‘g‘ri yoki eskirgan/)).toBeVisible();
  });
});

test.describe("what a helper can see", () => {
  test("only what was shared, and says what was not", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await patient.goto("/profile");
    await patient.getByLabel(/Telefon/).fill("+998901234567");
    await patient.getByLabel("Allergiya").fill("Penitsillin");
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await expect(patient.getByText("Saqlandi.")).toBeVisible();

    await openPatient(helper);
    await expect(helper.getByRole("link", { name: "Aziza Testga qo‘ng‘iroq" })).toHaveAttribute("href", "tel:+998901234567");
    await expect(helper.getByText("Penitsillin")).toHaveCount(0);
    await expect(helper.getByText(/Ruxsat berilmagan: Sog‘lig‘im/)).toBeVisible();
    await expect(helper.getByText(/Ruxsat berilmagan: Dorilarim/)).toBeVisible();
  });

  test("more appears after the patient grants it, and disappears when taken back", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await patient.goto("/profile");
    await patient.getByLabel("Allergiya").fill("Penitsillin");
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await expect(patient.getByText("Saqlandi.")).toBeVisible();

    await patient.goto("/circle");
    const health = patient.getByRole("group", { name: /ruxsatlar/ }).getByRole("checkbox", { name: /Sog‘lig‘im/ });
    await health.check();
    await patient.getByRole("button", { name: "Ruxsatlarni saqlash" }).click();
    await expect(patient.getByText("Saqlandi.")).toBeVisible();
    await openPatient(helper);
    await expect(helper.getByText("Penitsillin")).toBeVisible();

    await health.uncheck();
    await patient.getByRole("button", { name: "Ruxsatlarni saqlash" }).click();
    await helper.reload();
    await expect(helper.getByText("Penitsillin")).toHaveCount(0);
  });

  test("revoking removes access at once, including direct links", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await openPatient(helper);
    const url = helper.url();
    await patient.goto("/circle");
    await patient.getByRole("button", { name: /uchun ruxsatni bekor qilish/ }).click();
    await expect(patient.getByText("Hali yordamchi yo‘q.")).toBeVisible();
    await helper.goto(url);
    await expect(helper.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
    await helper.goto("/caregiver");
    await expect(helper.getByRole("link", { name: /Aziza/ })).toHaveCount(0);
  });

  test("a helper can step away, and the patient sees that", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await openPatient(helper);
    await helper.getByText("Yordamchilikni to‘xtatish").first().click();
    await helper.getByRole("button", { name: "Yordamchilikni to‘xtatish" }).click();
    await expect(helper).toHaveURL(/\/caregiver$/);
    await patient.goto("/circle");
    await expect(patient.getByText("Hali yordamchi yo‘q.")).toBeVisible();
  });

  test("a stranger's patient page does not exist for them", async ({ browser, page }) => {
    const { patientEmail } = await connectedPair(browser);
    const { id } = await storedUser(page, patientEmail);
    await signUp(page, "Begona", "Qarindosh yoki yordamchi");
    await expect(page).toHaveURL(/\/caregiver$/);
    await page.goto(`/caregiver/${id}`);
    await expect(page.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });
});

test.describe("shared reminders", () => {
  test("view permission shows medicines but offers no way to change them", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser, ["Dorilarim va qabul tarixi"]);
    await patient.goto("/routine/new");
    await patient.getByLabel("Dori nomi").fill("Aspirin");
    await patient.getByLabel("1-vaqt").fill(dueTime());
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await expect(patient).toHaveURL(/\/routine$/);

    await openPatient(helper);
    await expect(helper.getByText("Aspirin").first()).toBeVisible();
    await expect(helper.getByRole("button", { name: "Qabul qildim" })).toHaveCount(0);
    await expect(helper.getByRole("link", { name: "Dori qo‘shish" })).toHaveCount(0);
    await helper.goto(`${helper.url()}/medicines/new`);
    await expect(helper.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });

  test("a medicine added by a helper reaches the patient, who sees who added it", async ({ browser }) => {
    const { patient, helper, patientEmail } = await connectedPair(browser, ["Dori va qabullarni men uchun qo‘shishi mumkin"]);
    await openPatient(helper);
    await helper.getByRole("link", { name: "Dori qo‘shish" }).click();
    await helper.getByLabel("Dori nomi").fill("Vitamin D");
    await helper.getByLabel("1-vaqt").fill(dueTime());
    await helper.getByRole("button", { name: "Saqlash" }).click();
    await expect(helper.getByRole("heading", { level: 1 })).toHaveText("Aziza Test");
    await expect(helper.getByText("Vitamin D").first()).toBeVisible();

    const data = await storedUser(patient, patientEmail);
    expect(data.medications[0].patient_id).toBe(data.id);
    await patient.goto("/routine");
    await expect(patient.getByRole("link", { name: /Vitamin D/ })).toContainText("Oxirgi o‘zgartirish: Bobur (yordamchi)");
  });

  test("a dose marked by a helper shows who marked it in the patient's history", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser, ["Dori va qabullarni men uchun qo‘shishi mumkin"]);
    await patient.goto("/routine/new");
    await patient.getByLabel("Dori nomi").fill("Aspirin");
    await patient.getByLabel("1-vaqt").fill(dueTime());
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await expect(patient).toHaveURL(/\/routine$/);

    await openPatient(helper);
    await helper.getByRole("button", { name: "Qabul qildim" }).click();
    await expect(helper.getByText("✓ Qabul qilindi")).toBeVisible();
    await patient.goto("/routine/history");
    await expect(patient.getByText("Belgiladi: Bobur")).toBeVisible();
  });

  test("a helper can add an appointment and stop a medicine", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser, ["Dori va qabullarni men uchun qo‘shishi mumkin"]);
    await patient.goto("/routine/new");
    await patient.getByLabel("Dori nomi").fill("Aspirin");
    await patient.getByLabel("1-vaqt").fill("12:00");
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await expect(patient).toHaveURL(/\/routine$/);

    await openPatient(helper);
    await helper.getByRole("button", { name: "Eslatmalarni to‘xtatish" }).click();
    await expect(helper.getByRole("button", { name: "Eslatmalarni yoqish" })).toBeVisible();
    await helper.getByRole("link", { name: "Qabul qo‘shish" }).click();
    await helper.getByLabel("Qabul nomi").fill("Kardiolog");
    await helper.getByLabel("Sana va vaqt").fill("2099-03-10T09:30");
    await helper.getByRole("button", { name: "Qabul qo‘shish" }).click();
    await expect(helper.getByText("Saqlandi.")).toBeVisible();

    await patient.goto("/appointments");
    await expect(patient.getByText("Kardiolog")).toBeVisible();
    await patient.goto("/routine");
    await expect(patient.getByRole("link", { name: /Aspirin/ })).toContainText("To‘xtatilgan");
  });

  test("when the patient asks for help, the helper sees it", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser, ["Dorilarim va qabul tarixi"]);
    await patient.goto("/routine/new");
    await patient.getByLabel("Dori nomi").fill("Aspirin");
    await patient.getByLabel("1-vaqt").fill(dueTime());
    await patient.getByRole("button", { name: "Saqlash" }).click();
    await patient.getByRole("button", { name: "Yordam kerak" }).click();
    await expect(patient.getByText(/Belgilandi/)).toBeVisible();
    await openPatient(helper);
    await expect(helper.getByText("Yordam so‘radi")).toBeVisible();
  });
});

test.describe("emergency alerts", () => {
  async function raiseAlert(page: Page) {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation(FERGANA);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/^Vaqt:/)).toBeVisible({ timeout: 15_000 });
  }

  test("the helper sees it, the patient sees that they saw it, and nothing claims a phone alert", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await raiseAlert(patient);
    await expect(patient.getByText(/telefonga xabar yuborish hali sozlanmagan/)).toBeVisible();
    await expect(patient.getByText(/Yuborildi:/)).toHaveCount(0);

    await helper.goto("/caregiver");
    await expect(helper.getByText("Faol SOS signali!")).toBeVisible();
    await helper.getByRole("link", { name: "Shoshilinch signallar" }).click();
    await expect(helper.getByText("Aziza Test yordam so‘ramoqda")).toBeVisible();
    await expect(helper.getByRole("link", { name: "Xaritada ko‘rish" })).toHaveAttribute("href", /mlat=40\.3864/);
    await expect(helper.getByText(/Tez yordam chaqirilmagan bo‘lishi mumkin/)).toBeVisible();

    await helper.getByRole("button", { name: "Ko‘rdim" }).click();
    await expect(helper.getByText(/Siz ko‘rganingiz belgilandi/)).toBeVisible();
    await expect(patient.getByText(/Bobur signalni \d\d:\d\d da ko‘rdi/)).toBeVisible({ timeout: 15_000 });
  });

  test("a cancelled alert no longer shows as active", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await raiseAlert(patient);
    await patient.getByRole("button", { name: "Xavotirni bekor qilish" }).click();
    await expect(patient.getByText("Xavotir bekor qilindi.")).toBeVisible();
    await helper.goto("/caregiver");
    await expect(helper.getByText("Faol SOS signali!")).toHaveCount(0);
    await helper.goto("/caregiver/alerts");
    await expect(helper.getByText("Faol signal yo‘q.")).toBeVisible();
    await expect(helper.getByText("Bekor qilingan")).toBeVisible();
  });

  test("demo runs never reach a helper", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await patient.goto("/sos/demo");
    await patient.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(patient.getByText(/DEMO: voqea sinov tariqasida yakunlandi/)).toBeVisible({ timeout: 15_000 });
    await helper.goto("/caregiver/alerts");
    await expect(helper.getByText("Faol signal yo‘q.")).toBeVisible();
    await expect(helper.getByText(/yordam so‘ramoqda/)).toHaveCount(0);
  });

  test("without SOS permission, the helper is not shown alerts", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser);
    await patient.goto("/circle");
    await patient.getByRole("group", { name: /ruxsatlar/ }).getByRole("checkbox", { name: /SOS signallarim/ }).uncheck();
    await patient.getByRole("button", { name: "Ruxsatlarni saqlash" }).click();
    await expect(patient.getByText("Saqlandi.")).toBeVisible();
    await raiseAlert(patient);
    await expect(patient.getByText(/ulangan yordamchi yo‘q/)).toBeVisible();
    await helper.goto("/caregiver/alerts");
    await expect(helper.getByText("Faol signal yo‘q.")).toBeVisible();
  });
});

test.describe("automated accessibility checks", () => {
  test("patient and helper pages", async ({ browser }) => {
    const { patient, helper } = await connectedPair(browser, ["Dori va qabullarni men uchun qo‘shishi mumkin"]);
    const check = async (page: Page) => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    };
    await patient.goto("/circle");
    await check(patient);
    await helper.goto("/caregiver");
    await check(helper);
    await openPatient(helper);
    await check(helper);
    await helper.goto("/caregiver/alerts");
    await check(helper);
    await helper.goto("/caregiver/accept");
    await check(helper);
  });
});

test.describe("when Supabase is not configured", () => {
  for (const path of ["/caregiver", "/caregiver/alerts", "/caregiver/accept"]) {
    test(`${path} says so honestly`, async ({ page }) => {
      await page.goto(`http://localhost:3101${path}`);
      await expect(page.getByText(/Hisob xizmati hali sozlanmagan/)).toBeVisible();
    });
  }
});
