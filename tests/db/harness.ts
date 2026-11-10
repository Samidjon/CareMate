import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Runs the real migrations on a real Postgres (PGlite), with a minimal stand-in
 * for what Supabase provides: the auth schema and the three API roles. Queries
 * run as those roles, exactly as PostgREST would run them, so RLS applies.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.sub', true), '')::uuid;
  $$;
  grant execute on function auth.uid() to public;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const root = path.resolve(__dirname, "../..");

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = path.join(root, "supabase", "migrations");
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(path.join(root, "supabase", "seed.sql"), "utf8"));
  return db;
}

export type Role = "anon" | "authenticated" | "service_role";

/** Runs one statement as a user, rolling nothing back. Throws what Postgres throws. */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
  role: Role = user ? "authenticated" : "anon",
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.sub', $1, true)`, [user ?? ""]);
    await tx.exec(`set local role ${role}`);
    const result = await tx.query<T>(sql, params);
    return result.rows;
  });
}

export async function createUser(db: PGlite, metadata: Record<string, unknown> = {}) {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (raw_user_meta_data) values ($1) returning id`,
    [JSON.stringify(metadata)],
  );
  return result.rows[0].id;
}
