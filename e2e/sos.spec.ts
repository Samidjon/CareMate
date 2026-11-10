import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOCK, registerUser, storedUser } from "./helpers";

const FERGANA = { latitude: 40.3864, longitude: 71.7864 };

async function addContact(page: Page, name = "Dilnoza", phone = "+998901112233") {
  await page.goto("/circle");
  await page.getByLabel("Ismi", { exact: true }).fill(name);
  await page.getByRole("textbox", { name: /^Telefon/ }).fill(phone);
  await page.getByRole("button", { name: "Kontakt qo‘shish" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`${name}ga qo‘ng‘iroq`) })).toBeVisible();
}

test.describe("real SOS screen", () => {
  test("opens with no account and offers the call directly", async ({ page }) => {
    await page.goto("/sos");
    await expect(page.getByRole("link", { name: /103/ })).toHaveAttribute("href", "tel:103");
    await expect(page.getByText(/hisobingizga kiring/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Yaqinlarimga xabar berish" })).toHaveCount(0);
  });

  test("the home button reaches it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /SOS/ }).click();
    await expect(page).toHaveURL(/\/sos$/);
  });

  test("still opens when the database is unreachable", async ({ page, context }) => {
    await registerUser(page);
    // Everything the browser asks for beyond the page itself fails, as if Supabase were down.
    await context.route("**/api/**", (route) => route.abort());
    await page.goto("/sos");
    await expect(page.getByRole("link", { name: /103/ })).toBeVisible();
    await expect(page.getByText("Kontaktlarni yuklab bo‘lmadi.")).toBeVisible();
  });

  test("the notification is not described as calling an ambulance", async ({ page }) => {
    await registerUser(page);
    await page.goto("/sos");
    await expect(page.getByText("Bu tez yordam chaqirish emas. Bu faqat yaqinlaringizga xabar.")).toBeVisible();
  });

  test("waits before sending, and can be cancelled with nothing saved", async ({ page }) => {
    const email = await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByRole("timer")).toContainText("soniyadan keyin");
    // The call stays available on the confirmation step.
    await expect(page.getByRole("link", { name: /103/ })).toBeVisible();
    await page.getByRole("button", { name: "Bekor qilish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Yaqinlarimga xabar berish" })).toBeVisible();
    await page.waitForTimeout(5500);
    expect((await storedUser(page, email)).events).toEqual([]);
  });

  test("records the event with location and time, and says nobody was notified", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FERGANA);
    const email = await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/ulangan yordamchi yo‘q/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Hech kimga xabar bormadi/)).toBeVisible();
    await expect(page.getByText(/^Vaqt: \d\d:\d\d$/)).toBeVisible();
    await expect(page.getByText("Koordinatalar: 40.38640, 71.78640")).toBeVisible();

    const { events } = await storedUser(page, email);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ is_demo: false, latitude: FERGANA.latitude, longitude: FERGANA.longitude });
  });

  test("with a linked helper but no provider, it records that and claims nothing", async ({ page }) => {
    const email = await registerUser(page);
    const { id } = await storedUser(page, email);
    await page.request.post(`${MOCK}/__test/link`, { data: { patient_id: id } });
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/telefonga xabar yuborish hali sozlanmagan/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Yuborildi:/)).toHaveCount(0);
    const { notifications } = await storedUser(page, email);
    expect(notifications.map((item: { status: string }) => item.status)).toEqual(["not_configured", "not_configured"]);
  });

  test("offers a manual address when location is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    const email = await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await page.getByLabel("Joylashuv olinmadi. Manzilingizni yozing.").fill("Mustaqillik ko‘chasi 5", { timeout: 15_000 });
    await page.getByRole("button", { name: "Manzilni saqlash" }).click();
    await expect(page.getByText("Manzil saqlandi.")).toBeVisible();
    expect((await storedUser(page, email)).events[0].manual_address).toBe("Mustaqillik ko‘chasi 5");
  });

  test("an alert can be cancelled afterwards", async ({ page }) => {
    const email = await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await page.getByRole("button", { name: "Xavotirni bekor qilish" }).click({ timeout: 15_000 });
    await expect(page.getByText("Xavotir bekor qilindi.")).toBeVisible();
    expect((await storedUser(page, email)).events[0].status).toBe("cancelled");
  });

  test("offline, it says nothing was sent and offers a retry", async ({ page, context }) => {
    await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await context.setOffline(true);
    await expect(page.getByText("Internet yo‘q, xabar yuborilmadi. Qo‘ng‘iroq qiling.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Qayta urinish" })).toBeVisible();
    await expect(page.getByRole("link", { name: /103/ })).toBeVisible();
  });

  test("a server failure is reported as a failure", async ({ page }) => {
    await registerUser(page);
    await page.route("**/api/sos", (route) => route.fulfill({ status: 500, json: { error: "save_failed" } }));
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText("Yuborib bo‘lmadi. Yaqiningizga o‘zingiz qo‘ng‘iroq qiling.")).toBeVisible({ timeout: 15_000 });
  });

  test("contacts get call and SMS links carrying the location", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FERGANA);
    await registerUser(page);
    await addContact(page);
    await page.goto("/sos");
    await expect(page.getByRole("link", { name: "Dilnozaga qo‘ng‘iroq" })).toHaveAttribute("href", "tel:+998901112233");
    const sms = page.getByRole("link", { name: "Dilnozaga SMS" });
    await expect(sms).toHaveAttribute("href", /^sms:\+998901112233\?&body=/);
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/^Vaqt:/)).toBeVisible({ timeout: 15_000 });
    await expect(sms).toHaveAttribute("href", /mlat%3D40\.3864/);
  });

  test("the API refuses visitors and bad input", async ({ page, request }) => {
    expect((await request.post("/api/sos", { data: { demo: true, latitude: null, longitude: null, accuracy: null } })).status()).toBe(401);
    expect((await request.get("/api/emergency-contacts")).status()).toBe(401);
    await registerUser(page);
    const bad = await page.request.post("/api/sos", { data: { demo: false, latitude: 999, longitude: 71, accuracy: null } });
    expect(bad.status()).toBe(400);
  });
});

