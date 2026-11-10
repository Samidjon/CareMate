// Checks that a real Supabase project matches what CareMate expects.
// Run with: npm run check:supabase
//
// It only reads. It writes nothing, creates no accounts, and prints only counts
// and yes/no results, never keys or personal data.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const ok = (text) => console.log(`  ОК      ${text}`);
const fail = (text) => {
  failures += 1;
  console.log(`  ОШИБКА  ${text}`);
};
const note = (text) => console.log(`  ИНФО    ${text}`);
const section = (text) => console.log(`\n${text}`);

section("Настройки .env.local");
if (!url || !anonKey) {
  fail("Нет NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY. Создайте .env.local по образцу .env.example.");
  process.exit(1);
}
ok("Адрес проекта и публичный ключ указаны");
if (!serviceKey) fail("Нет SUPABASE_SERVICE_ROLE_KEY: не будут работать удаление аккаунта, лимиты и статусы SOS.");
else if (serviceKey === anonKey) fail("SUPABASE_SERVICE_ROLE_KEY совпадает с публичным ключом: вставлен не тот ключ.");
else ok("Секретный ключ указан и отличается от публичного");

// Everything below would read a network failure as "access refused", so stop here if the project cannot be reached.
const base = url.replace(/\/$/, "");
let authSettings = null;
try {
  const response = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: anonKey } });
  if (response.ok) {
    authSettings = await response.json();
    ok("Проект отвечает, публичный ключ принят");
  } else {
    fail(`Проект ответил кодом ${response.status}. Проверьте адрес проекта и публичный ключ.`);
  }
} catch {
  fail("Не удалось связаться с проектом. Проверьте адрес и интернет. Если проект на паузе, откройте его на сайте Supabase.");
}
if (!authSettings) {
  console.log("\nИтог: проверка остановлена, остальное проверить нельзя.");
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, anonKey, options);
const admin = serviceKey && serviceKey !== anonKey ? createClient(url, serviceKey, options) : null;

const MIGRATION_1 = "20261106000001_core_schema.sql";
const MIGRATION_4 = "20261106000004_caregiver_area.sql";
const MIGRATION_5 = "20261109000005_facility_directory.sql";
const MIGRATION_6 = "20261110000006_location_and_contacts.sql";

const TABLES = [
  ["profiles", MIGRATION_1],
  ["patient_health_info", MIGRATION_1],
  ["consent_records", MIGRATION_1],
  ["caregiver_invitations", MIGRATION_1],
  ["caregiver_links", MIGRATION_1],
  ["emergency_contacts", MIGRATION_1],
  ["medical_facilities", MIGRATION_1],
  ["facility_accessibility", MIGRATION_1],
  ["facility_verification_logs", MIGRATION_1],
  ["medications", MIGRATION_1],
  ["medication_schedules", MIGRATION_1],
  ["medication_logs", MIGRATION_1],
  ["appointments", MIGRATION_1],
  ["reminders", MIGRATION_1],
  ["push_subscriptions", MIGRATION_1],
  ["emergency_events", MIGRATION_1],
  ["emergency_notifications", MIGRATION_1],
  ["admin_audit_logs", MIGRATION_1],
  ["rate_limit_counters", MIGRATION_1],
  ["emergency_acknowledgements", MIGRATION_4],
  ["facility_reports", MIGRATION_5],
  ["user_saved_facilities", MIGRATION_5],
  ["caregiver_requests", MIGRATION_5],
  ["location_shares", MIGRATION_6],
  ["patient_last_locations", MIGRATION_6],
];

// A real GET, not a HEAD: the client library reports a HEAD 404 on a missing table as success.
const probe = (client, table) => client.from(table).select("*").limit(0);
const isMissing = (result) => ["PGRST205", "42P01"].includes(result.error?.code);

section("Таблицы");
if (admin) {
  const missing = [];
  let connectionFailed = false;
  for (const [table, file] of TABLES) {
    const result = await probe(admin, table);
    if (isMissing(result)) missing.push(`${table} (файл ${file})`);
    else if (result.error) {
      connectionFailed = true;
      fail(`${table}: не удалось прочитать (код ${result.error.code || result.status}). Проверьте адрес проекта и секретный ключ.`);
      break;
    }
  }
  if (!connectionFailed) {
    if (missing.length) fail(`Нет таблиц: ${missing.join(", ")}`);
    else ok(`Все ${TABLES.length} таблиц на месте`);
  }
} else {
  note("Пропущено: нужен секретный ключ");
}

