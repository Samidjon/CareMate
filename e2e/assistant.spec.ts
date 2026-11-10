import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { newEmail, PASSWORD, registerUser, storedUser, useRussian } from "./helpers";

// The connected test server sends the assistant's model calls to a mock that answers
// with whatever the server-side tools returned, so these tests show what each
// signed-in person's tools may see. No test reaches Anthropic.

/** A time in Fergana, a given number of minutes from now, as HH:MM. */
function fergana(minutesFromNow: number) {
  return new Date(Date.now() + 5 * 3600_000 + minutesFromNow * 60_000).toISOString().slice(11, 16);
}

async function addMedicine(page: Page, name: string, time: string) {
  await page.goto("/routine/new");
  await page.getByLabel("Dori nomi").fill(name);
  await page.getByLabel("1-vaqt").fill(time);
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page).toHaveURL(/\/routine$/);
}

async function ask(page: Page, text: string) {
  await page.getByLabel("Savolingiz").fill(text);
  await page.getByRole("button", { name: "Yuborish" }).click();
}

const lastAnswer = (page: Page) => page.getByTestId("assistant-log").locator('article[data-role="assistant"]').last();

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

/** A patient and a helper, connected with the default choices: medicines not shared. */
async function connected(browser: Browser) {
  const make = () => browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const patient = await (await make()).newPage();
  const helper = await (await make()).newPage();
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
  return { patient, helper, patientId: (await storedUser(patient, patientEmail)).id as string };
}

test.beforeEach(() => {
  const now = new Date(Date.now() + 5 * 3600_000);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  test.skip(minutes < 5 || minutes > 1300, "Runs too close to midnight in Fergana");
});

