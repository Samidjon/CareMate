import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { MOCK, newEmail, PASSWORD, storedUser } from "./helpers";

const FERGANA = { latitude: 40.3864, longitude: 71.7864, accuracy: 15 };

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

/** Steps 1–4: a patient and a helper, connected by the patient's invitation. */
async function connected(browser: Browser) {
  const make = () => browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const patientContext = await make();
  const helperContext = await make();
  const patient = await patientContext.newPage();
  const helper = await helperContext.newPage();
  const patientEmail = await signUp(patient, "Samira", "Bemor");
  await signUp(helper, "Bobur", "Qarindosh yoki yordamchi");
  await patient.goto("/circle");
  await patient.getByRole("button", { name: "Taklif kodini yaratish" }).click();
  const code = (await patient.getByTestId("invite-code").textContent())!.trim();
  await helper.goto("/caregiver/accept");
  await helper.getByLabel("Taklif kodi").fill(code);
  await helper.getByRole("button", { name: "Kodni tekshirish" }).click();
  await helper.getByRole("button", { name: "Taklifni qabul qilish" }).click();
  await expect(helper).toHaveURL(/\/caregiver$/);
  return { patient, helper, patientContext, patientEmail };
}

async function startSharing(patient: Page, context: BrowserContext) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(FERGANA);
  await patient.goto("/location");
  await patient.getByRole("checkbox", { name: "Bobur Test" }).check();
  await patient.getByRole("button", { name: "Ulashishni boshlash" }).click();
  await expect(patient.getByText("Ulashish yoqildi. Joylashuvingiz yuborildi.")).toBeVisible();
}

const helperCard = (helper: Page) => helper.getByRole("article").filter({ hasText: "Samira Test" });

