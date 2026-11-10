// An in-memory stand-in for the Supabase HTTP API, for browser tests only.
// It lets the tests run the app's real code with no real project, so they can never
// touch real accounts. Row Level Security is tested separately, on real Postgres, in
// tests/db; here only a simple per-owner check exists, so the app's own filtering
// mistakes still surface. It covers the small part of PostgREST the app uses.
import { createServer } from "node:http";

export const MOCK_ANTHROPIC_KEY = "mock-anthropic-key-for-tests-only";
import { randomUUID } from "node:crypto";

const users = new Map();
const rateCounters = new Map();

const demoFacility = (id, name_uz, name_ru, category, latitude, longitude) => ({
  id,
  name_uz,
  name_ru,
  category,
  status: "active",
  address: `DEMO manzil ${id.at(-1)}`,
  district: "Farg‘ona shahri",
  latitude,
  longitude,
  phone: id.endsWith("1") ? "+998730000000" : null,
  opening_hours: id.endsWith("1") ? "Mo-Sa 08:00-18:00" : null,
  website: id.endsWith("1") ? "https://example.org" : null,
  specialities: id.endsWith("1") ? ["cardiology"] : [],
  provider_id: null,
  source_updated_at: null,
  photo_url: null,
  photo_page_url: null,
  photo_author: null,
  photo_license: null,
  phone_numbers: id.endsWith("1")
    ? [
        { display: "+998 73 000 00 00", type: "reception", source: "Rasmiy sayt", verification: "officially_verified", verified_at: "2026-11-01T00:00:00Z" },
        { display: "+998 73 000 00 01", type: "appointments", source: "Rasmiy sayt", verification: "officially_verified", verified_at: "2026-11-01T00:00:00Z" },
      ]
    : id.endsWith("4")
      ? [{ display: "12-34", type: "main", source: "OpenStreetMap", verification: "provider_supplied" }]
      : [],
  contact_source: id.endsWith("1") ? "Rasmiy sayt" : null,
  contact_verification_status: id.endsWith("1") ? "officially_verified" : id.endsWith("4") ? "provider_supplied" : "unavailable",
  contact_verified_at: null,
  contact_updated_at: null,
  is_demo: true,
  data_source: "CareMate demo data",
  source_url: null,
  verification_status: "unverified",
  last_verified_at: null,
});
const f1 = "00000000-0000-4000-8000-000000000001";
const f2 = "00000000-0000-4000-8000-000000000002";
const f3 = "00000000-0000-4000-8000-000000000004";

const tables = {
  profiles: [],
  patient_health_info: [],
  emergency_contacts: [],
  medications: [],
  medication_schedules: [],
  medication_logs: [],
  appointments: [],
  emergency_events: [],
  emergency_notifications: [],
  caregiver_links: [],
  caregiver_invitations: [],
  facility_reports: [],
  caregiver_requests: [],
  location_shares: [],
  patient_last_locations: [],
  user_saved_facilities: [],
  // Present so scripts/check-supabase.mjs sees the whole schema; the app does not use them yet.
  consent_records: [],
  facility_verification_logs: [],
  reminders: [],
  push_subscriptions: [],
  admin_audit_logs: [],
  rate_limit_counters: [],
  emergency_acknowledgements: [],
  medical_facilities: [
    demoFacility(f1, "DEMO — Namunaviy shifoxona", "DEMO — Образец больницы", "hospital", 40.3864, 71.7864),
    demoFacility(f2, "DEMO — Namunaviy klinika", "DEMO — Образец клиники", "clinic", 40.3912, 71.779),
    demoFacility(f3, "DEMO — Namunaviy dorixona", "DEMO — Образец аптеки", "pharmacy", 40.3845, 71.7755),
  ],
  facility_accessibility: [
    { facility_id: f1, wheelchair_ramp: true, accessible_entrance: true, elevator: true, accessible_toilet: true, wheelchair_route: true, visual_impairment_assistance: null, accessibility_verified: "unverified", accessibility_notes: "DEMO" },
    { facility_id: f3, wheelchair_ramp: false, accessible_entrance: true, elevator: null, accessible_toilet: null, wheelchair_route: null, visual_impairment_assistance: null, accessibility_verified: "unverified", accessibility_notes: "DEMO" },
  ],
};

