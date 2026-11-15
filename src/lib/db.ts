import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * One small database interface, two engines behind it:
 *  - DATABASE_URL set  -> a real Postgres server (Supabase, Neon, ...) via `pg`.
 *  - otherwise         -> PGlite, Postgres compiled to run inside this process,
 *                         stored in the .data/ folder. No setup needed.
 * Both speak the same SQL, so there is exactly one schema and one set of queries.
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  /** Run several statements as one all-or-nothing unit. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  mode: "postgres" | "local" | "memory";
}

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS study_planner;

CREATE TABLE IF NOT EXISTS study_planner.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS study_planner.subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  color TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  confidence INT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_planner.timetable_entries (
  id TEXT PRIMARY KEY,
  day INT NOT NULL CHECK (day BETWEEN 0 AND 6),
  type TEXT NOT NULL CHECK (type IN ('class','break','free','commitment')),
  title TEXT NOT NULL,
  subject_id TEXT REFERENCES study_planner.subjects(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS study_planner.overrides (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('off','busy','free')),
  start_time TEXT,
  end_time TEXT,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS study_planner.exams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES study_planner.subjects(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT '',
  confidence INT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  preparedness INT NOT NULL DEFAULT 3 CHECK (preparedness BETWEEN 1 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_planner.exam_dates (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES study_planner.exams(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT,
  label TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS study_planner.exam_topics (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES study_planner.exams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS study_planner.sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES study_planner.subjects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  task TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  kind TEXT NOT NULL DEFAULT 'study' CHECK (kind IN ('revision','homework','practice','study')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','partial','missed')),
  exam_id TEXT REFERENCES study_planner.exams(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES study_planner.exam_topics(id) ON DELETE SET NULL,
  origin TEXT NOT NULL DEFAULT 'planner',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS sessions_date_idx ON study_planner.sessions(date);

CREATE TABLE IF NOT EXISTS study_planner.logs (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES study_planner.subjects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  minutes INT NOT NULL CHECK (minutes BETWEEN 1 AND 960),
  description TEXT NOT NULL DEFAULT '',
  session_id TEXT REFERENCES study_planner.sessions(id) ON DELETE SET NULL,
  completed_task BOOLEAN,
  productivity INT CHECK (productivity BETWEEN 1 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logs_date_idx ON study_planner.logs(date);

CREATE TABLE IF NOT EXISTS study_planner.plan_changes (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  undo JSONB,
  undone BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS study_planner.chat_messages (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'
);
`;

async function openPostgres(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 3,
    ssl: local ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL === "verify" },
  });
  const db: Database = {
    mode: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            return (await client.query(sql, params)).rows as R[];
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
  // Run the schema statement by statement: pooled connections reject batches.
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  return db;
}

async function openPglite(): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  let mode: Database["mode"] = "local";
  let pg: InstanceType<typeof PGlite>;
  try {
    const dir = path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    pg = new PGlite(dir);
    await pg.waitReady;
  } catch (err) {
    // Read-only file system (e.g. serverless hosting): keep working in memory
    // and let the UI warn that nothing will survive a restart.
    console.warn("[db] Could not open the local database folder, using memory only:", err);
    mode = "memory";
    pg = new PGlite();
    await pg.waitReady;
  }
  await pg.exec(SCHEMA);
  // PGlite is a single connection, so transactions must not interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };
  return {
    mode,
    query<T>(sql: string, params: unknown[] = []) {
      return serial(async () => (await pg.query(sql, params)).rows as T[]);
    },
    transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return serial(() =>
        pg.transaction(async (tx) =>
          fn({
            async query<R>(sql: string, params: unknown[] = []) {
              return (await tx.query(sql, params)).rows as R[];
            },
          }),
        ),
      ) as Promise<T>;
    },
  };
}

const globalStore = globalThis as unknown as { __studyDb?: Promise<Database> };

/** The shared database handle. Opened once per server process. */
export function getDb(): Promise<Database> {
  if (!globalStore.__studyDb) {
    const url = process.env.DATABASE_URL?.trim();
    const opening = url ? openPostgres(url) : openPglite();
    globalStore.__studyDb = opening;
    opening.catch(() => {
      globalStore.__studyDb = undefined;
    });
  }
  return globalStore.__studyDb;
}
