import { describe, expect, it } from "vitest";
import { keyProblem, setting } from "@/lib/env";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { assistantModelConfig, assistantModelNote } from "@/lib/ai/config";

describe("settings pasted into a hosting dashboard", () => {
  it("ignores stray spaces, line breaks and quotes", () => {
    expect(setting("X", { X: '  "abc"\n' })).toBe("abc");
    expect(setting("X", { X: "'abc'" })).toBe("abc");
    expect(setting("X", { X: "   " })).toBeUndefined();
    expect(setting("X", {})).toBeUndefined();
  });

  it("reduces a pasted API address to the project address", () => {
    const env = { NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" };
    for (const url of ["https://abc.supabase.co", "https://abc.supabase.co/", " https://abc.supabase.co/rest/v1/ ", '"https://abc.supabase.co/auth/v1"']) {
      expect(getSupabaseConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: url })).toEqual({ url: "https://abc.supabase.co", anonKey: "public-key" });
    }
  });

  it("still treats missing or placeholder values as not configured", () => {
    expect(getSupabaseConfig({})).toBeNull();
    expect(getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "not-set", NEXT_PUBLIC_SUPABASE_ANON_KEY: "not-set" })).toBeNull();
    expect(getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })).toBeNull();
  });

  it("reads a quoted AI key", () => {
    expect(assistantModelConfig({ ANTHROPIC_API_KEY: `"${"x".repeat(40)}"` })?.apiKey).toBe("x".repeat(40));
  });
});

describe("pasted key problems", () => {
  it("names the mistake without repeating the key", () => {
    const good = "sb_publishable_" + "a".repeat(30);
    expect(keyProblem(good)).toBeNull();
    expect(keyProblem(undefined)).toBe("missing");
    expect(keyProblem("sb_secret_abcd••••••••")).toMatch(/masked/);
    expect(keyProblem(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${good}`)).toMatch(/variable name/);
    expect(keyProblem(good.replace("a", "а"))).toMatch(/non-Latin/);
  });
});

describe("why the assistant AI is off", () => {
  it("names the cause without repeating a value", () => {
    const key = "k".repeat(40);
    expect(assistantModelNote({ ANTHROPIC_API_KEY: key })).toBeNull();
    expect(assistantModelNote({})).toMatch(/not set/);
    expect(assistantModelNote({ ANTHROPIC_KEY: key })).toMatch(/Similar names found: ANTHROPIC_KEY$/);
    expect(assistantModelNote({ ANTHROPIC_API_KEY: "short" })).toMatch(/too short/);
    expect(assistantModelNote({ ANTHROPIC_API_KEY: `ANTHROPIC_API_KEY=${key}` })).toMatch(/variable name/);
    expect(assistantModelNote({ ANTHROPIC_API_KEY: key, ASSISTANT_PROVIDER: "none" })).toMatch(/switched off/);
    expect(assistantModelNote({ ANTHROPIC_API_KEY: key, ASSISTANT_PROVIDER: "openai" })).toMatch(/must be anthropic/);
    for (const env of [{ ANTHROPIC_KEY: key }, { ANTHROPIC_API_KEY: `X=${key}` }]) expect(assistantModelNote(env)).not.toContain(key);
  });
});
