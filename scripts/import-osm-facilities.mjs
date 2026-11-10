// Generates supabase/facilities_osm.sql from OpenStreetMap, for pasting into the
// Supabase SQL Editor. Run with: node scripts/import-osm-facilities.mjs
//
// - Everything imported is unverified: OpenStreetMap can be out of date, and a
//   person must confirm a place before the app calls it verified.
// - Accessibility comes only from what the tags say; anything else stays unknown.
// - Photos come only from Wikimedia Commons (wikimedia_commons=File:…), with the
//   author and licence the Commons API reports. The free-form image=* tag is not
//   used, because its licence cannot be checked.
// - No descriptions are written: there is no reliable source for them.
// Map data (c) OpenStreetMap contributors, ODbL. Run rarely: Overpass and Commons
// are shared public services.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const USER_AGENT = "CareMate-facility-import/1.0 (accessibility healthcare directory, Fergana)";

// Fergana city, Fergana district and the nearby towns of Margilan and Quvasoy road:
// south, west, north, east.
const BBOX = "40.27,71.62,40.52,71.95";

const QUERY = `[out:json][timeout:90];
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|dentist)$"](${BBOX});
  nwr["healthcare"~"^(hospital|clinic|doctor|centre|pharmacy|rehabilitation|dentist|laboratory|medical_imaging|sample_collection)$"](${BBOX});
);
out center tags;`;

const DIAGNOSTIC = new Set(["laboratory", "medical_imaging", "sample_collection"]);

export function categoryOf(tags) {
  const names = `${tags.name ?? ""} ${tags["name:ru"] ?? ""} ${tags["name:uz"] ?? ""}`;
  if (tags.emergency === "yes" && tags.amenity !== "hospital") return "emergency";
  if (tags.healthcare === "rehabilitation") return "rehabilitation";
  if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
  if (tags.amenity === "dentist" || tags.healthcare === "dentist") return "dental";
  if (DIAGNOSTIC.has(tags.healthcare)) return "diagnostic";
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  if (/poliklinika|поликлиник/i.test(names)) return "polyclinic";
  if (/stomatolog|стоматолог|dental/i.test(names)) return "dental";
  if (/diagnost|диагност|laborator|лаборатор/i.test(names)) return "diagnostic";
  const specialities = specialitiesOf(tags).filter((value) => value !== "general");
  if ((tags.amenity === "doctors" || tags.healthcare === "doctor") && specialities.length > 0) return "specialist";
  return "clinic";
}

export function specialitiesOf(tags) {
  return (tags["healthcare:speciality"] ?? "")
    .split(";")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z_]{2,40}$/.test(value))
    .slice(0, 12);
}

const sql = (value) => (value === null || value === undefined || value === "" ? "null" : `'${String(value).replaceAll("'", "''")}'`);
const sqlBool = (value) => (value === null ? "null" : value ? "true" : "false");
const sqlArray = (values) => (values.length ? `array[${values.map(sql).join(", ")}]::text[]` : "'{}'::text[]");

