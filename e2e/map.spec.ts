import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { registerUser, useRussian } from "./helpers";

const FACILITY = "/map/00000000-0000-4000-8000-000000000001";
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const search = (page: Page) => page.getByRole("combobox", { name: "Muassasa yoki manzilni qidirish" });
const openFilters = (page: Page) => page.getByText("Saralash", { exact: true }).click();
const results = (page: Page) => page.getByRole("main").getByRole("article");

test.beforeEach(async ({ page }) => {
  // No test may load the public tile server.
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
});

test.describe("facility list", () => {
  test("shows each facility as a card with category, distance status, access and actions", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByText("Topildi: 3")).toBeVisible();
    const card = results(page).filter({ hasText: "Namunaviy shifoxona" });
    await expect(card).toContainText("Shifoxona");
    await expect(card).toContainText("DEMO — haqiqiy joy emas");
    await expect(card).toContainText("Aravacha bilan kirish: ✓ Bor");
    await expect(card.getByRole("link", { name: /Batafsil/ })).toHaveAttribute("href", "/map/00000000-0000-4000-8000-000000000001");
    await expect(card.getByRole("link", { name: /Qo‘ng‘iroq/ })).toHaveAttribute("href", "tel:+998730000000");
    await expect(results(page).filter({ hasText: "Namunaviy klinika" })).toContainText("Aravacha bilan kirish: ma’lum emas");
  });

  test("the search box uses the requested wording in both languages", async ({ page }) => {
    await page.goto("/map");
    await expect(search(page)).toHaveAttribute("placeholder", "Nom, tuman yoki manzil");
    await useRussian(page);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Поиск учреждения или адреса" })).toHaveAttribute("placeholder", "Название, район или адрес");
  });

  test("filters the list as you type, by name or address, and says when nothing matches", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("dorixona");
    await expect(page.getByText("Topildi: 1")).toBeVisible();
    await search(page).fill("manzil 2");
    await expect(results(page).filter({ hasText: "Namunaviy klinika" })).toBeVisible();
    await search(page).fill("yo'q narsa");
    await expect(page.getByText("Hech narsa topilmadi")).toBeVisible();
  });

  test("suggests facilities and addresses, and works by keyboard", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("Mustaqillik");
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option", { name: /Mustaqillik ko‘chasi, Farg‘ona/ })).toBeVisible();
    await search(page).press("ArrowDown");
    await expect(search(page)).toHaveAttribute("aria-activedescendant", /option-0/);
    await search(page).press("Enter");
    // An address becomes the starting point; the list is sorted by distance from it.
    await expect(page.getByText("Masofa shu joydan hisoblanadi: Mustaqillik ko‘chasi, Farg‘ona")).toBeVisible();
    await expect(page.getByText(/to‘g‘ri chiziq bo‘yicha/).first()).toBeVisible();
    await expect(results(page).first()).toContainText("Namunaviy dorixona");
  });

  test("picking a facility suggestion shows that facility", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("klinika");
    await page.getByRole("option", { name: /Namunaviy klinika/ }).click();
    await expect(page.getByText("Topildi: 1")).toBeVisible();
    await expect(results(page).first()).toContainText("Namunaviy klinika");
  });

  test("address search failing does not stop facility search", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("xatolik bor");
    await expect(page.getByText(/Manzil qidiruvi hozir ishlamayapti/)).toBeVisible();
    await search(page).fill("shifoxona");
    await expect(page.getByText("Topildi: 1")).toBeVisible();
  });

  test("filters by category and accessibility, inside a collapsed panel", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByLabel("Turi")).toBeHidden();
    await openFilters(page);
    await page.getByLabel("Turi").selectOption("hospital");
    await expect(page.getByText("Topildi: 1")).toBeVisible();
    await page.getByLabel("Turi").selectOption("all");
    await page.getByRole("checkbox", { name: "Lift" }).check();
    await expect(page.getByText("Topildi: 1")).toBeVisible();
    await expect(results(page).first()).toContainText("Namunaviy shifoxona");
  });

  test("only categories that exist are offered", async ({ page }) => {
    await page.goto("/map");
    await openFilters(page);
    await expect(page.getByLabel("Turi").locator("option")).toHaveText(["Hammasi", "Shifoxona", "Klinika", "Dorixona"]);
  });
});

