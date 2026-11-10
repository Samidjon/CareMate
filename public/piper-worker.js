/*
 * Runs Piper synthesis off the main thread so the interface never freezes,
 * including on slow phones and during the SOS flow.
 * Protocol: { id, text, lengthScale, modelUrl, configUrl } -> { id, ok, wav | error }
 */
importScripts("/vendor/ort/ort.wasm.min.js", "/vendor/phonemize/piper_phonemize.js", "/piper-browser.js");

let enginePromise = null;

self.onmessage = async ({ data }) => {
  const { id, text, lengthScale, modelUrl, configUrl } = data;
  try {
    if (!enginePromise) enginePromise = self.CareMatePiper.createEngine(modelUrl, configUrl);
    const engine = await enginePromise;
    const pcm = await engine.speak(text, { lengthScale });
    self.postMessage({ id, ok: true, wav: self.CareMatePiper.toWav(pcm, engine.sampleRate) });
  } catch (error) {
    enginePromise = null;
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