test.describe("location sharing", () => {
  test("is off after connecting, and starts only by the patient's own choice", async ({ browser }) => {
    const { patient, helper, patientEmail } = await connected(browser);
    await helper.goto("/caregiver/locations");
    await expect(helper.getByText("Hech kim siz bilan joylashuvini ulashmayapti.")).toBeVisible();
    await expect(helper.getByText(/Joylashuvni ko‘rish uchun/)).toBeVisible();

    await patient.goto("/location");
    await expect(patient.getByText(/O‘chirilgan/)).toBeVisible();
    await expect(patient.getByText(/siz tanlagan ishonchli insonlar/)).toBeVisible();
    await expect(patient.getByText(/faqat CareMate telefoningizda ochiq turganda/)).toBeVisible();
    await expect(patient.getByRole("button", { name: "Ulashishni boshlash" })).toBeDisabled();
    expect((await storedUser(patient, patientEmail)).location).toBeNull();
  });

  test("the full journey: share, see, move, go stale, pause, revoke", async ({ browser }) => {
    const { patient, helper, patientContext, patientEmail } = await connected(browser);
    await startSharing(patient, patientContext);
    await expect(patient.getByText("● Ulashilmoqda")).toBeVisible();
    // Visible on every page while sharing: no hidden tracking.
    await patient.goto("/");
    await expect(patient.getByText("Joylashuvingiz yaqinlaringizga ko‘rsatilmoqda")).toBeVisible();

    // The helper sees the last known position, time and accuracy, never called "live".
    await helper.goto("/caregiver/locations");
    const card = helperCard(helper);
    await expect(card).toContainText("Faol");
    await expect(card).toContainText("Oxirgi ma’lum joylashuv. Bu hozirgi joy bo‘lmasligi mumkin.");
    await expect(card).toContainText(/Oxirgi yangilanish: .*\d\d:\d\d/);
    await expect(card).toContainText("Aniqlik: taxminan 15 m");
    await expect(card).toContainText("Koordinatalar: 40.38640, 71.78640");
    await expect(card.getByRole("link", { name: "Navigatorda yo‘l" })).toHaveAttribute("href", /destination=40\.3864,71\.7864/);
    await expect(helper.locator(".leaflet-marker-icon")).toHaveCount(1);

    // Moving: a new position replaces the old one. (The page is closed first, so its
    // own automatic update does not use up the once-per-20-seconds allowance.)
    await patient.goto("about:blank");
    await patient.request.post(`${MOCK}/__test/location-age`, { data: { email: patientEmail, minutes: 1 } });
    const moved = await patient.request.post("/api/location/update", {
      data: { kind: "position", latitude: 40.39, longitude: 71.79, accuracy: 30, recordedAt: new Date().toISOString() },
    });
    expect(moved.status()).toBe(200);
    await helper.reload();
    await expect(helperCard(helper)).toContainText("Koordinatalar: 40.39000, 71.79000");
    await expect(helperCard(helper)).toContainText("Aniqlik: taxminan 30 m");

    // Old positions are marked as possibly outdated.
    await patient.request.post(`${MOCK}/__test/location-age`, { data: { email: patientEmail, minutes: 20 } });
    await helper.reload();
    await expect(helperCard(helper)).toContainText("Eskirgan");
    await expect(helperCard(helper)).toContainText("15 daqiqadan ko‘proq vaqt oldin yangilangan");

    // The device stops reporting: the last position stays, marked as not current.
    await patient.request.post("/api/location/update", { data: { kind: "unavailable" } });
    await helper.reload();
    await expect(helperCard(helper)).toContainText("Vaqtincha mavjud emas");
    await expect(helperCard(helper)).toContainText("Koordinatalar: 40.39000, 71.79000");

    // Pause: the position disappears at once.
    await patient.goto("/location");
    await patient.getByRole("button", { name: "To‘xtatib turish" }).click();
    await expect(patient.getByText("❚❚ To‘xtatib qo‘yilgan")).toBeVisible();
    await helper.reload();
    await expect(helperCard(helper)).toContainText("Ulashish to‘xtatib qo‘yilgan. Joylashuv ko‘rsatilmaydi.");
    await expect(helperCard(helper)).not.toContainText("Koordinatalar");
    await expect(helper.locator(".leaflet-marker-icon")).toHaveCount(0);

    // Resume, then take this helper's access away.
    await patient.getByRole("button", { name: "Davom ettirish" }).click();
    await expect(patient.getByText("● Ulashilmoqda")).toBeVisible();
    await patient.getByRole("switch", { name: /Bobur Test: ko‘ra oladi/ }).click();
    // The only chosen person removed: sharing is off, and choosing starts over.
    await expect(patient.getByText("○ O‘chirilgan")).toBeVisible();
    await expect(patient.getByRole("checkbox", { name: "Bobur Test" })).not.toBeChecked();
    await helper.reload();
    await expect(helper.getByText("Hech kim siz bilan joylashuvini ulashmayapti.")).toBeVisible();
    const api = await helper.request.get("/api/location/shared");
    expect(JSON.stringify(await api.json())).not.toContain("40.39");
  });

  test("stopping deletes the stored position and ends the banner", async ({ browser }) => {
    const { patient, patientContext, patientEmail } = await connected(browser);
    await startSharing(patient, patientContext);
    await patient.getByRole("button", { name: "Butunlay to‘xtatish" }).click();
    await expect(patient.getByText("○ O‘chirilgan")).toBeVisible();
    expect((await storedUser(patient, patientEmail)).location).toBeNull();
    await patient.goto("/");
    await expect(patient.getByText("Joylashuvingiz yaqinlaringizga ko‘rsatilmoqda")).toHaveCount(0);
  });

  test("ending the helper connection ends location access", async ({ browser }) => {
    const { patient, helper, patientContext } = await connected(browser);
    await startSharing(patient, patientContext);
    await patient.goto("/circle");
    await patient.getByRole("button", { name: /uchun ruxsatni bekor qilish/ }).click();
    await helper.goto("/caregiver/locations");
    await expect(helper.getByText("Hech kim siz bilan joylashuvini ulashmayapti.")).toBeVisible();
  });

  test("a refused permission enables nothing", async ({ browser }) => {
    const { patient, patientEmail } = await connected(browser);
    await patient.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    await patient.goto("/location");
    await patient.getByRole("checkbox", { name: "Bobur Test" }).check();
    await patient.getByRole("button", { name: "Ulashishni boshlash" }).click();
    await expect(patient.getByText(/ruxsat berilmadi, shuning uchun ulashish yoqilmadi/)).toBeVisible();
    await expect(patient.getByText("○ O‘chirilgan")).toBeVisible();
    expect((await storedUser(patient, patientEmail)).location).toBeNull();
  });

  test("offline, nothing is enabled and the person is told", async ({ browser }) => {
    const { patient, patientContext } = await connected(browser);
    await patientContext.grantPermissions(["geolocation"]);
    await patientContext.setGeolocation(FERGANA);
    await patient.goto("/location");
    await patient.getByRole("checkbox", { name: "Bobur Test" }).check();
    await patientContext.setOffline(true);
    await patient.getByRole("button", { name: "Ulashishni boshlash" }).click();
    await expect(patient.getByText(/Internet aloqasi yo‘q. Ulashish yoqilmadi./)).toBeVisible();
  });
});

