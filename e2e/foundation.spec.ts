import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { useRussian } from "./helpers";

test.describe("home", () => {
  test("shows the four main actions on one phone screen", async ({ page }) => {
    await page.goto("/");
    const actions = page.getByRole("navigation", { name: "Asosiy amallar" }).getByRole("link");
    await expect(actions).toHaveCount(4);
    await expect(actions.first()).toHaveAttribute("href", "/sos");
    const box = await actions.last().boundingBox();
    expect(box!.y + box!.height).toBeLessThan(812 - 64); // Above the bottom navigation.
  });

  test("SOS and language switching work without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://localhost:3100" });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "RU", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.getByRole("link", { name: /SOS/ }).click();
    await expect(page).toHaveURL(/\/sos$/);
    await expect(page.getByRole("link", { name: "Позвонить по номеру 103" })).toHaveAttribute("href", "tel:103");
    await context.close();
  });
});

test.describe("language", () => {
  test("switching updates the page language and persists across pages and reloads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "uz");
    await page.getByRole("button", { name: "RU", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Здравствуйте!");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.getByRole("link", { name: "Карта" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Медицинские учреждения");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
});

test.describe("accessibility settings", () => {
  test("persist across reloads and apply on every page", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Juda katta" }).check();
    await page.getByRole("switch", { name: /Yuqori kontrast/ }).click();
    await expect(page.getByRole("switch", { name: /Yuqori kontrast/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("link", { name: "Sog‘ligim" }).click();
    await page.waitForURL(/routine/);
    await page.reload();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-text-size", "xl");
    await expect(html).toHaveAttribute("data-contrast", "high");
    const fontSize = await html.evaluate((element) => getComputedStyle(element).fontSize);
    expect(fontSize).toBe("23px");
  });

  test("the extra large text does not cause sideways scrolling", async ({ page, context }) => {
    await context.addCookies([
      { name: "cm_settings", value: encodeURIComponent(JSON.stringify({ textSize: "xl" })), url: "http://localhost:3100" },
    ]);
    for (const path of ["/", "/sos", "/settings", "/map"]) {
      await page.goto(path);
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
          .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 30)}`),
      );
      expect(wide, path).toEqual([]);
    }
  });
});

test.describe("SOS", () => {
  test("offers the configured call link and makes no false claims", async ({ page }) => {
    await page.goto("/sos");
    await expect(page.getByRole("link", { name: /103/ })).toHaveAttribute("href", "tel:103");
    await expect(page.getByText(/Yuborildi|Отправлено/)).toHaveCount(0);
  });

  test("shows coordinates when location is allowed", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.3864, longitude: 71.7864 });
    await page.goto("/sos");
    await page.getByRole("button", { name: "Joylashuvni aniqlash" }).click();
    await expect(page.getByText("40.38640, 71.78640")).toBeVisible();
  });

  test("explains what to do when location is refused", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) =>
        fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    await page.goto("/sos");
    await page.getByRole("button", { name: "Joylashuvni aniqlash" }).click();
    await expect(page.getByText(/Joylashuvni aniqlab bo‘lmadi/)).toBeVisible();
  });
});

test.describe("automated accessibility checks", () => {
  for (const path of ["/", "/sos", "/settings", "/map", "/routine", "/circle"]) {
    for (const contrast of [false, true]) {
      test(`${path}${contrast ? " high contrast" : ""}`, async ({ page, context }) => {
        await useRussian(page);
        await context.addCookies([
          {
            name: "cm_settings",
            value: encodeURIComponent(JSON.stringify({ highContrast: contrast })),
            url: "http://localhost:3100",
          },
        ]);
        await page.goto(path);
        // Signed-in pages redirect to login; check the page that is finally shown.
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
      });
    }
  }

  test("all interactive elements are at least 48 pixels tall and wide", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("a, button, label:has(input)")]
        // Hidden copies exist briefly while the page streams in; measure what is shown.
        .filter((element) => !element.classList.contains("sr-only") && element.checkVisibility())
        .map((element) => ({ text: element.textContent?.trim(), box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width < 48 || box.height < 48)
        .map(({ text }) => text),
    );
    expect(small).toEqual([]);
  });

  test("the skip link moves focus to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /Asosiy mazmunga/ });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