test.describe("demo mode", () => {
  test("has no real call link and is marked throughout", async ({ page }) => {
    await page.goto("/sos/demo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DEMO");
    await expect(page.getByText(/bu sinov/)).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="sms:"]')).toHaveCount(0);
  });

  test("offers a way straight to the real screen", async ({ page }) => {
    await page.goto("/sos/demo");
    await page.getByRole("link", { name: "Haqiqiy SOS ekraniga o‘tish" }).click();
    await expect(page).toHaveURL(/\/sos$/);
    await expect(page.getByRole("link", { name: /103/ })).toBeVisible();
  });

  test("does not stay on: the home button still leads to the real screen", async ({ page }) => {
    await page.goto("/sos/demo");
    await page.getByRole("link", { name: "Bosh sahifa", exact: true }).click();
    await page.getByRole("link", { name: /SOS/ }).click();
    await expect(page).toHaveURL(/\/sos$/);
    await expect(page.getByText(/bu sinov/)).toHaveCount(0);
  });

  test("a signed-in run is stored as a demo and reaches nobody", async ({ page }) => {
    const email = await registerUser(page);
    const { id } = await storedUser(page, email);
    await page.request.post(`${MOCK}/__test/link`, { data: { patient_id: id } });
    await addContact(page);
    await page.goto("/sos/demo");
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/DEMO: voqea sinov tariqasida yakunlandi/)).toBeVisible({ timeout: 15_000 });
    const data = await storedUser(page, email);
    expect(data.events[0].is_demo).toBe(true);
    expect(data.notifications).toEqual([]);
  });

  test("a visitor can try it, and nothing is sent to the server", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) calls.push(request.url());
    });
    await page.goto("/sos/demo");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/DEMO: voqea sinov tariqasida yakunlandi/)).toBeVisible({ timeout: 15_000 });
    expect(calls).toEqual([]);
  });
});

test.describe("emergency contacts", () => {
  test("can be added and removed", async ({ page }) => {
    await registerUser(page);
    await addContact(page);
    await page.getByRole("button", { name: "Dilnozani o‘chirish" }).click();
    await expect(page.getByText("Hali kontakt yo‘q.")).toBeVisible();
  });

  test("reject an invalid phone number", async ({ page }) => {
    await registerUser(page);
    await page.goto("/circle");
    await page.getByLabel("Ismi", { exact: true }).fill("Dilnoza");
    await page.getByRole("textbox", { name: /^Telefon/ }).fill("abc");
    await page.getByRole("button", { name: "Kontakt qo‘shish" }).click();
    await expect(page.getByText(/Telefon raqamini/)).toBeVisible();
  });

  test("are private to the account", async ({ page, context }) => {
    await registerUser(page);
    await addContact(page);
    await context.clearCookies();
    await registerUser(page);
    await page.goto("/circle");
    await expect(page.getByText("Hali kontakt yo‘q.")).toBeVisible();
  });
});

test.describe("automated accessibility checks", () => {
  for (const path of ["/sos", "/sos/demo"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  }

  test("/sos signed in, after an alert", async ({ page }) => {
    await registerUser(page);
    await page.goto("/sos");
    await page.getByRole("button", { name: "Yaqinlarimga xabar berish" }).click();
    await expect(page.getByText(/^Vaqt:/)).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });

  test("/circle", async ({ page }) => {
    await registerUser(page);
    await addContact(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });
});
