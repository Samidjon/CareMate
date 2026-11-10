import type { SpeakOptions, SpeechProvider, SpeechResult, SpeechStatus } from "./types";

/**
 * Uzbek through the server's /api/tts, which calls Azure (uz-UZ-MadinaNeural)
 * when a key is set. Until the server says it is not configured, this provider
 * counts as supported; after that it steps aside and the speech service falls
 * back to the browser's voice with a notice.
 */
export class UzbekSpeechProvider implements SpeechProvider {
  readonly id = "uzbek-cloud";
  private configured: boolean | null = null;
  private status: SpeechStatus = "idle";
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private settle: ((result: SpeechResult) => void) | null = null;
  private generation = 0;

  isSupported() {
    return this.configured !== false && typeof Audio !== "undefined" && typeof fetch !== "undefined";
  }

  getStatus() {
    return this.status;
  }

  async speak(text: string, options: SpeakOptions): Promise<SpeechResult> {
    this.stop();
    const generation = ++this.generation;
    this.status = "loading";
    let response: Response;
    try {
      response = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, rate: options.rate }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      this.status = "error";
      throw new Error("Uzbek voice request failed");
    }
    if (response.status === 503) this.configured = false;
    if (!response.ok) {
      this.status = "error";
      throw new Error(`Uzbek voice answered ${response.status}`);
    }
    this.configured = true;
    const blob = await response.blob();
    if (generation !== this.generation) return "stopped";

    return new Promise<SpeechResult>((resolve, reject) => {
      this.settle = resolve;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = options.volume;
      this.audio = audio;
      this.objectUrl = url;
      const fail = () => {
        this.release();
        this.status = "error";
        this.settle = null;
        reject(new Error("Audio playback failed"));
      };
      audio.onended = () => {
        this.release();
        this.status = "idle";
        const settle = this.settle;
        this.settle = null;
        settle?.("finished");
      };
      audio.onerror = fail;
      this.status = "speaking";
      audio.play().catch(fail);
    });
  }

  stop() {
    this.generation += 1;
    this.release();
    this.status = "idle";
    const settle = this.settle;
    this.settle = null;
    settle?.("stopped");
  }

  private release() {
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