test.describe("current location", () => {
  test("asks only when pressed, finds the address and sorts by distance", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.365, longitude: 71.755 });
    await page.goto("/map");
    await expect(page.getByText(/to‘g‘ri chiziq/)).toHaveCount(0);
    await expect(page.getByText(/joylashuvingiz faqat yaqin muassasalarni/i)).toBeVisible();
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText("Manzil aniqlandi: Al-Farg‘oniy 5, Farg‘ona")).toBeVisible();
    await expect(results(page).first()).toContainText("Namunaviy dorixona");
    await openFilters(page);
    await page.getByLabel("Masofa").selectOption("3");
    await expect(page.getByText("Topildi: 1")).toBeVisible();
    await page.getByRole("button", { name: "Joyni olib tashlash" }).click();
    await expect(page.getByText(/to‘g‘ri chiziq/)).toHaveCount(0);
  });

  test("explains a refusal and keeps search working", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    await page.goto("/map");
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText("Joylashuvga ruxsat berilmadi. Manzilingizni qidiruvga yozing.")).toBeVisible();
    await search(page).fill("dorixona");
    await expect(page.getByText("Topildi: 1")).toBeVisible();
  });

  test("explains when the position cannot be found", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 2, message: "unavailable" } as GeolocationPositionError);
    });
    await page.goto("/map");
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText(/Joylashuvni aniqlab bo‘lmadi/)).toBeVisible();
  });

  test("never puts the position in a web address", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.365, longitude: 71.755 });
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    await page.goto("/map");
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText(/Manzil aniqlandi/)).toBeVisible();
    expect(urls.filter((url) => url.includes("40.365"))).toEqual([]);
  });
});

test.describe("map view", () => {
  test("is off until chosen, so the list works without it", async ({ page }) => {
    const tiles: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("tile.openstreetmap")) tiles.push(request.url());
    });
    await page.goto("/map");
    await expect(page.getByText("Topildi: 3")).toBeVisible();
    expect(tiles).toEqual([]);
  });

  test("keeps the search when switching, and selecting a marker shows its card", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("namunaviy");
    await page.getByRole("button", { name: "Xarita", exact: true }).click();
    await expect(page.getByRole("button", { name: "Xarita", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(3);
    await expect(page.getByText("Belgini bosing yoki ro‘yxatdan tanlang.")).toBeVisible();
    await page.locator('.leaflet-marker-icon[title*="Namunaviy klinika"]').click();
    const selected = page.getByRole("region", { name: "Tanlangan muassasa" });
    await expect(selected).toContainText("Namunaviy klinika");
    await page.getByRole("button", { name: "Ro‘yxat" }).click();
    await expect(search(page)).toHaveValue("namunaviy");
    await expect(page.getByText("Topildi: 3")).toBeVisible();
  });

  test("markers follow the filters, and zoom buttons are large enough to tap", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("button", { name: "Xarita", exact: true }).click();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(3);
    await openFilters(page);
    await page.getByLabel("Turi").selectOption("pharmacy");
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
    const zoom = await page.locator(".leaflet-control-zoom-in").boundingBox();
    expect(zoom!.width).toBeGreaterThanOrEqual(48);
    await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  });
});

