import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fakeSystemVoices, registerUser, storedUser } from "./helpers";

/** A time in Fergana, a given number of minutes from now, as HH:MM. */
function fergana(minutesFromNow: number) {
  return new Date(Date.now() + 5 * 3600_000 + minutesFromNow * 60_000).toISOString().slice(11, 16);
}

async function addMedicine(page: Page, name: string, time: string) {
  await page.goto("/routine/new");
  await page.getByLabel("Dori nomi").fill(name);
  await page.getByLabel(/Qabul qilish tartibi/).fill("Ovqatdan keyin bitta");
  await page.getByLabel("1-vaqt").fill(time);
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page).toHaveURL(/\/routine$/);
}

// The minutes-from-now arithmetic cannot cross midnight in Fergana, or "today" changes.
test.beforeEach(() => {
  const minutes = new Date(Date.now() + 5 * 3600_000).getUTCHours() * 60 + new Date(Date.now() + 5 * 3600_000).getUTCMinutes();
  test.skip(minutes < 5 || minutes > 1370, "Runs too close to midnight in Fergana");
});

test.describe("medicines", () => {
  test("visitors are sent to log in", async ({ page }) => {
    await page.goto("/routine");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("the form states that CareMate gives no medical advice", async ({ page }) => {
    await registerUser(page);
    await page.goto("/routine/new");
    await expect(page.getByText(/dozani hisoblamaydi/)).toBeVisible();
  });

  test("a medicine due now appears with its instructions and all four actions", async ({ page }) => {
    await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    const card = page.getByRole("listitem").filter({ hasText: "Soat" });
    await expect(card).toContainText("Aspirin");
    await expect(card).toContainText("Ovqatdan keyin bitta");
    await expect(card).toContainText("Qabul qilish vaqti");
    for (const action of ["Qabul qildim", "Keyinroq eslat", "O‘tkazib yuborish", "Yordam kerak"]) {
      await expect(card.getByRole("button", { name: action })).toBeVisible();
    }
  });

  test("taking a dose records it in the history and closes it", async ({ page }) => {
    const email = await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    await page.getByRole("button", { name: "Qabul qildim" }).click();
    await expect(page.getByText("✓ Qabul qilindi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Qabul qildim" })).toHaveCount(0);
    expect((await storedUser(page, email)).logs[0].status).toBe("taken");

    await page.getByRole("link", { name: "Qabul tarixi" }).click();
    await expect(page).toHaveURL(/\/routine\/history$/);
    await expect(page.getByText("Aspirin")).toBeVisible();
    await expect(page.getByText("Qabul qilindi")).toBeVisible();
  });

  test("a later reminder says when it will come back", async ({ page }) => {
    await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    await page.getByRole("button", { name: "Keyinroq eslat" }).click();
    await expect(page.getByText(/\d\d:\d\d da eslatiladi/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Qabul qildim" })).toBeVisible();
  });

  test("skipping is recorded", async ({ page }) => {
    const email = await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    await page.getByRole("button", { name: "O‘tkazib yuborish" }).click();
    await expect(page.getByText("O‘tkazib yuborildi")).toBeVisible();
    expect((await storedUser(page, email)).logs[0].status).toBe("skipped");
  });

  test("asking for help leads to the SOS screen and leaves the dose open", async ({ page }) => {
    await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    await page.getByRole("button", { name: "Yordam kerak" }).click();
    await expect(page.getByText(/Belgilandi/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Qabul qildim" })).toBeVisible();
    await page.getByRole("link", { name: "SOS ekraniga o‘tish" }).click();
    await expect(page).toHaveURL(/\/sos$/);
  });

  test("a dose that is not due yet offers only 'taken'", async ({ page }) => {
    await registerUser(page);
    await addMedicine(page, "Vitamin", fergana(120));
    await expect(page.getByText("Vaqti kelmagan")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yordam kerak" })).toHaveCount(0);
  });

  test("a medicine not scheduled today does not appear in today's list", async ({ page }) => {
    await registerUser(page);
    const today = new Date(Date.now() + 5 * 3600_000).getUTCDay() || 7;
    await page.goto("/routine/new");
    await page.getByLabel("Dori nomi").fill("Boshqa kun");
    await page.getByLabel("1-vaqt").fill("12:00");
    const days = page.getByRole("group", { name: "Hafta kunlari" }).getByRole("checkbox");
    for (let index = 0; index < 7; index++) {
      if (index + 1 === today) await days.nth(index).uncheck();
    }
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Bugun uchun dori yo‘q.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Boshqa kun" })).toBeVisible();
  });

  test("the form explains missing and invalid values", async ({ page }) => {
    await registerUser(page);
    await page.goto("/routine/new");
    const days = page.getByRole("group", { name: "Hafta kunlari" }).getByRole("checkbox");
    for (let index = 0; index < 7; index++) await days.nth(index).uncheck();
    await page.getByLabel(/Tugash sanasi/).fill("2000-01-01");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText("Bu maydonni to‘ldiring.")).toBeVisible();
    await expect(page.getByText(/Kamida bitta vaqt/)).toBeVisible();
    await expect(page.getByText("Kamida bitta kunni tanlang.")).toBeVisible();
  });

  test("several times make several doses", async ({ page }) => {
    await registerUser(page);
    await page.goto("/routine/new");
    await page.getByLabel("Dori nomi").fill("Aspirin");
    await page.getByLabel("1-vaqt").fill(fergana(60));
    await page.getByRole("button", { name: "Yana vaqt qo‘shish" }).click();
    await page.getByLabel("2-vaqt").fill(fergana(120));
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page).toHaveURL(/\/routine$/);
    await expect(page.getByText("Vaqti kelmagan")).toHaveCount(2);
  });

  test("can be edited, stopped and deleted", async ({ page }) => {
    await registerUser(page);
    const time = fergana(60);
    await addMedicine(page, "Aspirin", time);
    await page.getByRole("link", { name: /^Aspirin/ }).click();
    await expect(page.getByLabel("1-vaqt")).toHaveValue(time);

    await page.getByLabel("Dori nomi").fill("Aspirin Kardio");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByRole("link", { name: /Aspirin Kardio/ })).toBeVisible();

    await page.getByRole("link", { name: /Aspirin Kardio/ }).click();
    await page.getByRole("button", { name: "Eslatmalarni to‘xtatish" }).click();
    await expect(page.getByRole("button", { name: "Eslatmalarni yoqish" })).toBeVisible();
    await page.goto("/routine");
    await expect(page.getByText("Bugun uchun dori yo‘q.")).toBeVisible();

    await page.getByRole("link", { name: /Aspirin Kardio/ }).click();
    await page.getByText("Dorini o‘chirish").click();
    await page.getByRole("button", { name: "Butunlay o‘chirish" }).click();
    await expect(page.getByText("Hali dori qo‘shilmagan.")).toBeVisible();
  });

  test("another user's medicine cannot be opened", async ({ page, context }) => {
    await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(60));
    await page.getByRole("link", { name: /^Aspirin/ }).click();
    await expect(page).toHaveURL(/\/routine\/[0-9a-f-]{36}$/);
    const url = page.url();
    await context.clearCookies();
    await registerUser(page);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  });
});

test.describe("voice privacy", () => {
  test("medicine details are not read aloud unless the user opts in", async ({ page }) => {
    await fakeSystemVoices(page, ["uz-UZ"]);
    await registerUser(page);
    await addMedicine(page, "Aspirin", fergana(2));
    await page.getByRole("button", { name: "Ovozli ko‘rsatma" }).first().click();
    await expect(page.getByText(/Maxfiylik sababli/)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toEqual([]);

    await page.goto("/settings");
    await page.getByRole("switch", { name: /Dori nomlarini ovoz chiqarib aytish/ }).click();
    await page.goto("/routine");
    await page.getByRole("button", { name: "Ovozli ko‘rsatma" }).first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" "))).toContain("Aspirin");
  });
});

