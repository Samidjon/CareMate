# CareMate — Smart Healthcare

CareMate is a simple, accessible web-app starter for older adults and people with disabilities. The prototype focuses on clear navigation, large tap targets, a prominent SOS action, adjustable accessibility settings, and Piper-based local voice guidance.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The `postinstall` script copies ONNX Runtime Web and Piper phonemizer assets into `public/vendor`. The first install requires an internet connection to fetch npm dependencies.

## Piper voice (Irina)

- Russian-language voice model is stored at `public/voices/ru_RU-irina-medium.onnx` with its companion `.onnx.json` configuration.
- When the interface language is Russian, the app generates speech with Piper in the browser. No paid speech API is required.
- On the first use, the browser loads the approximately 63 MB model and may take some time to initialize. The model stays in browser memory for the current page session.
- Only the Russian Piper Irina voice is bundled. For other interface languages, the app falls back to the browser's built-in speech synthesis; no separate Uzbek TTS service or Python backend is included.
- The voice synthesis runs on the user's device using WebAssembly/ONNX Runtime. Performance depends on the device and browser.

The supplied Irina model is listed in the `rhasspy/piper-voices` repository under MIT metadata, but its model card says the underlying RHVoice dataset licence is unknown. Review the voice model card before distributing the app beyond the hackathon: https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/irina/medium/MODEL_CARD

## Current prototype

- Uzbek/Russian language switch on the home screen
- Simplified home screen with large action buttons
- Large-text and high-contrast settings
- Piper Irina voice hint for Russian, with browser voice fallback for Uzbek
- SOS dialog with a `tel:103` call link and clearly labelled test-only contact action
- Feature placeholder screens for the medical map, medication reminders, and trusted contacts

## Important limitations

- The map, reminders, login, and trusted-contact notifications are not connected yet.
- The test-contact action does not send a real message.
- The SOS phone link opens the phone dialer; the site cannot confirm that a call was placed or answered.
- Medical data and accessibility information must be checked before this prototype is used for real care.
- The app and voice runtime should be served over HTTP/HTTPS. Opening source files directly with `file://` will not work for WebAssembly loading.

## Next steps

1. Connect Supabase authentication and secure user data with Row Level Security.
2. Add a real map and verify medical facility details for Fergana.
3. Implement opt-in notifications to trusted contacts.
4. Test accessibility with older adults, keyboard navigation, and screen readers.