test.describe("CareMate assistant", () => {
  test("needs a signed-in person, and the API refuses visitors", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Yordamchi bilan gaplashish" })).toHaveCount(0);
    await page.goto("/assistant");
    await expect(page).toHaveURL(/\/login\?next=%2Fassistant/);
    const response = await request.post("/api/assistant/chat", { data: { locale: "uz", messages: [{ role: "user", text: "Salom" }] } });
    expect(response.status()).toBe(401);
  });

  test("answers a quick question from the saved schedule, without the model", async ({ page }) => {
    await registerUser(page);
    const time = fergana(90);
    await addMedicine(page, "Aspirin", time);
    await page.getByRole("link", { name: "Yordamchi bilan gaplashish" }).click();
    await expect(page.getByRole("heading", { name: "CareMate yordamchisi" })).toBeVisible();
    await page.getByRole("button", { name: "Keyingi dorim qachon?" }).click();
    await expect(lastAnswer(page)).toContainText(`Keyingi dori: Aspirin, bugun soat ${time} da.`);
    await lastAnswer(page).getByRole("link", { name: "Dorilarimni ochish" }).click();
    await expect(page).toHaveURL(/\/routine$/);

    // The conversation is kept in this tab, and can be cleared.
    await page.goto("/assistant");
    await expect(lastAnswer(page)).toContainText("Aspirin");
    await page.getByRole("button", { name: "Suhbatni tozalash" }).click();
    await expect(page.getByTestId("assistant-log").locator("article")).toHaveCount(0);
  });

  test("the model reads the person's own data through server-side tools", async ({ page }) => {
    await registerUser(page);
    await addMedicine(page, "Vitamin D", fergana(120));
    await page.goto("/assistant");
    await expect(page.getByTestId("assistant-ai-status")).toHaveCount(0);
    await ask(page, "Dorilarim haqida aytib bering");
    await expect(lastAnswer(page)).toContainText("Natija:");
    await expect(lastAnswer(page)).toContainText("Vitamin D");
    await expect(lastAnswer(page)).toContainText("Asia/Tashkent");
  });

  test("a helper cannot read medicines that were not shared, nor a stranger's", async ({ browser }) => {
    const { patient, helper, patientId } = await connected(browser);
    await addMedicine(patient, "Maxfiy dori", fergana(60));
    await helper.goto("/assistant");
    await ask(helper, `${patientId} ning dorilari`);
    await expect(lastAnswer(helper)).toContainText('"status":"not_shared"');
    await expect(lastAnswer(helper)).not.toContainText("Maxfiy dori");

    await ask(helper, "00000000-0000-4000-8000-000000000000 ning dorilari");
    await expect(lastAnswer(helper)).toContainText('"status":"not_connected"');
  });

  test("an emergency gets 103 and SOS at once, never advice", async ({ page }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await ask(page, "Ko‘kragim qattiq og‘riyapti");
    const answer = lastAnswer(page);
    await expect(answer).toContainText("darhol 103 ga qo‘ng‘iroq qiling");
    await expect(answer.getByRole("link", { name: "Qo‘ng‘iroq qilish: 103" })).toHaveAttribute("href", "tel:103");
    await expect(answer.getByRole("link", { name: "SOS sahifasini ochish" })).toHaveAttribute("href", "/sos");
  });

  test("dose changes are left to the doctor", async ({ page }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await ask(page, "Dozani oshirsam bo‘ladimi?");
    await expect(lastAnswer(page)).toContainText("faqat shifokor qarori bilan");
  });

  test("actions need a tap: inviting a helper only opens the invitation screen", async ({ page }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await ask(page, "Qizimni yordamchi sifatida taklif qilmoqchiman");
    // Answered by the model (through the mock), not by the offline fallback.
    await expect(lastAnswer(page)).toContainText('"status":"offered"');
    const link = lastAnswer(page).getByRole("link", { name: "Yordamchini taklif qilish" });
    await expect(link).toHaveAttribute("href", "/circle#invites-title");
    await page.goto("/circle");
    await expect(page.getByTestId("invite-code")).toHaveCount(0);
  });

  test("an unknown tool is refused on the server", async ({ page }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await ask(page, "davomat");
    await expect(lastAnswer(page)).toContainText('"error":"unknown_tool"');
  });

  test("when the model is down, quick answers still work and the person is told", async ({ page }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await ask(page, "xatolik-sinov");
    await expect(page.getByTestId("assistant-ai-status")).toContainText("hozir javob bermayapti");
    await expect(lastAnswer(page)).toContainText("tezkor savollarga javob bera olaman");
    await page.getByRole("button", { name: "SOS qanday ishlaydi?" }).click();
    await expect(lastAnswer(page)).toContainText("SOS tugmasini bossangiz");
  });

  test("nearest places use the position only after permission", async ({ page, context }) => {
    await registerUser(page);
    await page.goto("/assistant");
    await page.getByRole("button", { name: "Eng yaqin dorixona" }).click();
    await expect(lastAnswer(page)).toContainText("joylashuvingiz kerak");

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.3864, longitude: 71.7864 });
    await page.getByRole("button", { name: "Aravacha uchun qulay eng yaqin joy" }).click();
    const answer = lastAnswer(page);
    await expect(answer).toContainText("qulayligi tasdiqlangan eng yaqin joylar");
    await expect(answer).toContainText("1. DEMO — Namunaviy shifoxona — 0 km, aravacha uchun qulay");
    await expect(answer.getByRole("link", { name: "Ochish: DEMO — Namunaviy shifoxona" })).toHaveAttribute("href", /\/map\//);
  });

  test("speaks Russian, and passes an accessibility check", async ({ page }) => {
    await registerUser(page);
    await useRussian(page);
    await page.goto("/assistant");
    await expect(page.getByRole("heading", { name: "Помощник CareMate" })).toBeVisible();
    await page.getByRole("button", { name: "Как работает SOS?" }).click();
    await expect(lastAnswer(page)).toContainText("Кнопка SOS отправляет сообщение");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("voice input says so plainly when the browser has none", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    });
    await registerUser(page);
    await page.goto("/assistant");
    await page.getByRole("button", { name: "Ovoz bilan so‘rash" }).click();
    await expect(page.getByText("Bu brauzer ovozli kiritishni qo‘llab-quvvatlamaydi. Savolni yozing.")).toBeVisible();
  });

  test("voice input sends what was heard", async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        interimResults = false;
        maxAlternatives = 1;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          (window as unknown as { __lang: string }).__lang = this.lang;
          setTimeout(() => {
            this.onresult?.({ results: [[{ transcript: "SOS qanday ishlaydi" }]] });
            this.onend?.();
          }, 50);
        }
        stop() {}
      }
      Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    });
    await registerUser(page);
    await page.goto("/assistant");
    await page.getByRole("button", { name: "Ovoz bilan so‘rash" }).click();
    await expect(page.getByTestId("assistant-log").locator('article[data-role="user"]').last()).toContainText("SOS qanday ishlaydi");
    expect(await page.evaluate(() => (window as unknown as { __lang: string }).__lang)).toBe("uz-UZ");
  });
});

test("without any configuration the assistant page fails honestly", async ({ page }) => {
  await page.goto("http://localhost:3101/assistant");
  await expect(page.getByRole("heading", { name: "CareMate yordamchisi" })).toBeVisible();
  await expect(page.getByText(/sozlanmagan|ulanmagan/).first()).toBeVisible();
});
