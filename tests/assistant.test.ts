import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { answerFamily, answerMedicines, answerPlaces, answerSharing } from "@/lib/ai/answers";
import { assistantModelConfig, DEFAULT_MODEL } from "@/lib/ai/config";
import { loadMedicines, type ToolContext } from "@/lib/ai/data";
import { asksToChangeTreatment, looksLikeEmergency, matchIntent } from "@/lib/ai/intents";
import { assistantTools, runTool } from "@/lib/ai/tools";
import { assistantPages } from "@/lib/ai/types";

// A stand-in for the Supabase client: every query on a table returns that table's rows.
function fakeSupabase(tables: Record<string, unknown[]>, rpcs: Record<string, unknown[]> = {}) {
  const builder = (rows: unknown[]) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "gte", "order", "limit"]) query[method] = () => query;
    query.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    query.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    return query;
  };
  return {
    from: (table: string) => builder(tables[table] ?? []),
    rpc: async (name: string) => ({ data: rpcs[name] ?? [], error: null }),
  } as unknown as SupabaseClient;
}

const PATIENT = "11111111-1111-4111-8111-111111111111";
const ctx = (supabase: SupabaseClient, extra: Partial<ToolContext> = {}): ToolContext => ({
  supabase,
  userId: "22222222-2222-4222-8222-222222222222",
  locale: "uz",
  origin: null,
  // 08:00 in Fergana on Monday 9 November 2026.
  now: new Date("2026-11-09T03:00:00Z"),
  ...extra,
});

