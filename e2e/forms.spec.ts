import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

// A form that reports a mistake must keep what the person typed, so they fix one
// field instead of starting again.
test.describe("forms keep what was typed when there is a mistake", () => {
  test("registration", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Ism").fill("Aziza");
    await page.getByLabel("Elektron pochta").fill("aziza@example.test");
    await page.getByLabel("Parol").fill("short");
    await page.getByRole("button", { name: "Ro‘yxatdan o‘tish" }).click();
    await expect(page.getByText(/Parol juda oddiy/)).toBeVisible();
    await expect(page.getByLabel("Ism")).toHaveValue("Aziza");
    await expect(page.getByLabel("Elektron pochta")).toHaveValue("aziza@example.test");
  });

  test("profile", async ({ page }) => {
    await registerUser(page);
    await page.getByLabel("Allergiya").fill("Penitsillin");
    await page.getByLabel(/Telefon/).fill("abc");
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText(/Telefon raqamini/)).toBeVisible();
    await expect(page.getByLabel("Allergiya")).toHaveValue("Penitsillin");
    await expect(page.getByLabel(/Telefon/)).toHaveValue("abc");
  });

  test("a new medicine, including the chosen days", async ({ page }) => {
    await registerUser(page);
    await page.goto("/routine/new");
    await page.getByLabel("Dori nomi").fill("Aspirin");
    await page.getByLabel(/Qabul qilish tartibi/).fill("Ovqatdan keyin");
    const days = page.getByRole("group", { name: "Hafta kunlari" }).getByRole("checkbox");
    await days.nth(6).uncheck();
    await page.getByRole("button", { name: "Saqlash" }).click();
    await expect(page.getByText(/Kamida bitta vaqt/)).toBeVisible();
    await expect(page.getByLabel("Dori nomi")).toHaveValue("Aspirin");
    await expect(page.getByLabel(/Qabul qilish tartibi/)).toHaveValue("Ovqatdan keyin");
    await expect(days.nth(6)).not.toBeChecked();
  });
});