function deterministicId(key) {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function tagBool(value) {
  if (value === "yes" || value === "designated") return true;
  if (value === "no") return false;
  return null;
}

/** Every number OpenStreetMap lists, with its kind. Unreadable numbers are kept as written, without a dialling form. */
export function phonesOf(tags) {
  const sources = [
    ["phone", "main"],
    ["contact:phone", "main"],
    ["contact:mobile", "mobile"],
    ["mobile", "mobile"],
    ["emergency:phone", "emergency"],
    ["phone:emergency", "emergency"],
  ];
  const seen = new Set();
  const phones = [];
  for (const [key, type] of sources) {
    for (const display of String(tags[key] ?? "").split(";").map((part) => part.trim()).filter(Boolean)) {
      const parsed = parsePhoneNumberFromString(display, "UZ");
      const e164 = parsed?.isValid() ? parsed.number : null;
      const identity = e164 ?? display;
      if (seen.has(identity)) continue;
      seen.add(identity);
      phones.push({ display: display.slice(0, 60), e164, type, source: "OpenStreetMap", verification: "provider_supplied", verified_at: null });
    }
  }
  return phones.slice(0, 6);
}

function websiteOf(tags) {
  const value = tags.website ?? tags["contact:website"] ?? null;
  return value && /^https?:\/\/[^\s'"<>]+$/i.test(value) ? value.slice(0, 300) : null;
}

export function commonsFile(tags) {
  const value = tags.wikimedia_commons ?? "";
  return /^File:[^|#<>[\]{}]+$/.test(value) ? value : null;
}

export function toRow(element) {
  const tags = element.tags ?? {};
  const name = tags["name:uz"] ?? tags.name ?? tags["name:ru"];
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!name || typeof latitude !== "number" || typeof longitude !== "number") return null;
  const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const providerId = `osm/${element.type}/${element.id}`;
  return {
    id: deterministicId(providerId),
    providerId,
    nameUz: name.slice(0, 200),
    nameRu: (tags["name:ru"] ?? null)?.slice(0, 200) ?? null,
    category: categoryOf(tags),
    specialities: specialitiesOf(tags),
    address: address.slice(0, 300) || null,
    district: (tags["addr:district"] ?? tags["addr:suburb"] ?? tags["addr:city"] ?? null)?.slice(0, 100) ?? null,
    latitude,
    longitude,
    phone: (tags.phone ?? tags["contact:phone"] ?? null)?.slice(0, 40) ?? null,
    phones: phonesOf(tags),
    website: websiteOf(tags),
    hours: (tags.opening_hours ?? null)?.slice(0, 200) ?? null,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    commons: commonsFile(tags),
    wheelchair: tags.wheelchair ?? null,
    entrance: tagBool(tags.wheelchair),
    toilet: tagBool(tags["toilets:wheelchair"]),
    photo: null,
  };
}

/** Plain text from the HTML the Commons API returns for authors. */
export function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Thumbnail, author and licence for each Commons file, from the Commons API. */
async function fetchCommonsPhotos(files) {
  const photos = new Map();
  for (let index = 0; index < files.length; index += 50) {
    const batch = files.slice(index, index + 50);
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      titles: batch.join("|"),
      iiprop: "url|extmetadata",
      iiurlwidth: "640",
      iiextmetadatafilter: "Artist|LicenseShortName|AttributionRequired",
    }).toString();
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Commons answered ${response.status}`);
    const { query } = await response.json();
    const normalized = new Map((query?.normalized ?? []).map((entry) => [entry.to, entry.from]));
    for (const page of Object.values(query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      const author = stripHtml(info?.extmetadata?.Artist?.value);
      const license = stripHtml(info?.extmetadata?.LicenseShortName?.value).slice(0, 100);
      // Without an author and a licence the photo cannot be credited, so it is not used.
      if (!info?.thumburl || !author || !license) continue;
      photos.set(normalized.get(page.title) ?? page.title, {
        url: info.thumburl,
        pageUrl: info.descriptionurl,
        author,
        license,
      });
    }
  }
  return photos;
}

export function toSql(rows) {
  const lines = [
    "-- Generated by scripts/import-osm-facilities.mjs. Do not edit by hand.",
    "-- Data (c) OpenStreetMap contributors, ODbL. Photos from Wikimedia Commons, credited per file.",
    "-- All rows are unverified. Safe to run again: existing rows are updated, not duplicated.",
    "-- Needs migrations up to 20261110000006_location_and_contacts.sql.",
    "",
  ];
  for (const r of rows) {
    lines.push(
      `insert into public.medical_facilities (id, provider_id, name_uz, name_ru, category, specialities, status, address, district, latitude, longitude, phone, website, opening_hours, is_demo, data_source, source_url, source_updated_at, verification_status, photo_url, photo_page_url, photo_author, photo_license, phone_numbers, contact_source, contact_verification_status, contact_updated_at) values (${sql(r.id)}, ${sql(r.providerId)}, ${sql(r.nameUz)}, ${sql(r.nameRu)}, ${sql(r.category)}, ${sqlArray(r.specialities)}, 'active', ${sql(r.address)}, ${sql(r.district)}, ${r.latitude}, ${r.longitude}, ${sql(r.phone)}, ${sql(r.website)}, ${sql(r.hours)}, false, 'OpenStreetMap', ${sql(r.sourceUrl)}, now(), 'unverified', ${sql(r.photo?.url)}, ${sql(r.photo?.pageUrl)}, ${sql(r.photo?.author)}, ${sql(r.photo?.license)}, ${sql(JSON.stringify(r.phones))}::jsonb, ${r.phones.length ? "'OpenStreetMap'" : "null"}, '${r.phones.length ? "provider_supplied" : "unavailable"}', now())`,
      `  on conflict (id) do update set provider_id = excluded.provider_id, name_uz = excluded.name_uz, name_ru = excluded.name_ru, category = excluded.category, specialities = excluded.specialities, address = excluded.address, district = excluded.district, latitude = excluded.latitude, longitude = excluded.longitude, phone = excluded.phone, website = excluded.website, opening_hours = excluded.opening_hours, source_updated_at = excluded.source_updated_at, photo_url = excluded.photo_url, photo_page_url = excluded.photo_page_url, photo_author = excluded.photo_author, photo_license = excluded.photo_license, phone_numbers = case when public.medical_facilities.contact_verification_status = 'officially_verified' then public.medical_facilities.phone_numbers else excluded.phone_numbers end, contact_source = case when public.medical_facilities.contact_verification_status = 'officially_verified' then public.medical_facilities.contact_source else excluded.contact_source end, contact_verification_status = case when public.medical_facilities.contact_verification_status = 'officially_verified' then public.medical_facilities.contact_verification_status else excluded.contact_verification_status end, contact_updated_at = case when public.medical_facilities.contact_verification_status = 'officially_verified' then public.medical_facilities.contact_updated_at else excluded.contact_updated_at end;`,
    );
    if (r.wheelchair) {
      const note = `OpenStreetMap wheelchair=${r.wheelchair}`.slice(0, 200);
      lines.push(
        `insert into public.facility_accessibility (facility_id, accessible_entrance, accessible_toilet, accessibility_verified, accessibility_notes) values (${sql(r.id)}, ${sqlBool(r.entrance)}, ${sqlBool(r.toilet)}, 'unverified', ${sql(note)})`,
        `  on conflict (facility_id) do nothing;`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  const { elements } = await response.json();
  const seen = new Set();
  const rows = elements
    .map(toRow)
    .filter((row) => row && !seen.has(row.id) && seen.add(row.id))
    .sort((a, b) => (a.nameUz < b.nameUz ? -1 : a.nameUz > b.nameUz ? 1 : 0));

  const files = [...new Set(rows.map((row) => row.commons).filter(Boolean))];
  const photos = files.length ? await fetchCommonsPhotos(files) : new Map();
  for (const row of rows) row.photo = row.commons ? (photos.get(row.commons) ?? null) : null;

  const target = fileURLToPath(new URL("../supabase/facilities_osm.sql", import.meta.url));
  await writeFile(target, toSql(rows), "utf8");
  const counts = {};
  for (const row of rows) counts[row.category] = (counts[row.category] ?? 0) + 1;
  console.log(`Fetched ${elements.length} elements, wrote ${rows.length} facilities.`, counts);
  console.log(`Commons files tagged: ${files.length}; usable credited photos: ${photos.size}.`);
  console.log(`With phone: ${rows.filter((r) => r.phone).length}, website: ${rows.filter((r) => r.website).length}, hours: ${rows.filter((r) => r.hours).length}, wheelchair tag: ${rows.filter((r) => r.wheelchair).length}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