const SERVER_ONLY_TABLES = new Set(["admin_audit_logs", "rate_limit_counters", "push_subscriptions"]);

const OWNER_COLUMN = {
  location_shares: "patient_id",
  patient_last_locations: "patient_id",
  facility_reports: "reporter_id",
  user_saved_facilities: "user_id",
  profiles: "id",
  patient_health_info: "patient_id",
  emergency_contacts: "patient_id",
  medications: "patient_id",
  medication_schedules: "patient_id",
  medication_logs: "patient_id",
  appointments: "patient_id",
  emergency_events: "patient_id",
  caregiver_links: "patient_id",
  caregiver_invitations: "patient_id",
};
const PUBLIC_TABLES = new Set(["medical_facilities", "facility_accessibility"]);

// A simple copy of has_care_access, so helper screens behave as they will on the real database.
const SCOPE = {
  profiles: "can_view_profile",
  patient_health_info: "can_view_health",
  emergency_contacts: "can_view_contacts",
  medications: "medications",
  medication_schedules: "medications",
  medication_logs: "medications",
  appointments: "appointments",
  emergency_events: "can_receive_sos",
};

function hasAccess(callerId, patientId, column) {
  const link = tables.caregiver_links.find((row) => row.patient_id === patientId && row.caregiver_id === callerId && row.status === "active");
  if (!link) return false;
  if (column === "medications") return link.can_view_medications || link.can_manage_reminders;
  if (column === "appointments") return link.can_view_appointments || link.can_manage_reminders;
  return Boolean(link[column]);
}

const PERMISSION_DEFAULTS = {
  view_profile: true,
  view_health: false,
  view_contacts: true,
  view_medications: false,
  view_appointments: false,
  receive_sos: true,
  manage_reminders: false,
};

const fromArguments = (args) => {
  const value = { ...PERMISSION_DEFAULTS, ...args };
  return {
    can_view_profile: value.view_profile,
    can_view_health: value.view_health,
    can_view_contacts: value.view_contacts,
    can_view_medications: value.view_medications,
    can_view_appointments: value.view_appointments,
    can_receive_sos: value.receive_sos,
    can_manage_reminders: value.manage_reminders,
  };
};

