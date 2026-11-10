// Settings for the CareMate assistant's language model. Everything here is
// server-only: the API key never reaches the browser, the logs or the database.

export type AssistantModelConfig = {
  provider: "anthropic";
  apiKey: string;
  model: string;
  /** Only for tests, which point the assistant at a local mock. */
  baseURL: string | undefined;
};

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Null when no model is set up: the assistant then answers quick questions only. */
export function assistantModelConfig(env: Record<string, string | undefined> = process.env): AssistantModelConfig | null {
  const provider = (env.ASSISTANT_PROVIDER?.trim() || "anthropic").toLowerCase();
  if (provider === "none" || provider !== "anthropic") return null;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  // A placeholder such as "not-set" counts as missing, never as a key.
  if (!apiKey || apiKey.length < 20) return null;
  const baseURL = env.ANTHROPIC_BASE_URL?.trim();
  return {
    provider: "anthropic",
    apiKey,
    model: env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL,
    baseURL: baseURL && /^https?:\/\//.test(baseURL) ? baseURL : undefined,
  };
}