test.describe("facility details", () => {
  test("shows contact details, readable hours, specialities and honest gaps", async ({ page }) => {
    await page.goto(FACILITY);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Namunaviy shifoxona");
    await expect(page.getByText(/Bunday muassasa mavjud emas/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Qo‘ng‘iroq qilish/ })).toHaveAttribute("href", "tel:+998730000000");
    await expect(page.getByText("Du–Sh 08:00–18:00")).toBeVisible();
    await expect(page.getByText("Kardiologiya")).toBeVisible();
    await expect(page.getByRole("link", { name: "example.org" })).toHaveAttribute("href", "https://example.org");
    await expect(page.getByText("Bu muassasaning tekshirilgan surati yo‘q.")).toBeVisible();
    // No description is invented.
    await expect(page.getByText("Ma’lumot mavjud emas").first()).toBeVisible();
    await expect(page.getByText("CareMate demo data")).toBeVisible();
  });

  test("distinguishes yes, no and unknown in words", async ({ page }) => {
    await page.goto("/map/00000000-0000-4000-8000-000000000004");
    const row = (name: string) => page.locator("div", { has: page.getByText(name, { exact: true }) }).last();
    await expect(row("Qulay kirish")).toContainText("Bor");
    await expect(row("Nogironlar aravachasi uchun pandus")).toContainText("Yo‘q");
    await expect(row("Lift")).toContainText("Ma’lum emas");
    await expect(row("Eshitishi zaif insonlarga yordam")).toContainText("Ma’lum emas");
  });

  test("walking route uses a walking service, with a sidewalk caution", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.39, longitude: 71.78 });
    await page.goto(FACILITY);
    await page.getByRole("button", { name: "Mening joylashuvimni aniqlash" }).click();
    await expect(page.getByText(/taxminan 0.\d km \(to‘g‘ri chiziq bo‘yicha\)/)).toBeVisible();
    await page.getByRole("button", { name: "Piyoda yo‘lni ko‘rsatish" }).click();
    await expect(page.getByText("Piyoda taxminan 27 daqiqa, 2.0 km.")).toBeVisible();
    await expect(page.getByText(/Yo‘lak va pandus haqidagi ma’lumot/)).toBeVisible();
    await expect(page.locator(".leaflet-container path.leaflet-interactive")).toBeVisible();
  });

  test("the starting point chosen on the map carries over", async ({ page }) => {
    await page.goto("/map");
    await search(page).fill("Mustaqillik");
    await page.getByRole("option", { name: /Mustaqillik ko‘chasi/ }).click();
    await results(page).first().getByRole("link", { name: /Batafsil/ }).click();
    await expect(page.getByText(/Mustaqillik ko‘chasi, Farg‘onadan taxminan/)).toBeVisible();
  });

  test("opens walking directions in navigation apps", async ({ page }) => {
    await page.goto(FACILITY);
    await expect(page.getByRole("link", { name: /Google Maps’da piyoda/ })).toHaveAttribute("href", /destination=40\.3864,71\.7864&travelmode=walking/);
    await expect(page.getByRole("link", { name: /Yandex Maps’da piyoda/ })).toHaveAttribute("href", /rtt=pd/);
  });

  test("an unknown address gives a clear page", async ({ page }) => {
    await page.goto("/map/not-a-real-id");
    await expect(page.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });
});

test.describe("saving and reporting", () => {
  test("visitors are asked to sign in to report a problem", async ({ page }) => {
    await page.goto(FACILITY);
    await page.getByText("Ma’lumotda xato bormi?").click();
    await expect(page.getByText(/hisobingizga kiring/)).toBeVisible();
  });

  test("a signed-in person can save a place and report an error for review", async ({ page }) => {
    await registerUser(page);
    await page.goto(FACILITY);
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("✓ Saqlangan")).toBeVisible();
    await page.getByRole("button", { name: "Saqlanganlardan olib tashlash" }).click();
    await expect(page.getByRole("button", { name: "Saqlash" })).toBeVisible();

    await page.getByText("Ma’lumotda xato bormi?").click();
    await page.getByLabel("Nima noto‘g‘ri?").selectOption("phone");
    await page.getByLabel("Qisqacha yozing").fill("Telefon raqami o‘zgargan");
    await page.getByRole("button", { name: "Yuborish" }).click();
    await expect(page.getByText(/Administrator tekshiradi/)).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("the list, the map view and the details pass automated checks", async ({ page }) => {
    const check = async () => {
      const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    };
    await page.goto("/map");
    await search(page).fill("Mustaqillik");
    await expect(page.getByRole("listbox")).toBeVisible();
    await check();
    await search(page).fill("");
    await page.getByRole("button", { name: "Xarita", exact: true }).click();
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
    await check();
    await page.goto(FACILITY);
    await check();
  });

  test("markers can be reached by keyboard and are named", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("button", { name: "Xarita", exact: true }).click();
    const marker = page.locator(".leaflet-marker-icon").first();
    await expect(marker).toHaveAttribute("tabindex", "0");
    await expect(marker).toHaveAttribute("title", /DEMO/);
  });
});

test.describe("when Supabase is not configured", () => {
  test("the map says so honestly", async ({ page }) => {
    await page.goto("http://localhost:3101/map");
    await expect(page.getByText("Muassasalar bazasi hali ulanmagan.")).toBeVisible();
    await expect(page.getByText(/Topildi:/)).toHaveCount(0);
  });
});
