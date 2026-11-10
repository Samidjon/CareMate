# CareMate roadmap

Status as of 9 November 2026. "Done" means built, tested automatically, and documented; "Done" does not mean tested with real users.

## Done

- Brand: logo (original kept, SVG redrawing, light and dark versions), icons, favicon, manifest.
- Simple layout: header with `UZ | RU` and account button, five-item bottom menu, SOS on every page.
- Accessibility settings, kept on the device and in the account; WCAG 2.2 AA automated checks on every page.
- Voice: Piper Irina (Russian), Azure (Uzbek, with a key), browser fallback with notices, voice assistance for every interaction.
- Accounts: patient and caregiver registration, sign-in, password reset, profile, address autofill, deletion.
- Caregivers: invitation codes and links, helper's connection requests, seven permissions, revoking, the helper's area, shared reminders, change attribution.
- Medical map: 97 OpenStreetMap places plus 6 DEMO, search with suggestions, current location with address, list and map views, filters, walking routes, saving, error reports, administrator review.
- Medicines, history, appointments; SOS with saved events, demo mode, acknowledgements.
- Location sharing with chosen helpers: opt-in, pause and stop, last known position, outdated warnings.
- Facility contacts: typed phone numbers with source and verification, checked call buttons, administrator editing with an audit log.
- CareMate assistant: quick questions from the database without any key, Claude with server-side tools for free questions, emergency and dose-change safeguards, voice input and output, Uzbek and Russian.
- Row Level Security for every table, tested on real Postgres.

## Partly done

| Item | What is missing |
|---|---|
| Uzbek voice | Needs an Azure key. Nobody has listened to it yet |
| Facility data | All unverified. No photos, opening hours for few places, accessibility only from OSM tags |
| Administration | Report review and contact editing. No full facility editing screen, verification workflow or audit log viewer |
| CareMate assistant | Free questions need an Anthropic key. Nobody has tested the answers with older adults yet; Uzbek speech recognition quality depends on the browser |
| Location sharing | Works only while CareMate is open; background sharing needs a native app |
| PWA | Manifest and icons only. No service worker, offline page or install prompt |
| Caregiver invitations | No email sending (no email service) |

## Not done

- **Phone notifications:** Web Push (VAPID, service worker, subscriptions) for SOS alerts and reminders. This is the most important gap for real use: today helpers see alerts only with CareMate open.
- **Reminder scheduler:** a protected cron endpoint, e.g. Supabase `pg_cron` calling the app every minute. Vercel's free cron runs only daily.
- **SMS provider:** no Uzbek SMS gateway has been chosen.
- **City analytics** with anonymised, thresholded statistics.
- **"Open now" filter:** opening hours data is too sparse to trust.
- **Marker clustering:** not needed at about 100 places.
- **Uzbek Cyrillic and English** interface languages: the dictionary is ready for them.

## Needs outside work

- Verify facilities in person or by phone, starting with those you plan to demonstrate.
- Native-speaker review of the Uzbek texts, especially on the SOS screens.
- Testing with older adults, with a screen reader (TalkBack, VoiceOver) and on low-end Android phones.
- Legal review of data hosting and of the Irina voice model licence.
- Review of the React Leaflet licence (Hippocratic 2.1) before commercial use.