test.describe("location API protections", () => {
  test("refuses visitors, refuses storing while sharing is off, refuses impossible positions", async ({ browser, request }) => {
    expect((await request.post("/api/location/update", { data: { kind: "unavailable" } })).status()).toBe(401);
    expect((await request.get("/api/location/shared")).status()).toBe(401);

    const { patient, patientContext, patientEmail } = await connected(browser);
    const body = { kind: "position", latitude: 40.38, longitude: 71.78, accuracy: 10, recordedAt: new Date().toISOString() };
    expect((await patient.request.post("/api/location/update", { data: body })).status()).toBe(409);
    expect((await storedUser(patient, patientEmail)).location).toBeNull();

    await startSharing(patient, patientContext);
    await patient.goto("about:blank");
    await patient.request.post(`${MOCK}/__test/location-age`, { data: { email: patientEmail, minutes: 1 } });
    expect((await patient.request.post("/api/location/update", { data: { ...body, latitude: 0, longitude: 0 } })).status()).toBe(400);
    expect((await patient.request.post("/api/location/update", { data: { ...body, recordedAt: "2020-01-01T00:00:00Z" } })).status()).toBe(400);
    expect((await patient.request.post("/api/location/update", { data: body })).status()).toBe(200);
    // Not more than once every 20 seconds.
    expect((await patient.request.post("/api/location/update", { data: body })).status()).toBe(429);
  });

  test("a helper who is not chosen sees nothing, even through the API", async ({ browser }) => {
    const { patient, patientContext } = await connected(browser);
    // A second helper, connected but not chosen for location.
    const other = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
    await signUp(other, "Dilshod", "Qarindosh yoki yordamchi");
    await patient.goto("/circle");
    await patient.getByRole("button", { name: "Taklif kodini yaratish" }).click();
    const code = (await patient.getByTestId("invite-code").textContent())!.trim();
    await other.goto("/caregiver/accept");
    await other.getByLabel("Taklif kodi").fill(code);
    await other.getByRole("button", { name: "Kodni tekshirish" }).click();
    await other.getByRole("button", { name: "Taklifni qabul qilish" }).click();

    await startSharing(patient, patientContext);
    const answer = await (await other.request.get("/api/location/shared")).json();
    expect(answer.people).toEqual([]);
  });
});

test("the location pages pass automated accessibility checks", async ({ browser }) => {
  const { patient, helper, patientContext } = await connected(browser);
  const check = async (page: Page) => {
    const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  };
  await patient.goto("/location");
  await check(patient);
  await startSharing(patient, patientContext);
  await check(patient);
  await helper.goto("/caregiver/locations");
  await expect(helper.locator(".leaflet-marker-icon")).toHaveCount(1);
  await check(helper);
});
