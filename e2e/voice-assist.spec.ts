import { expect, test, type Page } from "@playwright/test";
import { fakeSystemVoices, registerUser } from "./helpers";

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | "));
const clearSpoken = (page: Page) => page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken.length = 0));

async function enableAssist(page: Page) {
  await page.goto("/");
  await page.getByRole("switch", { name: /Ovozli yordam/ }).click();
  await expect(page.getByRole("switch", { name: /Ovozli yordam/ })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => spoken(page)).toContain("Ovozli yordam yoqildi");
}

const menu = (page: Page) => page.getByRole("navigation", { name: "Asosiy menyu" });

test.beforeEach(async ({ page }) => {
  await fakeSystemVoices(page, ["uz-UZ"]);
});

test("is off by default: tapping around says nothing", async ({ page }) => {
  await page.goto("/");
  await menu(page).getByRole("link", { name: "Xarita" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tibbiy muassasalar");
  await page.waitForTimeout(600);
  expect(await spoken(page)).toBe("");
  await expect(page.getByRole("group", { name: "Ovozli yordam boshqaruvi" })).toHaveCount(0);
});

test("announces pages, choices, results and cards, then stays silent once turned off", async ({ page }) => {
  await enableAssist(page);

  await menu(page).getByRole("link", { name: "Xarita" }).click();
  await expect.poll(() => spoken(page)).toContain("Tibbiy muassasalar sahifasi.");

  await page.getByText("Saralash", { exact: true }).click();
  await page.getByLabel("Turi").selectOption("pharmacy");
  await expect.poll(() => spoken(page)).toContain("Turi: Dorixona");
  await expect.poll(() => spoken(page)).toContain("Topildi: 1");

  await page.getByRole("button", { name: "Xarita", exact: true }).click();
  await expect.poll(() => spoken(page)).toContain("Xarita");
  await page.getByRole("button", { name: "Ro‘yxat" }).click();

  // Reached by keyboard, a card describes itself; opened, the new page says its name.
  const card = page.getByRole("link", { name: /Batafsil: DEMO — Namunaviy dorixona/ });
  await card.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(card).toBeFocused();
  await expect.poll(() => spoken(page)).toContain("DEMO — Namunaviy dorixona. Dorixona. Manzil va xizmatlarni");
  await card.press("Enter");
  await expect.poll(() => spoken(page)).toContain("DEMO — Namunaviy dorixona sahifasi.");

  await page.goto("/settings");
  await page.getByRole("switch", { name: /Bosilgan tugmalarni/ }).click();
  await expect(page.getByRole("group", { name: "Ovozli yordam boshqaruvi" })).toHaveCount(0);
  await clearSpoken(page);
  await page.getByRole("radio", { name: "Katta", exact: true }).check();
  await menu(page).getByRole("link", { name: "Bosh sahifa" }).click();
  await page.waitForTimeout(800);
  expect(await spoken(page)).toBe("");
});

test("reads a field's label when reached by keyboard", async ({ page }) => {
  await enableAssist(page);
  await page.goto("/map");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => spoken(page)).toContain("Muassasa yoki manzilni qidirish");
});

test("the SOS screen describes the choices, and never downloads the voice model", async ({ page }) => {
  const model: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/voices/")) model.push(request.url());
  });
  await enableAssist(page);
  await page.getByRole("link", { name: /SOS/ }).first().click();
  await expect.poll(() => spoken(page)).toContain("Tez yordamga qo‘ng‘iroq qilish yoki yaqiningizga xabar berishni tanlang");
  expect(model).toEqual([]);
});

test("speaks errors that the page shows", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
  });
  await enableAssist(page);
  await page.goto("/map");
  await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
  await expect.poll(() => spoken(page)).toContain("Joylashuvga ruxsat berilmadi");
});

test("repeat and stop are always at hand, and are not announced themselves", async ({ page }) => {
  await enableAssist(page);
  const bar = page.getByRole("group", { name: "Ovozli yordam boshqaruvi" });
  await expect(bar).toBeVisible();
  const before = (await spoken(page)).split(" | ").length;
  await bar.getByRole("button", { name: "Takrorlash" }).click();
  await expect.poll(async () => (await spoken(page)).split(" | ").length).toBe(before + 1);
  expect(await spoken(page)).not.toContain("Takrorlash");
});

test("medicine names are replaced by a neutral phrase unless the user opts in", async ({ page }) => {
  await registerUser(page);
  await page.goto("/routine/new");
  await page.getByLabel("Dori nomi").fill("Insulin");
  await page.getByLabel("1-vaqt").fill("12:00");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page).toHaveURL(/\/routine$/);
  await page.goto("/settings");
  await page.getByRole("switch", { name: /Bosilgan tugmalarni/ }).click();
  await page.goto("/routine");
  await clearSpoken(page);
  await page.getByRole("link", { name: /Insulin/ }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => spoken(page)).toContain("Shaxsiy ma’lumot");
  expect(await spoken(page)).not.toContain("Insulin");
});
