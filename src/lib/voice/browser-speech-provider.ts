import type { SpeakOptions, SpeechProvider, SpeechResult, SpeechStatus } from "./types";

// Some browsers stay silent with no error event, so a speech that never starts counts as a failure.
const START_TIMEOUT_MS = 4000;

/** The operating system's voices, through the Web Speech API. */
export class BrowserSpeechProvider implements SpeechProvider {
  readonly id = "browser";
  private status: SpeechStatus = "idle";
  private settle: ((result: SpeechResult) => void) | null = null;
  private generation = 0;

  isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }

  getStatus() {
    return this.status;
  }

  /** Whether a voice for this language is installed. Voices may load asynchronously. */
  async hasVoiceFor(lang: string): Promise<boolean> {
    if (!this.isSupported()) return false;
    const prefix = lang.split("-")[0].toLowerCase();
    return (await this.loadVoices()).some((voice) => voice.lang.toLowerCase().startsWith(prefix));
  }

  async speak(text: string, options: SpeakOptions): Promise<SpeechResult> {
    this.stop();
    if (!this.isSupported()) throw new Error("Speech synthesis is not supported");
    const generation = ++this.generation;
    const voices = await this.loadVoices();
    if (generation !== this.generation) return "stopped";
    if (voices.length === 0) throw new Error("No system voices are installed");

    const prefix = options.lang.split("-")[0].toLowerCase();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate;
    utterance.volume = options.volume;
    const match = voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix));
    if (match) {
      utterance.voice = match;
      utterance.lang = match.lang;
    }

    this.status = "loading";
    return new Promise<SpeechResult>((resolve, reject) => {
      this.settle = resolve;
      const timer = setTimeout(() => {
        if (generation !== this.generation) return;
        window.speechSynthesis.cancel();
        this.status = "error";
        this.settle = null;
        reject(new Error("Speech did not start"));
      }, START_TIMEOUT_MS);
      utterance.onstart = () => {
        clearTimeout(timer);
        if (generation === this.generation) this.status = "speaking";
      };
      utterance.onend = () => {
        clearTimeout(timer);
        if (generation !== this.generation) return;
        this.status = "idle";
        this.settle = null;
        resolve("finished");
      };
      utterance.onerror = () => {
        clearTimeout(timer);
        if (generation !== this.generation) return;
        this.status = "error";
        this.settle = null;
        reject(new Error("Speech synthesis failed"));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    this.generation += 1;
    if (this.isSupported()) window.speechSynthesis.cancel();
    this.status = "idle";
    const settle = this.settle;
    this.settle = null;
    settle?.("stopped");
  }

  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length > 0) return Promise.resolve(voices);
    return new Promise((resolve) => {
      const finish = () => {
        synth.removeEventListener("voiceschanged", finish);
        clearTimeout(timer);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(finish, 1000);
      synth.addEventListener("voiceschanged", finish);
    });
  }
}
