// Builds the app once, then starts:
//   :3100  the app connected to the in-memory mock Supabase
//   :3101  the same build with no Supabase configured, to test the honest fallback
// Values set here take priority over any .env.local, at build time as well as at run
// time, so tests never reach a real project.
import { execSync, spawn } from "node:child_process";
import { MOCK_ANTHROPIC_KEY, startMock } from "./mock-supabase.mjs";

const MOCK_PORT = 54399;
const shell = process.platform === "win32";

const connected = {
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "mock-service-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3100",
  // Map lookups go to the mock too: tests never call the public map services.
  PLACE_SEARCH_URL: `http://localhost:${MOCK_PORT}/geo/photon`,
  REVERSE_GEOCODING_URL: `http://localhost:${MOCK_PORT}/geo/reverse`,
  WALKING_ROUTING_URL: `http://localhost:${MOCK_PORT}/geo/foot`,
  // The assistant talks to the mock as well: a real key in .env.local is never used.
  ASSISTANT_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: MOCK_ANTHROPIC_KEY,
  ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}`,
  ASSISTANT_MODEL: "claude-opus-5-5",
};

execSync("npm run build", { stdio: "inherit", shell, env: { ...process.env, ...connected } });
await startMock(MOCK_PORT);

function start(port, env) {
  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    stdio: "inherit",
    shell,
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => {
    if (code) process.exit(code);
  });
}

start(3100, connected);
// Not empty strings: on Windows an empty variable is an absent one, and .env.local would fill it in.
const NOT_SET = "not-set";
start(3101, {
  NEXT_PUBLIC_SUPABASE_URL: NOT_SET,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: NOT_SET,
  SUPABASE_SERVICE_ROLE_KEY: NOT_SET,
  ASSISTANT_PROVIDER: "none",
  ANTHROPIC_API_KEY: NOT_SET,
  ANTHROPIC_BASE_URL: NOT_SET,
  PLACE_SEARCH_URL: connected.PLACE_SEARCH_URL,
  REVERSE_GEOCODING_URL: connected.REVERSE_GEOCODING_URL,
  WALKING_ROUTING_URL: connected.WALKING_ROUTING_URL,
});
