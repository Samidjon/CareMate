import { expect, test, type Browser, type Page } from "@playwright/test";
import { newEmail, PASSWORD } from "./helpers";

// CareMate has two codes: an invitation (made by the person being helped, entered
// by the helper) and a request (made by the helper, entered by the person being
// helped). A valid code typed into the other box must say where it belongs.

async function signUp(browser: Browser, firstName: string, role: "Bemor" | "Qarindosh yoki yordamchi") {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 375, height: 812 }, locale: "uz-UZ" });
  const page = await context.newPage();
  await page.goto("/register");
  await page.getByRole("radio", { name: new RegExp(role) }).check();
  await page.getByLabel("Ism").fill(firstName);
  await page.getByLabel("Familiya").fill("Test");
  await page.getByLabel("Elektron pochta").fill(newEmail(firstName.toLowerCase()));
  await page.getByLabel("Parol").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
  await expect(page).toHaveURL(role === "Bemor" ? /\/profile$/ : /\/caregiver$/);
  return page;
}

async function enterInvitation(page: Page, code: string) {
  await page.goto("/caregiver/accept");
  await page.getByLabel("Taklif kodi").fill(code);
  await page.getByRole("button", { name: "Kodni tekshirish" }).click();
}

async function enterRequest(page: Page, code: string) {
  await page.goto("/circle");
  await page.getByLabel("So‘rov kodi").fill(code);
  await page.getByRole("button", { name: "Kodni tekshirish" }).click();
}

test("a patient in the helper area is sent to invite from their own area", async ({ browser }) => {
  const patient = await signUp(browser, "Samira", "Bemor");
  const helper = await signUp(browser, "Bobur", "Qarindosh yoki yordamchi");

  await patient.goto("/caregiver");
  await expect(patient.getByTestId("patient-hint")).toBeVisible();
  await expect(patient.getByRole("button", { name: "So‘rov kodini yaratish" })).toBeHidden();
  await patient.getByRole("link", { name: "Yaqinimni taklif qilish" }).click();
  await expect(patient).toHaveURL(/\/circle#invites-title$/);

  // The mix-up that happened: the patient makes a helper's request code anyway…
  await patient.goto("/caregiver");
  await patient.getByText("Men boshqa odamga yordam beraman").click();
  await patient.getByRole("button", { name: "So‘rov kodini yaratish" }).click();
  const code = (await patient.getByTestId("request-code").textContent())!.trim();
  // …and the helper types it in as an invitation.
  await enterInvitation(helper, code);
  await expect(helper.getByText(/taklif kodi emas, yordamchining so‘rov kodi/)).toBeVisible();

  // Helpers are not shown the patient hint.
  await helper.goto("/caregiver");
  await expect(helper.getByTestId("patient-hint")).toHaveCount(0);
});

test("each side is told when they typed their own code", async ({ browser }) => {
  const patient = await signUp(browser, "Samira", "Bemor");
  const helper = await signUp(browser, "Bobur", "Qarindosh yoki yordamchi");

  await patient.goto("/circle");
  await patient.getByRole("button", { name: "Taklif kodini yaratish" }).click();
  const invitation = (await patient.getByTestId("invite-code").textContent())!.trim();
  await enterRequest(patient, invitation.toLowerCase());
  await expect(patient.getByText(/o‘zingiz yaratgan taklif kodi/)).toBeVisible();

  await helper.goto("/caregiver");
  await helper.getByRole("button", { name: "So‘rov kodini yaratish" }).click();
  const request = (await helper.getByTestId("request-code").textContent())!.trim();
  await enterInvitation(helper, request);
  await expect(helper.getByText(/o‘zingiz yaratgan so‘rov kodi/)).toBeVisible();

  // Typed in the right places, both codes still work.
  await enterInvitation(helper, invitation);
  await expect(helper.getByText(/Samira/).first()).toBeVisible();
  await enterRequest(patient, request);
  await expect(patient.getByText(/Bobur Test/)).toBeVisible();
});

test("a code that does not exist is still called invalid", async ({ browser }) => {
  const helper = await signUp(browser, "Bobur", "Qarindosh yoki yordamchi");
  await enterInvitation(helper, "ZZZZ999999");
  await expect(helper.getByText("Kod noto‘g‘ri yoki eskirgan. Yangi kod so‘rang.")).toBeVisible();
});
