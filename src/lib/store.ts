import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, type Queryable, type Row } from "./db";
import { plan } from "./engine";
import { sampleData } from "./sample";
import { nowIn } from "./time";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type ChatMessage,
  type Exam,
  type Override,
  type PlanChange,
  type PlanInput,
  type Session,
  type Settings,
  type StudyLog,
  type Subject,
  type TimetableEntry,
} from "./types";

/** Reads and writes for every table. Callers pass a transaction when they need one. */

export const newId = () => randomUUID();
const T = "study_planner";
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

export function aiStatus() {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim()),
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
  };
}

const toSession = (r: Row): Session => ({
  id: r.id as string,
  subjectId: r.subject_id as string,
  date: r.date as string,
  start: r.start_time as string,
  end: r.end_time as string,
  task: r.task as string,
  method: r.method as string,
  priority: r.priority as Session["priority"],
  kind: r.kind as Session["kind"],
  status: r.status as Session["status"],
  examId: (r.exam_id as string) ?? null,
  topicId: (r.topic_id as string) ?? null,
  origin: r.origin as Session["origin"],
  pinned: Boolean(r.pinned),
  notes: r.notes as string,
});

export async function getSetting<T>(q: Queryable, key: string): Promise<T | null> {
  const rows = await q.query<{ value: T }>(`SELECT value FROM ${T}.settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(q: Queryable, key: string, value: unknown) {
  await q.query(
    `INSERT INTO ${T}.settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

export async function insertSubject(q: Queryable, s: Subject) {
  await q.query(`INSERT INTO ${T}.subjects (id, name, color, priority, confidence, archived) VALUES ($1,$2,$3,$4,$5,$6)`, [
    s.id, s.name, s.color, s.priority, s.confidence, s.archived,
  ]);
}

export async function insertEntry(q: Queryable, e: TimetableEntry) {
  await q.query(
    `INSERT INTO ${T}.timetable_entries (id, day, type, title, subject_id, start_time, end_time, location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.id, e.day, e.type, e.title, e.subjectId, e.start, e.end, e.location],
  );
}

export async function insertOverride(q: Queryable, o: Override) {
  await q.query(`INSERT INTO ${T}.overrides (id, date, type, start_time, end_time, note) VALUES ($1,$2,$3,$4,$5,$6)`, [
    o.id, o.date, o.type, o.start, o.end, o.note,
  ]);
}

export async function insertExam(q: Queryable, e: Exam) {
  await q.query(`INSERT INTO ${T}.exams (id, name, subject_id, format, confidence, preparedness, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    e.id, e.name, e.subjectId, e.format, e.confidence, e.preparedness, e.notes,
  ]);
  for (const d of e.dates) {
    await q.query(`INSERT INTO ${T}.exam_dates (id, exam_id, date, time, label) VALUES ($1,$2,$3,$4,$5)`, [d.id, e.id, d.date, d.time, d.label]);
  }
  let i = 0;
  for (const t of e.topics) {
    await q.query(`INSERT INTO ${T}.exam_topics (id, exam_id, name, done, position) VALUES ($1,$2,$3,$4,$5)`, [t.id, e.id, t.name, t.done, i++]);
  }
}

export async function insertSession(q: Queryable, s: Session) {
  await q.query(
    `INSERT INTO ${T}.sessions (id, subject_id, date, start_time, end_time, task, method, priority, kind, status, exam_id, topic_id, origin, pinned, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [s.id, s.subjectId, s.date, s.start, s.end, s.task, s.method, s.priority, s.kind, s.status, s.examId, s.topicId, s.origin, s.pinned, s.notes],
  );
}

export async function insertLog(q: Queryable, l: StudyLog) {
  await q.query(
    `INSERT INTO ${T}.logs (id, subject_id, date, start_time, end_time, minutes, description, session_id, completed_task, productivity, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [l.id, l.subjectId, l.date, l.start, l.end, l.minutes, l.description, l.sessionId, l.completedTask, l.productivity, l.notes],
  );
}

export async function wipe(q: Queryable) {
  for (const t of ["logs", "sessions", "exam_topics", "exam_dates", "exams", "overrides", "timetable_entries", "subjects", "plan_changes", "chat_messages"]) {
    await q.query(`DELETE FROM ${T}.${t}`);
  }
  await q.query(`DELETE FROM ${T}.settings WHERE key <> 'initialised'`);
}

/** Write a complete data set (sample data or a restored backup). */
export async function writeAll(q: Queryable, data: Pick<PlanInput, "subjects" | "timetable" | "overrides" | "exams" | "sessions" | "logs" | "settings">) {
  for (const s of data.subjects) await insertSubject(q, s);
  for (const e of data.timetable) await insertEntry(q, e);
  for (const o of data.overrides) await insertOverride(q, o);
  for (const e of data.exams) await insertExam(q, e);
  for (const s of data.sessions) await insertSession(q, s);
  for (const l of data.logs) await insertLog(q, l);
  await setSetting(q, "prefs", data.settings);
}

export async function seedSample(q: Queryable, tz: string | null) {
  const now = nowIn(tz);
  const data = sampleData(now.date, now.time);
  const first = plan(data, "regenerate");
  data.sessions.push(
    ...first.add.map((a): Session => ({ ...a, id: newId(), status: "planned", origin: "planner", pinned: false, notes: "" })),
  );
  await writeAll(q, data);
  await setSetting(q, "sample", true);
}

/** The snapshot the planner and Claude work from. Always read fresh from the database. */
export async function loadInput(q: Queryable, tz: string | null): Promise<PlanInput> {
  const now = nowIn(tz);
  const [subjects, entries, overrides, exams, dates, topics, sessions, logs, prefs] = await Promise.all([
    q.query(`SELECT * FROM ${T}.subjects ORDER BY created_at, name`),
    q.query(`SELECT * FROM ${T}.timetable_entries ORDER BY day, start_time`),
    q.query(`SELECT * FROM ${T}.overrides ORDER BY date, start_time`),
    q.query(`SELECT * FROM ${T}.exams ORDER BY created_at`),
    q.query(`SELECT * FROM ${T}.exam_dates ORDER BY date, time`),
    q.query(`SELECT * FROM ${T}.exam_topics ORDER BY position`),
    q.query(`SELECT * FROM ${T}.sessions ORDER BY date, start_time`),
    q.query(`SELECT * FROM ${T}.logs ORDER BY date, start_time NULLS LAST, created_at`),
    getSetting<Partial<Settings>>(q, "prefs"),
  ]);
  return {
    today: now.date,
    nowTime: now.time,
    settings: { ...DEFAULT_SETTINGS, ...(prefs ?? {}) },
    subjects: subjects.map((r) => ({
      id: r.id as string, name: r.name as string, color: r.color as string, priority: Number(r.priority), confidence: Number(r.confidence), archived: Boolean(r.archived),
    })),
    timetable: entries.map((r) => ({
      id: r.id as string, day: Number(r.day), type: r.type as TimetableEntry["type"], title: r.title as string, subjectId: (r.subject_id as string) ?? null,
      start: r.start_time as string, end: r.end_time as string, location: r.location as string,
    })),
    overrides: overrides.map((r) => ({
      id: r.id as string, date: r.date as string, type: r.type as Override["type"], start: (r.start_time as string) ?? null, end: (r.end_time as string) ?? null, note: r.note as string,
    })),
    exams: exams.map((r) => ({
      id: r.id as string, name: r.name as string, subjectId: r.subject_id as string, format: r.format as string, confidence: Number(r.confidence),
      preparedness: Number(r.preparedness), notes: r.notes as string,
      dates: dates.filter((d) => d.exam_id === r.id).map((d) => ({ id: d.id as string, date: d.date as string, time: (d.time as string) ?? null, label: d.label as string })),
      topics: topics.filter((t) => t.exam_id === r.id).map((t) => ({ id: t.id as string, name: t.name as string, done: Boolean(t.done) })),
    })),
    sessions: sessions.map(toSession),
    logs: logs.map((r) => ({
      id: r.id as string, subjectId: r.subject_id as string, date: r.date as string, start: (r.start_time as string) ?? null, end: (r.end_time as string) ?? null,
      minutes: Number(r.minutes), description: r.description as string, sessionId: (r.session_id as string) ?? null,
      completedTask: r.completed_task === null || r.completed_task === undefined ? null : Boolean(r.completed_task),
      productivity: r.productivity === null || r.productivity === undefined ? null : Number(r.productivity), notes: r.notes as string,
    })),
  };
}

const toChange = (r: Row): PlanChange => ({
  id: r.id as string,
  createdAt: iso(r.created_at),
  trigger: r.trigger as string,
  source: r.source as PlanChange["source"],
  summary: r.summary as string,
  items: (r.items as string[]) ?? [],
  undoable: r.undo !== null && r.undo !== undefined,
  undone: Boolean(r.undone),
});

export async function loadState(tz: string | null): Promise<AppState> {
  const db = await getDb();
  if (!(await getSetting(db, "initialised"))) {
    await db.transaction(async (tx) => {
      if (await getSetting(tx, "initialised")) return;
      await seedSample(tx, tz);
      await setSetting(tx, "initialised", true);
    });
  }
  const [input, changes, insights, sample] = await Promise.all([
    loadInput(db, tz),
    db.query(`SELECT * FROM ${T}.plan_changes ORDER BY created_at DESC LIMIT 30`),
    getSetting<AppState["insights"]>(db, "insights"),
    getSetting<boolean>(db, "sample"),
  ]);
  return {
    today: input.today,
    nowTime: input.nowTime,
    subjects: input.subjects,
    timetable: input.timetable,
    overrides: input.overrides,
    exams: input.exams,
    sessions: input.sessions,
    logs: input.logs,
    settings: input.settings,
    changes: changes.map(toChange),
    insights,
    ai: aiStatus(),
    storage: db.mode,
    sample: Boolean(sample),
  };
}

export async function recordChange(
  q: Queryable,
  c: { trigger: string; source: PlanChange["source"]; summary: string; items: string[]; undo: unknown },
): Promise<PlanChange> {
  const id = newId();
  const rows = await q.query(
    `INSERT INTO ${T}.plan_changes (id, trigger, source, summary, items, undo) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING *`,
    [id, c.trigger, c.source, c.summary, JSON.stringify(c.items), c.undo ? JSON.stringify(c.undo) : null],
  );
  return toChange(rows[0]);
}

export async function loadChat(q: Queryable, limit = 60): Promise<ChatMessage[]> {
  const rows = await q.query(`SELECT * FROM (SELECT * FROM ${T}.chat_messages ORDER BY created_at DESC LIMIT $1) t ORDER BY created_at`, [limit]);
  return rows.map((r) => ({
    id: r.id as string, createdAt: iso(r.created_at), role: r.role as ChatMessage["role"], content: r.content as string, actions: (r.actions as string[]) ?? [],
  }));
}

export async function saveChat(q: Queryable, role: ChatMessage["role"], content: string, actions: string[] = []) {
  await q.query(`INSERT INTO ${T}.chat_messages (id, role, content, actions) VALUES ($1,$2,$3,$4::jsonb)`, [newId(), role, content, JSON.stringify(actions)]);
}

export { T as SCHEMA_NAME, toSession };
