# CareMate security and privacy

## Principles

- A patient sees and changes their own data.
- A helper sees only what the patient shared, permission by permission, through an active link.
- An administrator manages facility information and reviews reports. They have **no** policy on any medical or personal table.
- Secrets stay on the server. The service role key is used only for account deletion, rate limiting and recording SOS delivery status.

## Row Level Security

Every table has RLS enabled, and `anon` and `authenticated` start with no rights; each right is granted explicitly. Highlights:

| Data | Who can read | Who can write |
|---|---|---|
| Profile | Owner; a helper with `profile` permission; a patient sees their own helpers | Owner, limited columns. Role changes are blocked by a trigger |
| Health details | Owner; a helper with `health` permission | Owner |
| Medicines, schedules, appointments | Owner; a helper with view or manage permission | Owner; a helper with `manage` permission (never delete). Every change records who made it |
| Medication history | Owner; a helper with permission | Insert only (no edits or deletes) |
| SOS events | Owner; a helper with `sos` permission | Owner (raise, cancel, add address) |
| SOS delivery records | Owner and recipient | Server only |
| Facilities | Everyone (active ones) | Administrators. Every change goes to the audit log |
| Facility reports | The reporter; administrators | Reporter creates; administrator decides |
| Saved places | Owner only | Owner |
| Rate limits, audit log | Server; audit log readable by administrators | Server / triggers only |

These rules are tested on real Postgres (`tests/db`) as each role: visitor, patient, helper, stranger and administrator.

## Caregiver permissions

- A connection starts only from the patient: either the patient's invitation, or the patient approving a helper's request after seeing the helper's name.
- Codes are 10 characters from a 32-letter alphabet (50 random bits), single-use, valid 7 days, rate limited, and stored only as SHA-256 hashes.
- Seven permissions: profile, health, contacts, medicines, appointments, SOS, and managing reminders. Managing implies seeing medicines and appointments, so a helper can read what they add.
- Revoking takes effect immediately, from either side.

## SOS handling

- The call button only opens the phone app. The app never claims a call was made.
- An alert is saved only after a 5-second countdown that can be cancelled. Location is included only if the browser grants it.
- Delivery is reported per channel. "Sent" would mean a provider accepted the message, and is never shown as "delivered". Today no provider is connected and the screen says nobody was notified.
- Demo runs are stored as demos and never reach helpers.

## Personal data

- **Minimal collection:** medical details are optional and never required at sign-up.
- **Location:** for the map, used only after a button press, never put in URLs (map lookups use POST), and never stored; only an address the person confirms is saved. Location sharing with helpers is opt-in per helper, keeps only the last known position (deleted when sharing stops), runs only while the app is open, and is readable by a helper only while both the share and the helper link are active.
- **Assistant:** its tools use the person's own session, so Row Level Security applies to everything it reads. Tool inputs are validated again on the server, the pages it can offer are a fixed list, and it cannot change data. Emergency and dose-change questions get fixed answers before any model is asked. With `ANTHROPIC_API_KEY` set, the question and the data its tools return are sent to Anthropic; nothing is stored or logged on the server, and the conversation lives only in the browser tab.
- **Voice:** medicine names are not read aloud unless the person opts in. With the Azure voice, Uzbek text goes to Microsoft for speech, and the settings page says so.
- **Logs:** server logs record error codes only, never personal or medical content.
- **Deletion:** a person can delete their account from the profile page. All their data is removed through cascading foreign keys.
- **Hosting:** Supabase and Vercel host data outside Uzbekistan. Uzbekistan's personal data law may require local storage for citizens' data. Get legal advice before real use.

## Abuse protection

- Database-backed rate limits on sign-in, registration, password reset, invitations, requests, SOS, reports, map lookups, new voice phrases and assistant questions (30 per 10 minutes). Location updates are accepted at most every 20 seconds.
- Map and voice lookups are cached and restricted to the Fergana valley, so they cannot be used as an open proxy.
- Security headers: `nosniff`, `DENY` framing, a strict referrer policy, and geolocation allowed only for this site.
