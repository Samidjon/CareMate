import { expect, test } from "@playwright/test";

test("the status page says what the server sees, without any values", async ({ request }) => {
  const connected = await request.get("http://localhost:3100/api/health");
  expect(connected.status()).toBe(200);
  const body = await connected.json();
  expect(body.supabase).toMatchObject({ url: true, anonKey: true, configured: true, serviceRoleKey: true, reachable: true, databaseReady: true });
  expect(body.assistantAi).toBe(true);
  const text = JSON.stringify(body);
  for (const secret of ["mock-anon-key", "mock-service-key", "mock-anthropic-key", "localhost:54399"]) expect(text).not.toContain(secret);

  const bare = await (await request.get("http://localhost:3101/api/health")).json();
  expect(bare.supabase).toMatchObject({ configured: false, reachable: null, databaseReady: null });
  expect(bare.assistantAi).toBe(false);
});