test.describe("appointments", () => {
  test("can be added and cancelled, and show Fergana time", async ({ page }) => {
    await registerUser(page);
    await page.goto("/appointments");
    await expect(page.getByText("Rejalashtirilgan qabul yo‘q.")).toBeVisible();
    await page.getByLabel("Qabul nomi").fill("Kardiolog");
    await page.getByLabel("Sana va vaqt").fill("2099-03-10T09:30");
    await page.getByRole("button", { name: "Qabul qo‘shish" }).click();
    const item = page.getByRole("listitem").filter({ hasText: "Kardiolog" });
    await expect(item).toContainText("09:30");

    await item.getByRole("button", { name: "Bekor qilish" }).click();
    await expect(page.getByText("Rejalashtirilgan qabul yo‘q.")).toBeVisible();
    await page.getByText("O‘tgan yoki bekor qilingan").click();
    await expect(page.getByText("Bekor qilingan", { exact: true })).toBeVisible();
  });

  test("need a title and a date", async ({ page }) => {
    await registerUser(page);
    await page.goto("/appointments");
    await page.getByRole("button", { name: "Qabul qo‘shish" }).click();
    await expect(page.getByText("Bu maydonni to‘ldiring.")).toBeVisible();
    await expect(page.getByText("Sanani tekshiring.")).toBeVisible();
  });
});

test.describe("automated accessibility checks", () => {
  for (const path of ["/routine", "/routine/new", "/routine/history", "/appointments"]) {
    test(path, async ({ page }) => {
      await registerUser(page);
      await addMedicine(page, "Aspirin", fergana(2));
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  }
});

test.describe("when Supabase is not configured", () => {
  for (const path of ["/routine", "/circle", "/appointments"]) {
    test(`${path} says so honestly`, async ({ page }) => {
      await page.goto(`http://localhost:3101${path}`);
      await expect(page.getByText(/Hisob xizmati hali sozlanmagan/)).toBeVisible();
    });
  }
});
