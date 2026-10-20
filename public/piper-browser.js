/*
 * Small browser-side Piper inference adapter for CareMate.
 * Runtime: onnxruntime-web + @diffusionstudio/piper-wasm.
 * The app's install script copies these dependencies into /public/vendor.
 */
(function () {
  "use strict";

  const PH_CFG = { pad: "_", bos: "^", eos: "$", interspersePad: true, addBos: true, addEos: true };
  const root = window.location.origin;
  const asset = (path) => new URL(path, root).toString();
  const ort = window.ort;

  if (!ort) throw new Error("ONNX Runtime did not load.");
  if (!window.createPiperPhonemize) throw new Error("Piper phonemizer did not load.");

  ort.env.wasm.wasmPaths = asset("/vendor/ort/");
  ort.env.wasm.numThreads = window.crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1;

  let phonemizerPromise;

  function getPhonemizer() {
    if (!phonemizerPromise) {
      phonemizerPromise = (async () => {
        let output = [];
        const mod = await window.createPiperPhonemize({
          print: (line) => {
            try { output.push(JSON.parse(line)); }
            catch (error) { console.warn("Piper phonemizer returned an invalid line.", error); }
          },
          printErr: (line) => console.warn("[Piper phonemizer]", line),
          locateFile: (file) => asset("/vendor/phonemize/" + file),
        });

        return {
          phonemize(texts, language) {
            output = [];
            const resultCode = mod.callMain([
              "--espeak_data", "/espeak-ng-data",
              "--language", language,
              "--input", JSON.stringify(texts.map((text) => ({ text }))),
            ]);
            if (resultCode !== 0) throw new Error("Piper phonemizer exited with code " + resultCode);
            return output;
          },
        };
      })();
    }
    return phonemizerPromise;
  }

  async function fetchChecked(url, kind) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load " + kind + " (HTTP " + response.status + ")");
    return response;
  }

  async function createEngine(modelUrl, configUrl) {
    const [modelResponse, configResponse] = await Promise.all([
      fetchChecked(modelUrl, "voice model"),
      fetchChecked(configUrl, "voice configuration"),
    ]);
    const [modelBuffer, config] = await Promise.all([
      modelResponse.arrayBuffer(),
      configResponse.json(),
    ]);

    const session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ["wasm"] });
    const inference = config.inference || {};
    const sampleRate = (config.audio && config.audio.sample_rate) || 22050;
    const language = (config.espeak && config.espeak.voice) || "ru";

    return {
      sampleRate,
      async infer(ids, options) {
        const opts = options || {};
        const feeds = {
          input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
          input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
          scales: new ort.Tensor("float32", Float32Array.from([
            opts.noiseScale ?? inference.noise_scale ?? 0.667,
            opts.lengthScale ?? inference.length_scale ?? 1,
            opts.noiseW ?? inference.noise_w ?? 0.8,
          ]), [3]),
        };
        if (opts.speakerId != null) {
          feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(opts.speakerId)]), [1]);
        }
        const result = await session.run(feeds);
        return result.output.data;
      },
      async speak(text, options) {
        const phonemizer = await getPhonemizer();
        const result = phonemizer.phonemize([text], language)[0];
        const ids = result && result.phoneme_ids;
        if (!Array.isArray(ids) || ids.length === 0) throw new Error("No phonemes were produced for this text.");

        const eos = config.phoneme_id_map[PH_CFG.eos][0];
        const sentences = [];
        let current = [];
        for (const id of ids) {
          current.push(id);
          if (id === eos) {
            sentences.push(current);
            current = [];
          }
        }
        if (current.length) sentences.push(current);

        const silence = new Float32Array(Math.round(sampleRate * ((options && options.sentenceSilence) ?? 0.18)));
        const chunks = [];
        for (const sentence of sentences) {
          chunks.push(await this.infer(sentence, options), silence);
        }
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const audio = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          audio.set(chunk, offset);
          offset += chunk.length;
        }
        return audio;
      },
      dispose() { return session.release(); },
    };
  }

  function toWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeText = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  window.CareMatePiper = { createEngine, getPhonemizer, toWav };
})();
