import { keyProblem, setting } from "@/lib/env";

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
  const provider = (setting("ASSISTANT_PROVIDER", env) || "anthropic").toLowerCase();
  if (provider === "none" || provider !== "anthropic") return null;
  const apiKey = setting("ANTHROPIC_API_KEY", env);
  // A placeholder such as "not-set" counts as missing, never as a key.
  if (!apiKey || apiKey.length < 20 || keyProblem(apiKey)) return null;
  const baseURL = setting("ANTHROPIC_BASE_URL", env);
  return {
    provider: "anthropic",
    apiKey,
    model: setting("ASSISTANT_MODEL", env) || DEFAULT_MODEL,
    baseURL: baseURL && /^https?:\/\//.test(baseURL) ? baseURL : undefined,
  };
}

/**
 * Why free questions are off, for the status page. Says only what is wrong and
 * which setting names exist; never a value.
 */
export function assistantModelNote(env: Record<string, string | undefined> = process.env): string | null {
  if (assistantModelConfig(env)) return null;
  const provider = (setting("ASSISTANT_PROVIDER", env) || "anthropic").toLowerCase();
  if (provider === "none") return "switched off: ASSISTANT_PROVIDER is none";
  if (provider !== "anthropic") return "ASSISTANT_PROVIDER must be anthropic or be removed";
  const key = setting("ANTHROPIC_API_KEY", env);
  if (key) return keyProblem(key) ?? "ANTHROPIC_API_KEY is too short to be a key: paste the whole key";
  // A key saved under a slightly different name is the usual cause.
  const similar = Object.keys(env).filter((name) => /^[A-Z][A-Z0-9_]{2,40}$/.test(name) && /ANTHROPIC|CLAUDE|ASSISTANT/.test(name));
  return similar.length
    ? `ANTHROPIC_API_KEY is not set for this deployment. Similar names found: ${similar.join(", ")}`
    : "ANTHROPIC_API_KEY is not set for this deployment: add it for Production, then redeploy";
}