function rpc(name, body, caller, send) {
  if (name === "create_caregiver_invitation") {
    const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    tables.caregiver_invitations.push({
      id: randomUUID(),
      patient_id: caller.id,
      code,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      ...fromArguments(body),
    });
    return send(200, code);
  }
  const invitation = () =>
    tables.caregiver_invitations.find((row) => row.code === String(body.code).toUpperCase() && row.status === "pending");
  if (name === "preview_caregiver_invitation") {
    const found = invitation();
    if (!found) return send(200, []);
    const owner = tables.profiles.find((row) => row.id === found.patient_id);
    return send(200, [{ ...found, first_name: owner.first_name }]);
  }
  if (name === "accept_caregiver_invitation") {
    const found = invitation();
    if (!found) return send(400, { code: "P0002", message: "invalid" });
    if (found.patient_id === caller.id) return send(400, { code: "P0001", message: "own" });
    found.status = "accepted";
    const link = { ...found, id: randomUUID(), caregiver_id: caller.id, status: "active" };
    tables.caregiver_links = tables.caregiver_links.filter((row) => !(row.patient_id === link.patient_id && row.caregiver_id === caller.id));
    tables.caregiver_links.push(link);
    return send(200, link.id);
  }
  if (name === "revoke_caregiver_link") {
    const link = tables.caregiver_links.find((row) => row.id === body.link && (row.patient_id === caller.id || row.caregiver_id === caller.id));
    if (!link) return send(400, { code: "P0002", message: "not found" });
    link.status = "revoked";
    // As the database trigger: ending the link ends location sharing too.
    for (const share of tables.location_shares) {
      if (share.patient_id === link.patient_id && share.caregiver_id === link.caregiver_id) share.status = "revoked";
    }
    return send(204);
  }
  if (name === "my_care_recipients") {
    const rows = tables.caregiver_links
      .filter((row) => row.caregiver_id === caller.id && row.status === "active")
      .map((row) => {
        const owner = tables.profiles.find((profile) => profile.id === row.patient_id);
        return { ...row, link_id: row.id, first_name: owner?.first_name ?? "", last_name: owner?.last_name ?? "" };
      });
    return send(200, rows);
  }
  if (name === "create_caregiver_request") {
    const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    tables.caregiver_requests.push({ id: randomUUID(), caregiver_id: caller.id, code, status: "pending" });
    return send(200, code);
  }
  const careRequest = () =>
    tables.caregiver_requests.find((row) => row.code === String(body.code).toUpperCase() && row.status === "pending");
  if (name === "preview_caregiver_request") {
    const found = careRequest();
    if (!found || found.caregiver_id === caller.id) return send(200, []);
    const helper = tables.profiles.find((row) => row.id === found.caregiver_id);
    return send(200, [{ first_name: helper?.first_name ?? "", last_name: helper?.last_name ?? "" }]);
  }
  if (name === "decide_caregiver_request") {
    const found = careRequest();
    if (!found) return send(400, { code: "P0002", message: "invalid" });
    if (found.caregiver_id === caller.id) return send(400, { code: "P0001", message: "own" });
    found.status = body.approve ? "approved" : "rejected";
    if (body.approve) {
      tables.caregiver_links = tables.caregiver_links.filter((row) => !(row.patient_id === caller.id && row.caregiver_id === found.caregiver_id));
      tables.caregiver_links.push({ id: randomUUID(), patient_id: caller.id, caregiver_id: found.caregiver_id, status: "active", ...fromArguments(body) });
    }
    return send(204);
  }
  if (name === "set_location_share") {
    const connected = tables.caregiver_links.some((l) => l.patient_id === caller.id && l.caregiver_id === body.caregiver && l.status === "active");
    if (body.new_status !== "revoked" && !connected) return send(400, { code: "P0002", message: "not a connected helper" });
    const existing = tables.location_shares.find((s) => s.patient_id === caller.id && s.caregiver_id === body.caregiver);
    if (existing) existing.status = body.new_status;
    else tables.location_shares.push({ id: randomUUID(), patient_id: caller.id, caregiver_id: body.caregiver, status: body.new_status });
    return send(204);
  }
  if (name === "acknowledge_emergency") {
    const event = tables.emergency_events.find((row) => row.id === body.event);
    if (!event || !hasAccess(caller.id, event.patient_id, "can_receive_sos")) return send(403, { code: "42501", message: "no access" });
    tables.emergency_acknowledgements.push({ id: randomUUID(), event_id: event.id, patient_id: event.patient_id, caregiver_id: caller.id, created_at: new Date().toISOString() });
    return send(204);
  }
  return send(404, { message: "no such function" });
}

const DEFAULTS = {
  medications: () => ({ is_active: true }),
  medication_schedules: () => ({ is_active: true }),
  appointments: () => ({ status: "scheduled" }),
  emergency_events: () => ({ status: "active" }),
  // Mirrors the database default.
  facility_reports: () => ({ status: "open" }),
};

function token(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp, role: "authenticated" })}.mock`;
}

function userFromToken(req) {
  const bearer = req.headers.authorization?.replace("Bearer ", "") ?? "";
  try {
    const { sub } = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
    return users.get(sub) ?? null;
  } catch {
    return null;
  }
}

const publicUser = (user) => ({
  id: user.id,
  aud: "authenticated",
  role: "authenticated",
  email: user.email,
  created_at: user.created_at,
  app_metadata: {},
  user_metadata: user.metadata,
});

function session(user) {
  return {
    access_token: token(user),
    refresh_token: `refresh-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: publicUser(user),
  };
}

