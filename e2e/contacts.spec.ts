import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MOCK, registerUser } from "./helpers";

const WITH_NUMBERS = "/map/00000000-0000-4000-8000-000000000001";
const WITHOUT = "/map/00000000-0000-4000-8000-000000000002";
const UNREADABLE = "/map/00000000-0000-4000-8000-000000000004";

test.describe("facility phone numbers", () => {
  test("a facility with numbers offers a call button with the right tel: link", async ({ page }) => {
    await page.goto("/map");
    const card = page.getByRole("article").filter({ hasText: "Namunaviy shifoxona" });
    await expect(card).toContainText("Telefon: +998 73 000 00 00");
    await expect(card.getByRole("link", { name: /Qo‘ng‘iroq qilish/ })).toHaveAttribute("href", "tel:+998730000000");
  });

  test("a facility without a number says so and shows no call button", async ({ page }) => {
    await page.goto("/map");
    const card = page.getByRole("article").filter({ hasText: "Namunaviy klinika" });
    await expect(card).toContainText("Telefon: Telefon raqami mavjud emas");
    await expect(card.getByRole("link", { name: /Qo‘ng‘iroq/ })).toHaveCount(0);
    await page.goto(WITHOUT);
    await expect(page.getByRole("region", { name: "Aloqa" })).toContainText("Telefon raqami mavjud emas");
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("an unreadable number is shown as written but cannot be dialled", async ({ page }) => {
    await page.goto(UNREADABLE);
    const contacts = page.getByRole("region", { name: "Aloqa" });
    await expect(contacts).toContainText("Asosiy raqam: 12-34");
    await expect(contacts).toContainText(/qo‘ng‘iroq tugmasi yo‘q/);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("several numbers appear with their kind, source and verification", async ({ page }) => {
    await page.goto(WITH_NUMBERS);
    const contacts = page.getByRole("region", { name: "Aloqa" });
    await expect(contacts).toContainText("Qabulxona: +998 73 000 00 00");
    await expect(contacts).toContainText("Navbatga yozilish: +998 73 000 00 01");
    await expect(contacts).toContainText("Manba: Rasmiy sayt. Rasmiy tasdiqlangan.");
    await expect(contacts.getByRole("link", { name: "Qabulxonaga qo‘ng‘iroq" })).toHaveAttribute("href", "tel:+998730000000");
    await expect(contacts.getByRole("link", { name: "Navbat uchun qo‘ng‘iroq" })).toHaveAttribute("href", "tel:+998730000001");
    await expect(contacts.getByRole("link", { name: "Rasmiy saytni ochish" })).toHaveAttribute("href", "https://example.org");
  });

  test("the Russian interface uses Позвонить", async ({ page, context }) => {
    await context.addCookies([{ name: "cm_lang", value: "ru", url: "http://localhost:3100" }]);
    await page.goto("/map");
    await expect(page.getByRole("article").filter({ hasText: "Образец больницы" }).getByRole("link", { name: /Позвонить/ })).toBeVisible();
  });
});

test.describe("administrators maintaining contacts", () => {
  test("only administrators see the editor", async ({ page }) => {
    await registerUser(page);
    await page.goto(WITH_NUMBERS);
    await expect(page.getByRole("link", { name: "Kontaktlarni tahrirlash" })).toHaveCount(0);
    await page.goto("/admin/facilities/00000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });

  test("an administrator saves checked numbers, and wrong ones are refused", async ({ page }) => {
    const email = await registerUser(page);
    await page.request.post(`${MOCK}/__test/admin`, { data: { email } });
    await page.goto(WITHOUT);
    await page.getByRole("link", { name: "Kontaktlarni tahrirlash" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kontaktlarni tahrirlash");

    await page.getByLabel("Telefon raqamlari").fill("reception: +998 73 244 93 93\nappointments: 12-34");
    await page.getByLabel("Tekshiruv holati").selectOption("officially_verified");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Bu qatorlar noto‘g‘ri: 2")).toBeVisible();

    await page.getByLabel("Telefon raqamlari").fill("reception: +998 73 244 93 93\nemergency: 73 244 00 03");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Rasmiy tasdiq uchun manbani yozing.")).toBeVisible();

    await page.getByLabel("Ma’lumot manbasi").fill("Klinikaning rasmiy sayti");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText(/Saqlandi. O‘zgarish jurnalga yozildi./)).toBeVisible();

    await page.goto(WITHOUT);
    const contacts = page.getByRole("region", { name: "Aloqa" });
    await expect(contacts).toContainText("Qabulxona: +998 73 244 93 93");
    await expect(contacts).toContainText("Shoshilinch bo‘lim: 73 244 00 03");
    await expect(contacts.getByRole("link", { name: "Shoshilinch bo‘limga qo‘ng‘iroq" })).toHaveAttribute("href", "tel:+998732440003");
    await expect(contacts).toContainText("Manba: Klinikaning rasmiy sayti. Rasmiy tasdiqlangan.");
  });
});

test("the contact sections pass automated accessibility checks", async ({ page }) => {
  for (const path of [WITH_NUMBERS, UNREADABLE]) {
    await page.goto(path);
    const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  }
});
