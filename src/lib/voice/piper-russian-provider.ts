import type { SpeakOptions, SpeechProvider, SpeechResult, SpeechStatus } from "./types";

const MODEL_URL = "/voices/ru_RU-irina-medium.onnx";
const CONFIG_URL = "/voices/ru_RU-irina-medium.onnx.json";
const BASE_LENGTH_SCALE = 1.04;

type WorkerReply = { id: number; ok: true; wav: Blob } | { id: number; ok: false; error: string };

/** Russian voice: Piper Irina, generated on the user's device inside a Web Worker. */
export class PiperRussianProvider implements SpeechProvider {
  readonly id = "piper-ru";
  private worker: Worker | null = null;
  private status: SpeechStatus = "idle";
  private requestId = 0;
  private modelReady = false;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private settle: ((result: SpeechResult) => void) | null = null;

  isSupported() {
    return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof Audio !== "undefined";
  }

  getStatus() {
    return this.status;
  }

  /** True once the 63 MB model has been loaded in this page session. */
  isModelReady() {
    return this.modelReady;
  }

  speak(text: string, options: SpeakOptions): Promise<SpeechResult> {
    this.stop();
    if (!this.isSupported()) return Promise.reject(new Error("Piper is not supported"));
    const id = ++this.requestId;
    this.status = "loading";

    return new Promise<SpeechResult>((resolve, reject) => {
      this.settle = resolve;
      const worker = this.getWorker(reject);
      const onMessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.id !== id) return;
        worker.removeEventListener("message", onMessage);
        if (id !== this.requestId) return; // Stopped while synthesizing; already settled.
        if (!data.ok) {
          this.status = "error";
          this.settle = null;
          reject(new Error(data.error));
          return;
        }
        this.modelReady = true;
        this.play(data.wav, options.volume, reject);
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        id,
        text,
        lengthScale: BASE_LENGTH_SCALE / options.rate,
        modelUrl: MODEL_URL,
        configUrl: CONFIG_URL,
      });
    });
  }

  stop() {
    this.requestId += 1;
    this.releaseAudio();
    this.status = "idle";
    const settle = this.settle;
    this.settle = null;
    settle?.("stopped");
  }

  private getWorker(reject: (error: Error) => void) {
    if (!this.worker) {
      this.worker = new Worker("/piper-worker.js");
      this.worker.addEventListener("error", () => {
        this.worker?.terminate();
        this.worker = null;
        this.status = "error";
        this.settle = null;
        reject(new Error("Piper worker failed"));
      });
    }
    return this.worker;
  }

  private play(wav: Blob, volume: number, reject: (error: Error) => void) {
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    audio.volume = volume;
    this.audio = audio;
    this.objectUrl = url;
    audio.onended = () => {
      this.releaseAudio();
      this.status = "idle";
      const settle = this.settle;
      this.settle = null;
      settle?.("finished");
    };
    const fail = () => {
      this.releaseAudio();
      this.status = "error";
      this.settle = null;
      reject(new Error("Audio playback failed"));
    };
    audio.onerror = fail;
    this.status = "speaking";
    audio.play().catch(fail);
  }

  private releaseAudio() {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
