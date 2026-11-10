# CareMate

CareMate is an accessible healthcare companion for older people and people with disabilities in Fergana, Uzbekistan. It finds medical facilities, helps with medicines and appointments, connects a person with the relatives who help them, and offers a clear SOS screen. The interface is in Uzbek (Latin) and Russian.

It is a working pilot, not a medical device. See [What works](#what-works) for the honest state of each part, and [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) for what is left.

## What works

| Area | State |
|---|---|
| Home, header with logo, `UZ \| RU` switch and account button, five-item bottom menu, SOS on every page | Working |
| Accessibility settings: three text sizes, high contrast, reduced motion, simplified view, sound feedback | Working, kept on the device and in the account |
| Voice assistance: announces pages, buttons, choices, field labels and messages; Repeat and Stop always visible | Working (off by default) |
| Russian voice: Piper Irina, on the device, in a Web Worker | Working |
| Uzbek voice: Microsoft Azure `uz-UZ-MadinaNeural` through a server route | **Needs an Azure key.** Without it, the browser's voice is used and the app says so |
| Medical map: search with suggestions, current location with address, list and map views, filters, cards | Working |
| Facility pages: hours, website, specialities, accessibility yes/no/unknown, walking route, navigation links | Working |
| Facility data: 97 real places from OpenStreetMap plus 6 marked DEMO | Loaded, **all unverified** |
| Facility photos | Only credited Wikimedia Commons photos are used. **None exist yet for Fergana**, so category icons are shown |
| Reporting wrong facility data, administrator review page | Working |
| Accounts: registration as patient or relative/caregiver, sign-in, password reset, profile, address autofill, deletion | Working |
| Caregivers: invitation code or link, helper's connection request, per-permission sharing, revoking | Working |
| Medicines, dose actions, history, appointments | Working on the page |
| Location sharing with chosen helpers: off by default, per helper, pause or stop, last known position only | Working **while CareMate is open** on the patient's phone; no background tracking |
| Facility phone numbers with type, source and verification; call buttons only for numbers that can be read reliably; administrator editing | Working. Only 10 of 97 imported places have a number, all unverified |
| CareMate assistant: quick questions, typed or spoken questions, answers from the person's own data, Uzbek and Russian, read aloud | Quick questions work without any key. **Free questions need `ANTHROPIC_API_KEY`** |
| SOS: call 103, location, saved event, cancellation, call/SMS links to contacts, helper's "I saw it" | Working |
| SOS demo screen at `/sos/demo` | Working |
| **Notifications to a phone** (SOS to helpers, medicine reminders) | **Not built.** Helpers see alerts only with CareMate open |
| Email invitations | **Not available**: no email service connected |
| PWA install | Manifest and icons only. **No service worker or offline mode yet** |
| Admin facility editing, city analytics | **Not built** |

## Requirements

- Node.js 20.12 or newer, npm
- A Supabase project (the free tier works)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase the app still runs, and account pages say that accounts are not set up.

## Supabase setup

Everything is done on the Supabase website; no Docker or CLI is needed.

**1. Create the database.** In **SQL Editor**, run each file, in this order, one at a time:

1. `supabase/migrations/20261106000001_core_schema.sql`
2. `supabase/migrations/20261106000002_security.sql`
3. `supabase/migrations/20261106000003_sos_and_medication_answers.sql`
4. `supabase/migrations/20261106000004_caregiver_area.sql`
5. `supabase/migrations/20261109000005_facility_directory.sql`
6. `supabase/migrations/20261110000006_location_and_contacts.sql`
7. `supabase/seed.sql`: demonstration facilities, each marked DEMO
8. `supabase/facilities_osm.sql`: real places from OpenStreetMap, all unverified (run it again after migration 6 to load phone numbers into the new contact fields)

The migrations run once each. The last two files can be run again safely.

**2. Sign-in addresses.** In **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3000` (your real address once deployed) and add `http://localhost:3000/auth/callback` to **Redirect URLs**.

**3. Connect the app.** Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (also called **Publishable**) and `SUPABASE_SERVICE_ROLE_KEY` (also called **Secret**) from **Project Settings → API Keys**. Keep the secret key only in `.env.local` and your hosting settings.

**4. Check it.**

```bash
npm run check:supabase
```

This only reads. It prints no keys or personal data, and names any SQL file still to run.

**5. An administrator (optional).** Register normally, then in SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

The administrator can review reported errors at `/admin/reports`, but has no access to anyone's medical data.

Limits to know: Supabase's own email sends only a few messages an hour (add SMTP under **Authentication → Emails** for real use), and free projects pause after about a week without activity.

## Patients and caregivers

- At registration, a person chooses **Patient** or **Relative / Caregiver**. Medical details are never required.
- A patient connects a helper under **Yordamchim / Помощник** in one of two ways:
  - **Invitation:** the patient chooses what to share and gets a code and link to give the helper.
  - **Request:** the helper creates a code under their area; the patient enters it, sees who is asking, chooses what to share, and approves or rejects.
- Codes work once, last 7 days, and are stored only as hashes. Nothing is shared before the patient agrees, and access can be changed or revoked at any time.
- Anything a helper changes or marks is shown to the patient with the helper's name.

## Location sharing

- **Off by default.** Only the patient can turn it on, under **Yordamchim → Joylashuvni ulashish** (`/location`), and only for helpers they tick. Each helper can be switched off on their own; sharing can be paused for everyone or stopped, which also deletes the stored position.
- **Last known position only.** One row per patient is kept and overwritten. The phone sends a new position at most every 30 seconds, and only after moving 25 m or every 2 minutes. No history is kept.
- **Only while CareMate is open.** A website cannot follow a phone in the background or with the screen locked, and CareMate does not try to. A banner is shown on every page while sharing runs.
- **What a helper sees** (`/caregiver/locations`, "Yaqinlarim joylashuvi"): the time of the last position, its accuracy, "possibly outdated" after `LOCATION_STALE_MINUTES` (15 by default), "the device cannot determine its location", or "paused". Never "live".
- **Revoking a helper** stops sharing with them at once, in the database. Row Level Security lets a helper read a position only while both the sharing and the helper link are active.

## Facility contacts

- Each place can have several numbers (main, reception, appointments, emergency, pharmacy, mobile), each with its source and verification: officially verified, supplied by the provider, reported by a user, unverified, or unavailable.
- Numbers are checked with `libphonenumber-js` (Uzbekistan by default). A call button appears only for a number that can be read reliably; any other number is shown exactly as written, with a note that it cannot be called automatically. Places without a number say so instead of hiding the section.
- **Sources:** the OpenStreetMap import (`phone`, `contact:phone`, `contact:mobile`), always marked unverified. An administrator can edit contacts at `/admin/facilities/<id>`; "officially verified" needs a named source, every change is audited, and the import never overwrites an officially verified number.
- Google Places contact fields are not used: they are billed at a higher tier and Google's terms restrict storing them.

## CareMate assistant

Open it with the round button above SOS, or at `/assistant`. It needs a signed-in person.

- **Quick questions** (next medicine, today's medicines, my helpers, where my family is, who sees my location, nearest accessible place, nearest pharmacy, how SOS works, how to invite a helper) are answered straight from the database, with fixed Uzbek or Russian wording. They work with no AI key, and when the AI service is down.
- **Free questions** go to Claude (`claude-opus-5-5` by default, low effort for quick replies). Claude can only call CareMate's own tools, which run on the server with the person's own session, so Row Level Security decides what it may read, exactly as on the screens: the person's medicines (in Fergana time), their helpers, medicines and locations that others have shared with them, their own sharing, the facility directory, and their profile. A helper asking about someone who did not share their medicines gets "not shared".
- **Nothing happens without a tap.** The assistant cannot change data, call, or invite anyone. It offers buttons (open a page, open a place, call a number that can be read reliably); the person decides.
- **Safety first.** Words that suggest an emergency get "call 103 or press SOS" immediately, before any model is asked. Requests to change, skip or stop a medicine are referred to a doctor. The model is told never to diagnose or invent facilities, numbers or accessibility.
- **Voice:** questions can be spoken (the browser's speech recognition, `uz-UZ` or `ru-RU`; Chrome sends the audio to Google for recognition), and answers can be read aloud with the app's voices. Answers are read automatically only with voice assistance on and personal details allowed.
- **Privacy:** the conversation is kept only in the current browser tab and disappears when it closes; the server does not store or log questions or answers. With a key set, the question and the data the tools return for it are sent to Anthropic.

**Setting it up:** create a key at [platform.claude.com](https://platform.claude.com), then put it in `.env.local` (and in your hosting settings) as `ANTHROPIC_API_KEY`. It is read only on the server; never give it a `NEXT_PUBLIC_` name or paste it into a chat or ticket. Optional: `ASSISTANT_MODEL` to choose another Claude model, `ASSISTANT_PROVIDER=none` to switch free questions off. Requests use server-side fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if the model declines a request, the API retries it on Anthropic's recommended fallback model. Usage is paid per token; each person is limited to 30 questions every 10 minutes. Another provider can be added by implementing `AssistantModel` in `src/lib/ai/model.ts`.

## Voice

- **Voice assistance** (off by default, on the home screen and in Profile) announces what the person opens, presses or chooses, and the messages the page shows. Medicine names become "Personal details" unless the person allows them to be read aloud. People who use a screen reader should leave it off.
- **Russian:** Piper Irina runs on the device. The first use downloads about 63 MB; the SOS screens never start that download.
- **Uzbek:** to use the natural Azure voice, create a Speech resource in the Azure portal (the F0 tier includes 0.5 million characters a month), then set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` on the server. The key never reaches the browser. With a key, Uzbek text is sent to Microsoft to be spoken, and the settings page says so. Without a key, the browser's voice is used, with a notice.
- Why Azure: comparing Biruniy, VoiceLab, Azure, Navoiy TTS, Meta MMS, Piper and Google, it was the only option with a female Uzbek Latin voice, fully documented API and a stated free tier. No voice was listened to during the comparison, so quality was judged from published descriptions only. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#voice).
- The Irina model's underlying dataset licence is listed as unknown on its [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/irina/medium/MODEL_CARD): review it before distributing beyond the hackathon.

## Maps

No key is needed. All lookups go through the app's own `/api/geo`, which caches answers, limits requests, and spaces calls one second apart where a service requires it.

| Need | Service | Notes |
|---|---|---|
| Map tiles | OpenStreetMap | Attribution is always shown |
| Address suggestions | Photon (komoot) | Built for search-as-you-type |
| Address from a position | Nominatim | Only after the person presses the location button |
| Walking routes | FOSSGIS `routed-foot` | Real walking times; the app adds a caution about sidewalks |

The public services suit a pilot. For heavier use, set `PLACE_SEARCH_URL`, `REVERSE_GEOCODING_URL` and `WALKING_ROUTING_URL` to your own instances. Google Maps is prepared as a provider interface but not implemented: its terms require a Google map, so it cannot be mixed into this one.

**Location:** asked for only when the person presses a button, used once, never tracked, never put in a web address, and never saved. Only an address the person confirms is saved in their profile.

**Facility data:** refresh it with `node scripts/import-osm-facilities.mjs`, then run the new `supabase/facilities_osm.sql`. Everything imported is unverified; accessibility comes only from OpenStreetMap tags, and photos only from Wikimedia Commons with their author and licence.

## SOS

- The call button opens the phone app for `NEXT_PUBLIC_EMERGENCY_NUMBER` (103 by default). The website cannot place a call or know whether one happened, and never says it did.
- "Notify my relatives" waits 5 seconds (with Cancel), saves an event with time and, if allowed, location, and reports honestly. With no phone notification service connected, it says nobody was notified and offers call and SMS buttons for the person's contacts.
- A helper sees active alerts in their area and can press "I saw it", which the patient sees.
- To try it safely, use **Profile → Safely try the SOS screen** or open `/sos/demo`. It has no real call or SMS links, and its events never reach helpers.

## Environment variables

See `.env.example`. Only the three Supabase values are needed to start; everything else is optional and documented there.

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

- `npm test`: unit tests, plus permission tests that run the real migrations on real Postgres (PGlite) as each database role.
- `npm run test:e2e`: browser tests (run `npx playwright install chromium` once). They use an in-memory stand-in for Supabase, the map services and the Claude API, and never contact a real project or public service, even with `.env.local` present. Tests guard this.

Neither replaces trying the app against your own Supabase project.

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. In **Settings → Environment Variables**, add the Supabase values, `NEXT_PUBLIC_APP_URL` (your Vercel address) and any optional ones you use.
3. In Supabase, change **Site URL** and add `https://your-app.vercel.app/auth/callback` to **Redirect URLs**.
4. Deploy, then open the app and run `npm run check:supabase` locally against the same project.

The voice model (63 MB) is served as a static file. Watch Vercel's bandwidth on the free plan if many people use the Russian voice.

## Project structure

```
src/app            Pages and API routes (/api/geo, /api/tts, /api/sos, /api/location, /api/assistant)
src/components     Interface components
src/lib            Logic: account, ai (assistant), caregiver, care, facilities, location, maps, voice, i18n, settings, supabase
supabase           SQL migrations and data
public/brand       Logo and icons (regenerate with node scripts/generate-brand-assets.mjs)
scripts            Facility import, brand assets, Supabase check
tests, e2e         Automated tests
docs               Architecture, security, roadmap
```
