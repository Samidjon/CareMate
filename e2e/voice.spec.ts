import { expect, test } from "@playwright/test";
import { fakeSystemVoices, useRussian } from "./helpers";

test.describe("voice", () => {
  test("Russian speaks with Piper Irina, off the main thread", async ({ page }) => {
    test.setTimeout(120_000);
    await useRussian(page);
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await page.goto("/");
    await page.getByRole("button", { name: "Голосовая подсказка" }).click();
    await expect(page.getByText("Звучит голосовая подсказка.")).toBeVisible({ timeout: 90_000 });
    expect(workers.some((url) => url.endsWith("/piper-worker.js"))).toBe(true);
    await expect(page.getByText(/Основная голосовая модель не сработала/)).toHaveCount(0);
    await page.getByRole("button", { name: "Остановить" }).click();
    await expect(page.getByRole("button", { name: "Голосовая подсказка" })).toBeVisible();
  });

  test("Russian falls back to the system voice with a notice when Piper fails", async ({ page }) => {
    await useRussian(page);
    await fakeSystemVoices(page, ["ru-RU"]);
    await page.route("**/piper-worker.js", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "Голосовая подсказка" }).click();
    await expect(page.getByText(/Основная голосовая модель не сработала/)).toBeVisible();
    await expect(page.getByText("Голосовая подсказка завершена.")).toBeVisible();
  });

  test("Uzbek tells the user when the device has no Uzbek voice", async ({ page }) => {
    await fakeSystemVoices(page, ["en-US"]);
    await page.goto("/");
    await page.getByRole("button", { name: "Ovozli ko‘rsatma" }).click();
    await expect(page.getByText(/Qurilmada o‘zbek ovozi yo‘q/)).toBeVisible();
  });

  test("Says so honestly when no voice exists at all", async ({ page }) => {
    await fakeSystemVoices(page, []);
    await page.goto("/");
    await page.getByRole("button", { name: "Ovozli ko‘rsatma" }).click();
    await expect(page.getByText(/Ovoz mavjud emas/)).toBeVisible();
    await expect(page.getByText(/ko‘rsatma tugadi/)).toHaveCount(0);
  });

  test("The SOS screen never downloads the voice model", async ({ page }) => {
    await useRussian(page);
    await fakeSystemVoices(page, ["ru-RU"]);
    const modelRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/voices/") || request.url().includes("piper-worker")) modelRequests.push(request.url());
    });
    await page.goto("/sos");
    await page.getByRole("button", { name: "Голосовая подсказка" }).click();
    await expect(page.getByText("Голосовая подсказка завершена.")).toBeVisible();
    expect(modelRequests).toEqual([]);
  });

  test("Turning voice off removes the voice controls", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("switch", { name: /Ovozli ko‘rsatmalar/ }).click();
    await page.getByRole("link", { name: "Bosh sahifa", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assalomu alaykum!");
    await expect(page.getByRole("button", { name: "Ovozli ko‘rsatma" })).toHaveCount(0);
  });
});
