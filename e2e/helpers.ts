import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const MOCK = "http://localhost:54399";
export const PASSWORD = "test-password-1";

export async function useRussian(page: Page) {
  await page.context().addCookies([{ name: "cm_lang", value: "ru", url: "http://localhost:3100" }]);
}

export const newEmail = (prefix = "user") => `${prefix}-${randomUUID()}@example.test`;

export async function registerUser(page: Page, email = newEmail()) {
  await page.goto("/register");
  await page.getByLabel("Ism").fill("Aziza");
  await page.getByLabel("Familiya").fill("Karimova");
  await page.getByLabel("Elektron pochta").fill(email);
  await page.getByLabel("Parol").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  return email;
}

export async function storedUser(page: Page, email: string) {
  const response = await page.request.get(`${MOCK}/__test/profile?email=${encodeURIComponent(email)}`);
  return response.json();
}

/** Replaces the system speech engine with a predictable one that has the given voices. */
export async function fakeSystemVoices(page: Page, langs: string[]) {
  await page.addInitScript((voiceLangs) => {
    const voices = voiceLangs.map((lang) => ({ lang, name: `Fake ${lang}`, default: false, localService: true, voiceURI: lang }));
    const fake = {
      getVoices: () => voices,
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
      speak(utterance: { onstart?: () => void; onend?: () => void; text: string }) {
        (window as unknown as { __spoken: string[] }).__spoken.push(utterance.text);
        setTimeout(() => utterance.onstart?.(), 10);
        setTimeout(() => utterance.onend?.(), 300);
      },
    };
    (window as unknown as { __spoken: string[] }).__spoken = [];
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // The real class rejects fake voice objects, so it is replaced as well.
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class { constructor(public text: string) {} },
      configurable: true,
    });
  }, langs);
}