section("Защита данных (запросы без входа в аккаунт)");
const PRIVATE_TABLES = ["profiles", "patient_health_info", "emergency_contacts", "medications", "appointments", "emergency_events", "push_subscriptions", "admin_audit_logs", "rate_limit_counters", "facility_reports", "user_saved_facilities", "caregiver_requests", "location_shares", "patient_last_locations"];
const exposed = [];
const unclear = [];
for (const table of PRIVATE_TABLES) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  // Only a clear refusal counts as protected. Any other error proves nothing.
  if (error?.code !== "42501") {
    if (error) unclear.push(table);
    else exposed.push(`${table} (строк видно: ${data.length})`);
  }
}
if (exposed.length) fail(`Посетитель может читать таблицы: ${exposed.join(", ")}. Запустите 20261106000002_security.sql.`);
if (unclear.length) fail(`Не удалось проверить защиту таблиц: ${unclear.join(", ")}. Запустите миграции по порядку.`);
if (!exposed.length && !unclear.length) ok(`База отказывает посетителю без аккаунта во всех ${PRIVATE_TABLES.length} личных таблицах`);

const readable = await anon.from("medical_facilities").select("id").limit(0);
if (readable.error) fail(`Учреждения недоступны для чтения (код ${readable.error.code}). Запустите 20261106000002_security.sql.`);
else ok("Список учреждений открыт для чтения");

section("Функции базы");
// Without a session, an existing function refuses with 42501. PGRST202 means it is missing.
async function functionExists(name, args, file) {
  const { error } = await anon.rpc(name, args);
  if (error?.code === "PGRST202") fail(`Нет функции ${name}. Запустите ${file}.`);
  else if (!error) fail(`Функция ${name} доступна без входа в аккаунт. Запустите 20261106000002_security.sql.`);
  else if (error.code === "42501") ok(`${name}: есть и недоступна без входа`);
  else fail(`Не удалось проверить функцию ${name} (код ${error.code || "нет"}).`);
}
await functionExists("create_caregiver_invitation", {}, "20261106000002_security.sql");
await functionExists("accept_caregiver_invitation", { code: "CHECK" }, "20261106000002_security.sql");
await functionExists("check_rate_limit", { limit_key: "check", max_hits: 1, window_seconds: 1 }, "20261106000002_security.sql");
await functionExists("preview_caregiver_invitation", { code: "CHECK" }, MIGRATION_4);
await functionExists("my_care_recipients", {}, MIGRATION_4);
await functionExists("acknowledge_emergency", { event: "00000000-0000-4000-8000-000000000000" }, MIGRATION_4);
await functionExists("create_caregiver_request", {}, MIGRATION_5);
await functionExists("decide_caregiver_request", { code: "CHECK", approve: false }, MIGRATION_5);
await functionExists("set_location_share", { caregiver: "00000000-0000-4000-8000-000000000000", new_status: "revoked" }, MIGRATION_6);

section("Новые поля справочника");
const columns = await anon.from("medical_facilities").select("photo_url, website, specialities").limit(1);
if (columns.error?.code === "42703") fail(`Нет новых полей учреждений. Запустите ${MIGRATION_5}, затем supabase/facilities_osm.sql заново.`);
else if (columns.error) fail(`Не удалось проверить поля учреждений (код ${columns.error.code}).`);
else ok("Поля для фото, сайта и направлений на месте");
const contactColumns = await anon.from("medical_facilities").select("phone_numbers, contact_verification_status").limit(1);
if (contactColumns.error?.code === "42703") fail(`Нет полей контактов. Запустите ${MIGRATION_6}, затем supabase/facilities_osm.sql заново.`);
else if (contactColumns.error) fail(`Не удалось проверить поля контактов (код ${contactColumns.error.code}).`);
else ok("Поля телефонов и их проверки на месте");

section("Учреждения");
const all = await anon.from("medical_facilities").select("*", { count: "exact", head: true });
const demo = await anon.from("medical_facilities").select("*", { count: "exact", head: true }).eq("is_demo", true);
const osm = await anon.from("medical_facilities").select("*", { count: "exact", head: true }).eq("data_source", "OpenStreetMap");
if (all.error) fail("Не удалось посчитать учреждения.");
else {
  if (demo.count) ok(`Демонстрационных: ${demo.count}`);
  else fail("Нет демонстрационных учреждений. Запустите supabase/seed.sql.");
  if (osm.count) ok(`Из OpenStreetMap: ${osm.count}`);
  else note("Нет учреждений OpenStreetMap. Если они нужны, запустите supabase/facilities_osm.sql.");
}

section("Вход и регистрация");
if (authSettings.disable_signup) fail("Регистрация выключена в проекте.");
else ok("Регистрация включена");
if (authSettings.external?.email === false) fail("Вход по почте выключен (Authentication → Providers → Email).");
else ok("Вход по почте включён");
note(authSettings.mailer_autoconfirm ? "Подтверждение почты выключено: удобно для проверки." : "Подтверждение почты включено: встроенная почта Supabase отправляет лишь несколько писем в час.");

console.log(failures ? `\nИтог: найдено проблем: ${failures}.` : "\nИтог: база настроена правильно.");
process.exit(failures ? 1 : 0);