const RESERVED = new Set(["select", "order", "limit", "on_conflict", "columns"]);

function matches(row, url) {
  for (const [column, condition] of url.searchParams) {
    if (RESERVED.has(column)) continue;
    const dot = condition.indexOf(".");
    const op = condition.slice(0, dot);
    const expected = condition.slice(dot + 1);
    const actual = row[column];
    if (op === "eq" && String(actual) !== expected) return false;
    if (op === "gte" && !(new Date(actual) >= new Date(expected))) return false;
    if (op === "in" && !expected.replace(/[()"]/g, "").split(",").includes(String(actual))) return false;
  }
  return true;
}

function sortRows(rows, url) {
  const order = url.searchParams.get("order");
  if (!order) return rows;
  const keys = order.split(",").map((part) => part.split("."));
  return [...rows].sort((a, b) => {
    for (const [column, direction] of keys) {
      const result = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
      if (result) return direction === "desc" ? -result : result;
    }
    return 0;
  });
}

function handleRest(req, res, url, body, send, table) {
  const rows = tables[table];
  if (!rows) return send(404, { code: "PGRST205", message: `no table ${table}` });
  const isService = req.headers.authorization === "Bearer mock-service-key";
  const caller = userFromToken(req);
  if (!isService && SERVER_ONLY_TABLES.has(table)) return send(401, { code: "42501", message: "denied" });
  if (!isService && !caller && !(PUBLIC_TABLES.has(table) && ["GET", "HEAD"].includes(req.method))) {
    return send(401, { code: "42501", message: "unauthorized" });
  }
  const owner = OWNER_COLUMN[table];
  const visible = (row) => {
    if (isService || PUBLIC_TABLES.has(table) || (owner && caller && row[owner] === caller.id)) return true;
    if (!caller) return false;
    if (table === "caregiver_links") return row.caregiver_id === caller.id;
    if (table === "location_shares") return row.caregiver_id === caller.id;
    // As can_see_location(): an active share and an active helper link.
    if (table === "patient_last_locations") {
      return tables.location_shares.some((s) => s.patient_id === row.patient_id && s.caregiver_id === caller.id && s.status === "active") &&
        tables.caregiver_links.some((l) => l.patient_id === row.patient_id && l.caregiver_id === caller.id && l.status === "active");
    }
    // Administrators review reports, as the real policy allows.
    if (table === "facility_reports" && tables.profiles.some((profile) => profile.id === caller.id && profile.role === "admin")) return true;
    if (table === "emergency_acknowledgements") return row.patient_id === caller.id || row.caregiver_id === caller.id;
    // A patient can read the profile of an active helper.
    if (table === "profiles" && tables.caregiver_links.some((link) => link.caregiver_id === row.id && link.patient_id === caller.id && link.status === "active")) return true;
    const scope = SCOPE[table];
    return Boolean(scope) && hasAccess(caller.id, table === "profiles" ? row.id : row.patient_id, scope);
  };
  const wantsObject = req.headers.accept?.includes("vnd.pgrst.object");
  const returning = req.headers.prefer?.includes("return=representation");

  if (req.method === "GET" || req.method === "HEAD") {
    const found = sortRows(rows.filter((row) => visible(row) && matches(row, url)), url);
    if (req.method === "HEAD" || req.headers.prefer?.includes("count=exact")) {
      res.writeHead(200, { "content-range": `0-${found.length}/${found.length}`, "content-type": "application/json" });
      return res.end(req.method === "HEAD" ? "" : JSON.stringify(found));
    }
    if (wantsObject) return found[0] ? send(200, found[0]) : send(406, { code: "PGRST116", message: "no rows" });
    return send(200, found);
  }

  if (req.method === "POST") {
    const incoming = Array.isArray(body) ? body : [body];
    const created = [];
    for (const item of incoming) {
      const managed = owner === "patient_id" && hasAccess(caller?.id, item.patient_id, "can_manage_reminders");
      if (!isService && owner && item[owner] !== caller?.id && !managed) return send(403, { code: "42501", message: "denied" });
      if (["medications", "medication_schedules", "appointments"].includes(table)) {
        item.created_by = caller?.id;
        item.updated_by = caller?.id;
      }
      if (table === "medication_logs") item.acted_by = caller?.id;
      if (table === "medication_logs" && !["snoozed", "need_help"].includes(item.status)) {
        const duplicate = rows.some((row) => row.schedule_id === item.schedule_id && new Date(row.scheduled_for).getTime() === new Date(item.scheduled_for).getTime() && !["snoozed", "need_help"].includes(row.status));
        if (duplicate) return send(409, { code: "23505", message: "duplicate key" });
      }
      const now = new Date().toISOString();
      const row = { id: randomUUID(), created_at: now, updated_at: now, ...(DEFAULTS[table]?.() ?? {}), ...item };
      if (url.searchParams.has("on_conflict") || req.headers.prefer?.includes("resolution=merge-duplicates")) {
        const key = owner ?? "id";
        const index = rows.findIndex((existing) => existing[key] === row[key]);
        if (index >= 0) rows.splice(index, 1);
      }
      rows.push(row);
      created.push(row);
    }
    if (!returning) return send(201);
    return send(201, wantsObject ? created[0] : created);
  }

  if (req.method === "PATCH") {
    const changed = rows.filter((row) => visible(row) && matches(row, url));
    // Writing needs ownership or the manage permission, not just being able to read.
    const isAdmin = tables.profiles.some((profile) => profile.id === caller?.id && profile.role === "admin");
    const writable = changed.filter((row) => isService || !owner || row[owner] === caller?.id || (table === "facility_reports" && isAdmin) || (owner === "patient_id" && hasAccess(caller?.id, row.patient_id, "can_manage_reminders")));
    for (const row of writable) {
      Object.assign(row, body);
      if (["medications", "medication_schedules", "appointments"].includes(table)) row.updated_by = caller?.id;
    }
    return returning ? send(200, wantsObject ? changed[0] : changed) : send(204);
  }

  if (req.method === "DELETE") {
    const removed = rows.filter((row) => visible(row) && matches(row, url));
    for (const row of removed) rows.splice(rows.indexOf(row), 1);
    if (table === "medications") {
      for (const dependent of ["medication_schedules", "medication_logs"]) {
        tables[dependent] = tables[dependent].filter((row) => !removed.some((med) => med.id === row.medication_id));
      }
    }
    return send(204);
  }
  return send(405, { message: "method not allowed" });
}

function handle(req, res, url, body) {
  const send = (status, data) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(data === undefined ? "" : JSON.stringify(data));
  };
  const path = url.pathname;

  if (path === "/auth/v1/signup" && req.method === "POST") {
    if ([...users.values()].some((user) => user.email === body.email)) {
      return send(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    }
    const user = {
      id: randomUUID(),
      email: body.email,
      password: body.password,
      metadata: body.data ?? {},
      created_at: new Date().toISOString(),
    };
    users.set(user.id, user);
    // Mirrors the real sign-up trigger: only patient or caregiver.
    tables.profiles.push({
      id: user.id,
      role: body.data?.role === "caregiver" ? "caregiver" : "patient",
      first_name: body.data?.first_name ?? "",
      last_name: body.data?.last_name ?? "",
      birth_date: null,
      phone: null,
      locale: body.data?.locale ?? "uz",
      city: "Farg‘ona",
      district: null,
      accessibility: {},
    });
    // Addresses containing "confirm" behave like a project with email confirmation on.
    return body.email.includes("confirm") ? send(200, publicUser(user)) : send(200, session(user));
  }

  if (path === "/auth/v1/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const user = [...users.values()].find((item) => item.email === body.email && item.password === body.password);
      return user
        ? send(200, session(user))
        : send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (grant === "refresh_token") {
      const user = users.get(String(body.refresh_token).replace("refresh-", ""));
      return user ? send(200, session(user)) : send(400, { error_code: "refresh_token_not_found", msg: "Invalid" });
    }
  }

  if (path === "/auth/v1/user") {
    const user = userFromToken(req);
    if (!user) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid" });
    if (req.method === "PUT" && body.password) user.password = body.password;
    return send(200, publicUser(user));
  }

  if (path === "/auth/v1/recover" && req.method === "POST") return send(200, {});
  if (path === "/auth/v1/logout" && req.method === "POST") return send(204);

  if (path.startsWith("/auth/v1/admin/users/")) {
    if (req.headers.authorization !== "Bearer mock-service-key") return send(403, { msg: "forbidden" });
    const id = path.split("/").pop();
    if (req.method === "GET") {
      const user = users.get(id);
      return user ? send(200, publicUser(user)) : send(404, { msg: "User not found" });
    }
    users.delete(id);
    tables.profiles = tables.profiles.filter((row) => row.id !== id);
    tables.patient_health_info = tables.patient_health_info.filter((row) => row.patient_id !== id);
    return send(200, {});
  }

  // Stand-ins for the public map services, so tests never call them.
  if (path === "/geo/photon") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    if (q.includes("xatolik")) return send(503, { message: "down" });
    const features = q.includes("mustaqillik")
      ? [{ geometry: { coordinates: [71.755, 40.365] }, properties: { name: "Mustaqillik ko‘chasi", city: "Farg‘ona", type: "street" } }]
      : [];
    return send(200, { features });
  }
  if (path === "/geo/reverse") {
    return send(200, { display_name: "x", address: { road: "Al-Farg‘oniy", house_number: "5", city: "Farg‘ona" } });
  }
  if (path.startsWith("/geo/foot/route/v1/foot/")) {
    return send(200, { code: "Ok", routes: [{ distance: 2006.9, duration: 1605.5, geometry: { coordinates: [[71.78, 40.39], [71.7864, 40.3864]] } }] });
  }

  // A stand-in for the Claude Messages API, so tests never call Anthropic. It checks
  // the request shape the app must send, then picks a tool from keywords in the
  // question and answers with the tool's result, so tests can see what the
  // server-side tools returned for the signed-in person.
  if (path === "/v1/messages" && req.method === "POST") {
    const key = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (key !== MOCK_ANTHROPIC_KEY) return send(401, { type: "error", error: { type: "authentication_error", message: "bad key" } });
    const beta = String(req.headers["anthropic-beta"] ?? "");
    const toolsOk = Array.isArray(body.tools) && body.tools.length > 0 && body.tools.every((tool) => tool.strict === true && tool.input_schema?.additionalProperties === false);
    if (body.fallbacks !== "default" || !beta.includes("server-side-fallback-2026-07-01") || !toolsOk || body.output_config?.effort !== "low") {
      return send(400, { type: "error", error: { type: "invalid_request_error", message: "unexpected request shape" } });
    }
    const last = body.messages.at(-1);
    const reply = (content, stop_reason) =>
      send(200, { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: body.model, content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    if (typeof last.content !== "string") {
      const results = last.content.filter((block) => block.type === "tool_result").map((block) => block.content).join(" ");
      return reply([{ type: "text", text: `Natija: ${results}` }], "end_turn");
    }
    const text = last.content.toLowerCase();
    if (text.includes("xatolik-sinov")) return send(500, { type: "error", error: { type: "api_error", message: "down" } });
    if (text.includes("rad-sinov")) return reply([], "refusal");
    const call = (name, input) => reply([{ type: "tool_use", id: `toolu_${randomUUID()}`, name, input }], "tool_use");
    const patient = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    if (patient) return call("get_person_medicines", { patient_id: patient[0] });
    if (text.includes("taklif")) return call("offer_page", { page: "invite_helper" });
    if (text.includes("davolash") || text.includes("dori")) return call("get_my_medicines", {});
    if (text.includes("davomat")) return call("no_such_tool", {});
    return reply([{ type: "text", text: "Salom! Men CareMate yordamchisiman." }], "end_turn");
  }

  if (path === "/auth/v1/settings") return send(200, { disable_signup: false, mailer_autoconfirm: true, external: { email: true } });

  if (path === "/rest/v1/rpc/check_rate_limit" && req.method === "POST") {
    if (req.headers.authorization !== "Bearer mock-service-key") return send(401, { code: "42501", message: "denied" });
    // Tests register many accounts from one address; the login test covers limiting.
    if (body.limit_key.startsWith("register:")) return send(200, true);
    const hits = (rateCounters.get(body.limit_key) ?? 0) + 1;
    rateCounters.set(body.limit_key, hits);
    return send(200, hits <= body.max_hits);
  }

  if (path.startsWith("/rest/v1/rpc/")) {
    const caller = userFromToken(req);
    if (!caller) return send(401, { code: "42501", message: "unauthorized" });
    return rpc(path.slice("/rest/v1/rpc/".length), body, caller, send);
  }

  if (path.startsWith("/rest/v1/")) return handleRest(req, res, url, body, send, path.slice("/rest/v1/".length));

  // Test-only inspection, so tests can check what was actually stored.
  if (path === "/__test/profile") {
    const user = [...users.values()].find((item) => item.email === url.searchParams.get("email"));
    if (!user) return send(200, null);
    return send(200, {
      id: user.id,
      profile: tables.profiles.find((row) => row.id === user.id),
      health: tables.patient_health_info.find((row) => row.patient_id === user.id) ?? null,
      links: tables.caregiver_links.filter((row) => row.patient_id === user.id),
      medications: tables.medications.filter((row) => row.patient_id === user.id),
      events: tables.emergency_events.filter((row) => row.patient_id === user.id),
      notifications: tables.emergency_notifications.filter((row) => row.patient_id === user.id),
      logs: tables.medication_logs.filter((row) => row.patient_id === user.id),
      reports: tables.facility_reports.filter((row) => row.reporter_id === user.id),
      location: tables.patient_last_locations.find((row) => row.patient_id === user.id) ?? null,
    });
  }
  // Test-only: make an account an administrator (the real app has no way to do this).
  if (path === "/__test/admin" && req.method === "POST") {
    const user = [...users.values()].find((item) => item.email === body.email);
    const profile = tables.profiles.find((row) => row.id === user?.id);
    if (profile) profile.role = "admin";
    return send(200, {});
  }
  // Test-only: make the stored position older, to test stale positions and update limits.
  if (path === "/__test/location-age" && req.method === "POST") {
    const user = [...users.values()].find((item) => item.email === body.email);
    const row = tables.patient_last_locations.find((item) => item.patient_id === user?.id);
    if (row) {
      const shift = (value) => new Date(new Date(value).getTime() - body.minutes * 60_000).toISOString();
      row.recorded_at = shift(row.recorded_at);
      row.updated_at = shift(row.updated_at);
      row.device_state_at = shift(row.device_state_at);
    }
    return send(200, {});
  }
  // Test-only: link a helper so the delivery status can be checked.
  if (path === "/__test/link" && req.method === "POST") {
    tables.caregiver_links.push({ patient_id: body.patient_id, caregiver_id: randomUUID(), status: "active", can_receive_sos: true });
    return send(201, {});
  }

  return send(404, { message: `mock has no route for ${req.method} ${path}` });
}

export function startMock(port) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        // Not JSON; handlers treat it as an empty body.
      }
      handle(req, res, new URL(req.url, `http://localhost:${port}`), body);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
