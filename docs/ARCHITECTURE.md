# CareMate architecture

## Overview

CareMate is one Next.js 16 application (App Router, React 19, TypeScript strict, Tailwind CSS 4) backed by Supabase (Postgres, Auth, Row Level Security). It deploys to Vercel. There is no separate backend: server components, server actions and a few route handlers do the server work.

```
Browser ── pages (server-rendered) ── server actions / route handlers ── Supabase (RLS)
   │                                        │
   ├─ Piper worker (Russian voice)          ├─ /api/geo ── Photon, Nominatim, FOSSGIS router
   └─ Leaflet + OSM tiles                   └─ /api/tts ── Azure Speech (Uzbek)
```

## Frontend

- **Pages render on the server.** Most work without JavaScript: the language switch and SOS link are plain forms and links.
- **Language** is a cookie read on the server, so the page's `lang` is right for screen readers from the first byte. Texts live in one typed dictionary (`src/lib/i18n/dictionaries.ts`); adding a language means adding one object there.
- **Accessibility settings** are a cookie applied as attributes on `<html>`, so text size, contrast and motion apply before anything is painted. All sizes are in `rem`, so the three text sizes scale the whole interface. Settings are also saved to the account when signed in.
- **The home and SOS pages never wait on Supabase.** They render from cookies alone; SOS loads contacts in the browser afterwards, so it opens even if the database is down.

## Backend

- **Server actions** handle forms (sign-in, profile, medicines, caregivers, reports), with zod validation. Errors are returned as dictionary keys, so they are shown in the person's language and never as technical text.
- **Route handlers:** `/api/sos` (raise, update, see who acknowledged), `/api/emergency-contacts`, `/api/geo` (map lookups), `/api/tts` (Uzbek voice), `/auth/callback`.
- **`src/proxy.ts`** refreshes the Supabase session on signed-in pages only.
- **Supabase settings are read at run time** through a computed name, because Next.js otherwise fixes `NEXT_PUBLIC_*` values into the build.

## Database

Five migrations in `supabase/migrations`. Every table has Row Level Security. Writes that need checks across tables go through `security definer` functions with a fixed `search_path`: invitations, connection requests, revoking, acknowledging an SOS, and rate limiting. Details are in [SECURITY.md](SECURITY.md).

## Authentication

Supabase Auth with email and password. The sign-up trigger creates the profile and accepts only `patient` or `caregiver` as a role; `admin` can only be set in SQL by the project owner. Password reset and email confirmation return through `/auth/callback`.

## Notifications

`src/lib/notifications` defines a `NotificationChannel` interface for Web Push and SMS. Both report "not configured" today, and the SOS screen says plainly that nobody was notified. Each delivery is recorded per person and channel in `emergency_notifications`, so a real provider can be added without changing the SOS flow. An in-app channel exists in practice: helpers see alerts in their area, refreshed every 30 seconds, and can acknowledge them.

## Maps

- **Data:** facilities come from our database. `scripts/import-osm-facilities.mjs` imports them from OpenStreetMap once (not live), marks every one unverified, and takes photos only from Wikimedia Commons with their author and licence.
- **Lookups:** `src/lib/maps` defines a `MapProvider` interface (`searchPlaces`, `reverse`, `walkingRoute`). The OpenStreetMap provider uses Photon for suggestions (Nominatim forbids autocomplete), Nominatim for turning a position into an address, and the FOSSGIS foot router for walking routes (the public OSRM demo is car-only). All calls go through `/api/geo`: positions travel in a POST body, never a URL; answers are cached; calls are spaced one second apart where required; and requests are rate limited per address. The Google provider is a documented placeholder.
- **Display:** Leaflet with OpenStreetMap tiles, loaded only when the person opens the map view. The text list is the main view and works without the map.

## Location sharing

- **Tables:** `location_shares` (one row per patient and helper: active, paused or revoked) and `patient_last_locations` (one row per patient, overwritten). `can_see_location()` requires an active share and an active caregiver link; a trigger revokes sharing when a link is revoked.
- **Sending:** `LocationReporter` runs only while the patient has sharing on (a cookie set by the sharing actions) and the app is open. It uses `watchPosition` with low accuracy and `shouldSend` (at most every 30 s; after a 25 m move or 2 minutes). `/api/location/update` checks the session, an active share, plausible coordinates and a recent time.
- **Showing:** `describeLocation` turns a row into active, stale, unavailable, waiting, paused or revoked; the helper page refreshes every 30 seconds.

## Assistant

- **Layers:** `src/lib/ai/intents.ts` (pure text matching: emergencies, dose changes, quick questions), `answers.ts` (fixed Uzbek and Russian sentences), `data.ts` (database reads with the person's session), `tools.ts` (strict JSON schemas, server-side zod validation, and the actions each tool may offer), `model.ts` (the `AssistantModel` interface and the Anthropic implementation), and `/api/assistant/chat`.
- **Order of a request:** session check and rate limit; a quick-question button is answered from the database; emergency words and dose-change requests get fixed answers; otherwise Claude answers with tools. With no key, or when the model fails, a matching quick question is answered and anything else gets an honest "offline" reply.
- **Model calls:** a manual tool loop of at most five rounds through `client.beta.messages.create`, low effort, strict tools, and server-side fallback (`fallbacks: "default"`). Tool results go back to the model as JSON; only fixed actions reach the browser.
- **Browser:** `AssistantChat` keeps up to 20 messages in `sessionStorage`, asks for the position only for "nearest" questions, uses `SpeechRecognition` for voice input and the app's `useVoice` for reading answers.

## Voice

- **Interface:** `SpeechProvider` (`speak`, `stop`, `isSupported`, `getStatus`) with three providers: `PiperRussianProvider` (Irina, ONNX in a Web Worker), `UzbekSpeechProvider` (Azure through `/api/tts`), and `BrowserSpeechProvider` (system voices).
- **Fallback:** `SpeechService` picks a provider by language and falls back to the browser voice with a specific notice. Every outcome is reported, including "no voice available"; nothing claims to have spoken when it did not.
- **Voice assistance:** `use-voice-assist` listens for clicks (in the capture phase, so a button is named as the person saw it), form changes, keyboard focus, page changes and live-region updates. Announcements within 250 ms are joined into one phrase, so a choice and its result are both heard. Elements can opt in or out with `data-voice`, `data-voice-ignore`, `data-voice-sensitive` and `data-voice-page`.

### Uzbek voice comparison (November 2026)

| Option | Female Uzbek Latin voice | How it runs | Free tier | Why not chosen |
|---|---|---|---|---|
| **Azure** `uz-UZ-MadinaNeural` | Yes | Cloud API | 0.5M characters/month (F0) | **Chosen** |
| Biruniy (Rumi) `dilnoza` | Yes | Cloud API | 5,000 characters | Production address not published, privacy terms not found |
| VoiceLab (Lison) | Not listed | Cloud API | Not verified | Voices and pricing not verifiable |
| Navoiy TTS | Unstated | Python and GPU server | Apache-2.0 | Needs a GPU server |
| Meta MMS | Cyrillic only | Browser possible | CC-BY-NC | Non-commercial only, Cyrillic only |
| Piper / Google | No Uzbek | | | No Uzbek voice |

No audio was listened to during the comparison. Quality judgments come from the providers' descriptions; listen to the result before relying on it.
