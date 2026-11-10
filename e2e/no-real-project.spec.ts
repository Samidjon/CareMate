import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Guards the rule that tests never reach a real Supabase project, even when a
// developer has one in .env.local.
function realProjectHost() {
  try {
    const line = readFileSync(".env.local", "utf8").match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(\S+)/m);
    return line ? new URL(line[1]).host : null;
  } catch {
    return null;
  }
}

test("test servers do not talk to the project in .env.local", async ({ page }) => {
  await page.goto("http://localhost:3100/login");
  await expect(page.getByLabel("Elektron pochta")).toBeVisible();
  await page.goto("http://localhost:3101/login");
  await expect(page.getByText(/Hisob xizmati hali sozlanmagan/)).toBeVisible();
  // The not-configured server would show its form if .env.local had leaked in.
  await expect(page.getByLabel("Elektron pochta")).toHaveCount(0);

  const host = realProjectHost();
  test.skip(!host, "No .env.local to compare with");
  const seen: string[] = [];
  page.on("request", (request) => seen.push(new URL(request.url()).host));
  await page.goto("http://localhost:3100/map");
  await expect(page.getByText(/Topildi:/)).toBeVisible();
  expect(seen).not.toContain(host);
  // Only the mock's three demo places, not the real project's list.
  await expect(page.getByText("Topildi: 3")).toBeVisible();
});