const medicineTables = {
  medications: [{ id: "m1", name: "Aspirin", instructions: null, start_date: "2026-11-01", end_date: null, is_active: true }],
  medication_schedules: [
    { id: "s1", medication_id: "m1", time_of_day: "06:00:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], is_active: true, created_at: "2026-11-01T00:00:00Z" },
    { id: "s2", medication_id: "m1", time_of_day: "09:00:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], is_active: true, created_at: "2026-11-01T00:00:00Z" },
  ],
  medication_logs: [],
};

describe("emergency and treatment checks", () => {
  it.each(["Ko‘kragim og‘riyapti", "nafas ololmayapman", "Yordam bering!", "SOS", "tez yordam chaqiring", "Не могу дышать", "болит в груди", "Помогите"])(
    "treats %s as an emergency",
    (text) => expect(looksLikeEmergency(text)).toBe(true),
  );

  it.each(["SOS qanday ishlaydi?", "Dorixona topishga yordam bering", "Помогите найти аптеку", "Keyingi dorim qachon?"])("does not treat %s as an emergency", (text) =>
    expect(looksLikeEmergency(text)).toBe(false),
  );

  it("recognises requests to change a treatment", () => {
    expect(asksToChangeTreatment("Dozani oshirsam bo‘ladimi?")).toBe(true);
    expect(asksToChangeTreatment("Можно ли не пить таблетку сегодня?")).toBe(true);
    expect(asksToChangeTreatment("Keyingi dorim qachon?")).toBe(false);
  });
});

describe("quick question matching", () => {
  it.each([
    ["Keyingi dorim qachon?", "next_medicine"],
    ["Когда следующее лекарство?", "next_medicine"],
    ["Bugun qaysi dorilarni ichaman?", "today_medicines"],
    ["Yordamchilarim kim?", "my_helpers"],
    ["Где мои близкие?", "family_locations"],
    ["Joylashuvimni kim ko‘radi?", "my_sharing"],
    ["Eng yaqin dorixona", "nearest_pharmacy"],
    ["Ближайшая аптека", "nearest_pharmacy"],
    ["aravacha uchun qulay shifoxona", "nearest_accessible"],
    ["SOS qanday ishlaydi?", "how_sos"],
    ["Как пригласить помощника?", "invite_helper"],
  ])("%s → %s", (text, intent) => expect(matchIntent(text)).toBe(intent));

  it("returns nothing for unrelated text", () => expect(matchIntent("Bugun ob-havo qanday?")).toBeNull());
});

describe("model configuration", () => {
  it("is off without a key, with a placeholder, or when switched off", () => {
    expect(assistantModelConfig({})).toBeNull();
    expect(assistantModelConfig({ ANTHROPIC_API_KEY: "not-set" })).toBeNull();
    expect(assistantModelConfig({ ANTHROPIC_API_KEY: "x".repeat(40), ASSISTANT_PROVIDER: "none" })).toBeNull();
  });

  it("uses the default model and ignores an unsafe base URL", () => {
    const config = assistantModelConfig({ ANTHROPIC_API_KEY: "x".repeat(40), ANTHROPIC_BASE_URL: "not-set" });
    expect(config).toMatchObject({ model: DEFAULT_MODEL, baseURL: undefined });
  });
});

describe("tools", () => {
  it("are all strict, with closed input schemas", () => {
    for (const tool of assistantTools) {
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(tool.input_schema.required.sort()).toEqual(Object.keys(tool.input_schema.properties).sort());
    }
  });

  it("refuses unknown tools and bad input", async () => {
    const context = ctx(fakeSupabase({}));
    expect(await runTool(context, "delete_everything", {})).toMatchObject({ isError: true, result: { error: "unknown_tool" } });
    expect(await runTool(context, "get_person_medicines", { patient_id: "not-an-id" })).toMatchObject({ isError: true, result: { error: "invalid_input" } });
    expect(await runTool(context, "offer_page", { page: "https://evil.example" })).toMatchObject({ isError: true });
  });

  it("only offers fixed CareMate pages", async () => {
    const outcome = await runTool(ctx(fakeSupabase({})), "offer_page", { page: "invite_helper" });
    expect(outcome.actions).toEqual([{ kind: "open", page: "invite_helper", path: assistantPages.invite_helper }]);
  });

  it("does not show someone's medicines unless they shared them", async () => {
    const person = { link_id: "l1", patient_id: PATIENT, first_name: "Samira", last_name: "Test", can_view_medications: false, can_manage_reminders: false };
    const notShared = await runTool(ctx(fakeSupabase(medicineTables, { my_care_recipients: [person] })), "get_person_medicines", { patient_id: PATIENT });
    expect(notShared.result).toMatchObject({ status: "not_shared" });
    expect(JSON.stringify(notShared.result)).not.toContain("Aspirin");

    const stranger = await runTool(ctx(fakeSupabase(medicineTables, { my_care_recipients: [] })), "get_person_medicines", { patient_id: PATIENT });
    expect(stranger.result).toMatchObject({ status: "not_connected" });

    const shared = await runTool(ctx(fakeSupabase(medicineTables, { my_care_recipients: [{ ...person, can_view_medications: true }] })), "get_person_medicines", { patient_id: PATIENT });
    expect(JSON.stringify(shared.result)).toContain("Aspirin");
  });

  it("asks for a position before searching near the person", async () => {
    const outcome = await runTool(ctx(fakeSupabase({})), "search_facilities", { query: "", category: "pharmacy", wheelchair_only: false, near_me: true, limit: 3 });
    expect(outcome.result).toEqual({ status: "needs_location" });
  });
});

describe("medicine answers", () => {
  it("works out the next dose in Fergana time", async () => {
    const data = await loadMedicines(ctx(fakeSupabase(medicineTables)), PATIENT);
    expect(data).toMatchObject({ status: "ok", timeZone: "Asia/Tashkent", currentTime: "08:00", missedToday: 1, next: { medicine: "Aspirin", time: "09:00", day: "today" } });
    expect(answerMedicines("uz", data, "next")).toBe("Keyingi dori: Aspirin, bugun soat 09:00 da. Diqqat: bugun 1 ta doza o‘tkazib yuborilgan.");
    expect(answerMedicines("ru", data, "today")).toContain("06:00 Aspirin (пропущено)");
  });

  it("says plainly when there is no schedule", () => {
    expect(answerMedicines("uz", { status: "ok", today: [], next: null, missedToday: 0, activeMedicines: [] }, "next")).toMatch(/dori jadvali yo‘q/);
    expect(answerMedicines("ru", { status: "failed" }, "next")).toMatch(/Не удалось/);
  });
});

describe("location and place answers", () => {
  it("calls a position the last known one, and gives none when paused", () => {
    const text = answerFamily("uz", {
      status: "ok",
      people: [
        { name: "Samira", sharing: "stale", lastUpdated: "07:10", minutesAgo: 50 },
        { name: "Bobur", sharing: "paused" },
      ],
    });
    expect(text).toContain("Samira: oxirgi joylashuv soat 07:10 da, 50 daqiqa oldin — eskirgan bo‘lishi mumkin.");
    expect(text).toContain("Bobur: joylashuvni ulashish to‘xtatib turilgan.");
    expect(text).toContain("jonli kuzatuv emas");
  });

  it("lists active and paused shares", () => {
    expect(answerSharing("ru", { status: "ok", shares: [{ helper: "Bobur", status: "active" }, { helper: "Ali", status: "paused" }] })).toBe(
      "Ваше местоположение видят: Bobur. Приостановлено для: Ali.",
    );
    expect(answerSharing("uz", { status: "ok", shares: [] })).toMatch(/hech kim bilan/);
  });

  it("never presents unknown accessibility as confirmed", () => {
    const text = answerPlaces(
      "uz",
      { status: "ok", facilities: [{ name: "Shifoxona", distanceKm: 1.2, wheelchairAccess: "unknown", address: null }] },
      "accessible",
      false,
    );
    expect(text).toContain("qulaylik ma’lumoti hali tekshirilmagan");
    expect(text).toContain("1. Shifoxona — 1.2 km, qulaylik noma’lum");
    expect(answerPlaces("ru", { status: "needs_location" }, "pharmacy", true)).toMatch(/нужно ваше местоположение/);
  });
});
