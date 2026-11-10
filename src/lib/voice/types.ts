export type SpeechStatus = "idle" | "loading" | "speaking" | "error";

export type SpeakOptions = {
  /** 1 is normal speed. */
  rate: number;
  /** 0 to 1. */
  volume: number;
  /** BCP 47 language of the text. */
  lang: string;
};

export type SpeechResult = "finished" | "stopped";

export interface SpeechProvider {
  readonly id: string;
  /** Resolves when speech ends or is stopped; rejects if nothing could be spoken. */
  speak(text: string, options: SpeakOptions): Promise<SpeechResult>;
  stop(): void;
  isSupported(): boolean;
  getStatus(): SpeechStatus;
}
