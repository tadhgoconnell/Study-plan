import "server-only";
import { z } from "zod";
import { getDb, type Queryable } from "./db";
import { placementProblem, plan, type PlanMode, type Proposal } from "./engine";
import { SUBJECT_COLORS } from "./sample";
import {
  SCHEMA_NAME as T,
  getSetting,
  insertEntry,
  insertExam,
  insertLog,
  insertOverride,
  insertSession,
  insertSubject,
  loadInput,
  newId,
  recordChange,
  seedSample,
  setSetting,
  wipe,
  writeAll,
} from "./store";
import { DATE_RE, TIME_RE, fmtDate, fromMin, isValidDate, toMin } from "./time";
import { DEFAULT_SETTINGS, type Origin, type PlanChange, type PlanInput, type Session } from "./types";

/**
 * Every change to the student's data goes through this file, whether it comes
 * from a button in the UI or from a tool call made by Claude. Each action
 * validates its input, saves inside a transaction, and then lets the planner
 * adapt the upcoming schedule.
 */

/** A problem the user can fix. Shown to them as-is. */
export class UserError extends Error {}

const date = z.string().regex(DATE_RE, "Use a date like 2026-03-14").refine(isValidDate, "That date does not exist");
const time = z.string().regex(TIME_RE, "Use a 24-hour time like 16:30");
const text = (max: number) => z.string().trim().max(max);
const scale = z.coerce.number().int().min(1).max(5);

export type Actor = "manual" | "assistant";
export interface ActionResult {
  change?: PlanChange | null;
  message?: string;
  data?: unknown;
}

async function must<R>(q: Queryable, sql: string, params: unknown[], what: string): Promise<R> {
  const rows = await q.query<R>(sql, params);
  if (!rows[0]) throw new UserError(`That ${what} no longer exists. Refresh and try again.`);
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Adaptive planning                                                   */
/* ------------------------------------------------------------------ */

interface UndoData {
  removed: Session[];
  addedIds: string[];
}

export async function adapt(
  tz: string | null,
  trigger: string,
  opts: { mode?: PlanMode; proposals?: Proposal[]; source?: Origin; intro?: string; extraNotes?: string[] } = {},
): Promise<PlanChange | null> {
  const db = await getDb();
  const mode = opts.mode ?? "rebalance";
  return db.transaction(async (tx) => {
    const input = await loadInput(tx, tz);
    const result = plan(input, mode, opts.proposals ?? []);
    if (!result.add.length && !result.remove.length && mode === "rebalance") return null;
    // Only sessions that are still "planned" are ever deleted: history is safe by construction.
    for (const s of result.remove) await tx.query(`DELETE FROM ${T}.sessions WHERE id = $1 AND status = 'planned'`, [s.id]);
    const addedIds: string[] = [];
    for (const a of result.add) {
      const id = newId();
      addedIds.push(id);
      await insertSession(tx, { ...a, id, status: "planned", origin: opts.source ?? "planner", pinned: false, notes: "" });
    }
    const undo: UndoData = { removed: result.remove, addedIds };
    return recordChange(tx, {
      trigger,
      source: opts.source ?? "planner",
      summary: opts.intro ? `${opts.intro} ${result.summary}` : result.summary,
      items: [...(opts.extraNotes ?? []), ...result.notes],
      undo,
    });
  });
}

/** Called when the app opens: yesterday's untouched sessions become "missed", then the plan adapts. */
export async function sync(tz: string | null): Promise<ActionResult> {
  const db = await getDb();
  const input = await loadInput(db, tz);
  const missed = await db.query<{ id: string }>(
    `UPDATE ${T}.sessions SET status = 'missed', updated_at = now() WHERE status = 'planned' AND date < $1 RETURNING id`,
    [input.today],
  );
  const change = await adapt(tz, missed.length ? `${missed.length} planned session${missed.length > 1 ? "s were" : " was"} missed` : "Daily check-in");
  return { change };
}

async function undoChange(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const row = await must<{ id: string; undo: UndoData | null; undone: boolean }>(tx, `SELECT id, undo, undone FROM ${T}.plan_changes WHERE id = $1`, [id], "change");
    const latest = await tx.query<{ id: string }>(`SELECT id FROM ${T}.plan_changes WHERE undone = FALSE AND undo IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
    if (row.undone || !row.undo) throw new UserError("That change has already been undone.");
    if (latest[0]?.id !== id) throw new UserError("Only the most recent plan change can be undone.");
    for (const sid of row.undo.addedIds) await tx.query(`DELETE FROM ${T}.sessions WHERE id = $1 AND status = 'planned'`, [sid]);
    const input = await loadInput(tx, tz);
    for (const s of row.undo.removed) {
      if (input.sessions.some((x) => x.id === s.id) || !input.subjects.some((x) => x.id === s.subjectId)) continue;
      if (placementProblem(input, s)) continue;
      const exam = input.exams.find((e) => e.id === s.examId);
      await insertSession(tx, { ...s, examId: exam?.id ?? null, topicId: exam?.topics.some((t) => t.id === s.topicId) ? s.topicId : null });
      input.sessions.push(s);
    }
    await tx.query(`UPDATE ${T}.plan_changes SET undone = TRUE WHERE id = $1`, [id]);
  });
  return { message: "Change undone. Your previous sessions are back." };
}

/* ------------------------------------------------------------------ */
/* Subjects                                                            */
/* ------------------------------------------------------------------ */

const subjectSchema = z.object({
  id: z.string().optional(),
  name: text(60).min(1, "Give the subject a name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  confidence: scale.default(3),
});

export async function saveSubject(tz: string | null, raw: unknown): Promise<ActionResult> {
  const s = subjectSchema.parse(raw);
  const db = await getDb();
  const all = await db.query<{ id: string; name: string; archived: boolean }>(`SELECT id, name, archived FROM ${T}.subjects`);
  const twin = all.find((x) => x.name.toLowerCase() === s.name.toLowerCase() && x.id !== s.id);
  if (twin && !twin.archived) throw new UserError(`You already have a subject called ${twin.name}.`);
  let id = s.id;
  if (id) {
    await must(db, `UPDATE ${T}.subjects SET name=$2, color=COALESCE($3,color), priority=$4, confidence=$5 WHERE id=$1 RETURNING id`, [id, s.name, s.color ?? null, s.priority, s.confidence], "subject");
  } else if (twin) {
    id = twin.id;
    await db.query(`UPDATE ${T}.subjects SET archived=FALSE, priority=$2, confidence=$3 WHERE id=$1`, [id, s.priority, s.confidence]);
  } else {
    id = newId();
    await insertSubject(db, { id, name: s.name, color: s.color ?? SUBJECT_COLORS[all.length % SUBJECT_COLORS.length], priority: s.priority, confidence: s.confidence, archived: false });
  }
  return { change: await adapt(tz, s.id ? `${s.name} updated` : `New subject: ${s.name}`), data: { id } };
}

async function deleteSubject(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  const db = await getDb();
  const subject = await must<{ name: string }>(db, `SELECT name FROM ${T}.subjects WHERE id=$1`, [id], "subject");
  const message = await db.transaction(async (tx) => {
    const history = await tx.query(`SELECT 1 FROM ${T}.logs WHERE subject_id=$1 LIMIT 1`, [id]);
    await tx.query(`DELETE FROM ${T}.sessions WHERE subject_id=$1 AND status='planned'`, [id]);
    if (history.length) {
      // Keep the study history: hide the subject instead of erasing what was done.
      await tx.query(`UPDATE ${T}.subjects SET archived=TRUE WHERE id=$1`, [id]);
      await tx.query(`DELETE FROM ${T}.exams WHERE subject_id=$1`, [id]);
      return `${subject.name} was archived. Your logged study time for it is kept.`;
    }
    await tx.query(`DELETE FROM ${T}.subjects WHERE id=$1`, [id]);
    return `${subject.name} was deleted.`;
  });
  return { change: await adapt(tz, `${subject.name} removed`), message };
}

/** Find a subject by id or name; create it when a name is new. */
async function resolveSubject(q: Queryable, ref: string, create: boolean): Promise<string> {
  const all = await q.query<{ id: string; name: string; archived: boolean }>(`SELECT id, name, archived FROM ${T}.subjects`);
  const key = ref.trim().toLowerCase();
  const hit = all.find((s) => s.id === ref) ?? all.find((s) => s.name.toLowerCase() === key) ?? all.find((s) => !s.archived && (s.name.toLowerCase().startsWith(key) || key.startsWith(s.name.toLowerCase())));
  if (hit) {
    if (hit.archived) await q.query(`UPDATE ${T}.subjects SET archived=FALSE WHERE id=$1`, [hit.id]);
    return hit.id;
  }
  if (!create || !key) throw new UserError(`There is no subject called "${ref}". Subjects: ${all.filter((s) => !s.archived).map((s) => s.name).join(", ") || "none yet"}.`);
  const id = newId();
  await insertSubject(q, { id, name: ref.trim().slice(0, 60), color: SUBJECT_COLORS[all.length % SUBJECT_COLORS.length], priority: 2, confidence: 3, archived: false });
  return id;
}
export { resolveSubject };

/* ------------------------------------------------------------------ */
/* Timetable and availability                                          */
/* ------------------------------------------------------------------ */

const entrySchema = z
  .object({
    id: z.string().optional(),
    day: z.coerce.number().int().min(0).max(6),
    type: z.enum(["class", "break", "free", "commitment"]),
    title: text(80).default(""),
    subjectId: z.string().nullish(),
    subject: text(60).optional(),
    start: time,
    end: time,
    location: text(80).default(""),
  })
  .refine((e) => e.start < e.end, "The end time must be after the start time");

async function writeEntry(q: Queryable, e: z.infer<typeof entrySchema>) {
  let subjectId = e.type === "class" ? (e.subjectId ?? null) : null;
  if (e.type === "class" && !subjectId && (e.subject || e.title)) subjectId = await resolveSubject(q, e.subject || e.title, true);
  const subjectName = subjectId ? (await q.query<{ name: string }>(`SELECT name FROM ${T}.subjects WHERE id=$1`, [subjectId]))[0]?.name : null;
  const title = e.title || subjectName || { class: "Class", break: "Break", free: "Free period", commitment: "Commitment" }[e.type];
  if (e.id) {
    await must(q, `UPDATE ${T}.timetable_entries SET day=$2,type=$3,title=$4,subject_id=$5,start_time=$6,end_time=$7,location=$8 WHERE id=$1 RETURNING id`, [e.id, e.day, e.type, title, subjectId, e.start, e.end, e.location], "timetable entry");
  } else {
    await insertEntry(q, { id: newId(), day: e.day, type: e.type, title, subjectId, start: e.start, end: e.end, location: e.location });
  }
}

export async function saveEntry(tz: string | null, raw: unknown): Promise<ActionResult> {
  const e = entrySchema.parse(raw);
  const db = await getDb();
  await db.transaction((tx) => writeEntry(tx, e));
  return { change: await adapt(tz, "Timetable changed") };
}

async function deleteEntry(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  await (await getDb()).query(`DELETE FROM ${T}.timetable_entries WHERE id=$1`, [id]);
  return { change: await adapt(tz, "Timetable changed") };
}

async function importTimetable(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { entries, replace } = z.object({ entries: z.array(entrySchema).min(1).max(200), replace: z.boolean().default(false) }).parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (replace) await tx.query(`DELETE FROM ${T}.timetable_entries`);
    for (const e of entries) await writeEntry(tx, { ...e, id: undefined });
  });
  return { change: await adapt(tz, "Timetable imported"), message: `Imported ${entries.length} timetable entries.` };
}

const overrideSchema = z
  .object({
    date,
    type: z.enum(["off", "busy", "free"]),
    start: time.nullish(),
    end: time.nullish(),
    note: text(120).default(""),
  })
  .refine((o) => o.type === "off" || (o.start && o.end && o.start < o.end), "Give a start and an end time, with the end after the start");

export async function saveOverride(tz: string | null, raw: unknown): Promise<ActionResult> {
  const o = overrideSchema.parse(raw);
  const db = await getDb();
  if (o.type === "off") await db.query(`DELETE FROM ${T}.overrides WHERE date=$1 AND type='off'`, [o.date]);
  await insertOverride(db, { id: newId(), date: o.date, type: o.type, start: o.type === "off" ? null : o.start!, end: o.type === "off" ? null : o.end!, note: o.note });
  const label = { off: "Day off", busy: "Busy time", free: "Extra free time" }[o.type];
  return { change: await adapt(tz, `${label} on ${fmtDate(o.date)}`) };
}

export async function deleteOverride(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  await (await getDb()).query(`DELETE FROM ${T}.overrides WHERE id=$1`, [id]);
  return { change: await adapt(tz, "Availability changed") };
}

/* ------------------------------------------------------------------ */
/* Exams                                                               */
/* ------------------------------------------------------------------ */

const examSchema = z.object({
  id: z.string().optional(),
  name: text(100).min(1, "Give the exam a name"),
  subjectId: z.string().optional(),
  subject: text(60).optional(),
  format: text(200).default(""),
  confidence: scale.default(3),
  preparedness: scale.default(3),
  notes: text(1000).default(""),
  dates: z.array(z.object({ date, time: time.nullish(), label: text(60).default("") })).min(1, "Add at least one exam date").max(10),
  topics: z.array(z.object({ id: z.string().optional(), name: text(100).min(1), done: z.boolean().default(false) })).max(40).default([]),
});

export async function saveExam(tz: string | null, raw: unknown): Promise<ActionResult> {
  const e = examSchema.parse(raw);
  const db = await getDb();
  const id = e.id ?? newId();
  await db.transaction(async (tx) => {
    const subjectId = e.subjectId ?? (await resolveSubject(tx, e.subject ?? "", true));
    await must(tx, `SELECT id FROM ${T}.subjects WHERE id=$1`, [subjectId], "subject");
    if (e.id) {
      await must(tx, `UPDATE ${T}.exams SET name=$2,subject_id=$3,format=$4,confidence=$5,preparedness=$6,notes=$7 WHERE id=$1 RETURNING id`, [id, e.name, subjectId, e.format, e.confidence, e.preparedness, e.notes], "exam");
      await tx.query(`DELETE FROM ${T}.exam_dates WHERE exam_id=$1`, [id]);
      // Topics keep their ids so sessions already planned for them stay linked.
      const keep = e.topics.map((t) => t.id).filter(Boolean) as string[];
      const existing = await tx.query<{ id: string }>(`SELECT id FROM ${T}.exam_topics WHERE exam_id=$1`, [id]);
      for (const row of existing) if (!keep.includes(row.id)) await tx.query(`DELETE FROM ${T}.exam_topics WHERE id=$1`, [row.id]);
      let i = 0;
      for (const t of e.topics) {
        if (t.id && existing.some((x) => x.id === t.id)) await tx.query(`UPDATE ${T}.exam_topics SET name=$2, done=$3, position=$4 WHERE id=$1`, [t.id, t.name, t.done, i]);
        else await tx.query(`INSERT INTO ${T}.exam_topics (id, exam_id, name, done, position) VALUES ($1,$2,$3,$4,$5)`, [newId(), id, t.name, t.done, i]);
        i++;
      }
      for (const d of e.dates) await tx.query(`INSERT INTO ${T}.exam_dates (id, exam_id, date, time, label) VALUES ($1,$2,$3,$4,$5)`, [newId(), id, d.date, d.time ?? null, d.label]);
    } else {
      await insertExam(tx, {
        id, name: e.name, subjectId, format: e.format, confidence: e.confidence, preparedness: e.preparedness, notes: e.notes,
        dates: e.dates.map((d) => ({ id: newId(), date: d.date, time: d.time ?? null, label: d.label })),
        topics: e.topics.map((t) => ({ id: newId(), name: t.name, done: t.done })),
      });
    }
  });
  return { change: await adapt(tz, e.id ? `${e.name} updated` : `New exam: ${e.name}`), data: { id } };
}

export async function deleteExam(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  const db = await getDb();
  const exam = await must<{ name: string }>(db, `SELECT name FROM ${T}.exams WHERE id=$1`, [id], "exam");
  await db.query(`DELETE FROM ${T}.exams WHERE id=$1`, [id]);
  return { change: await adapt(tz, `${exam.name} removed`) };
}

async function toggleTopic(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id, done } = z.object({ id: z.string(), done: z.boolean() }).parse(raw);
  await must(await getDb(), `UPDATE ${T}.exam_topics SET done=$2 WHERE id=$1 RETURNING id`, [id, done], "topic");
  return { change: await adapt(tz, "Revision progress updated") };
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessionSchema = z
  .object({
    id: z.string().optional(),
    subjectId: z.string().optional(),
    subject: text(60).optional(),
    date,
    start: time,
    end: time,
    task: text(200).default(""),
    method: text(40).default(""),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
    kind: z.enum(["revision", "homework", "practice", "study"]).default("study"),
    notes: text(1000).default(""),
  })
  .refine((s) => s.start < s.end, "The end time must be after the start time")
  .refine((s) => toMin(s.end) - toMin(s.start) >= 10, "A session should be at least 10 minutes")
  .refine((s) => toMin(s.end) - toMin(s.start) <= 240, "A single session cannot be longer than 4 hours");

async function saveSessionTx(tx: Queryable, input: PlanInput, s: z.infer<typeof sessionSchema>, actor: Actor): Promise<string> {
  const subjectId = s.subjectId ?? (await resolveSubject(tx, s.subject ?? "", false));
  const existing = s.id ? input.sessions.find((x) => x.id === s.id) : null;
  if (s.id && !existing) throw new UserError("That session no longer exists. Refresh and try again.");
  if (existing && existing.status !== "planned") throw new UserError("That session is part of your study history and cannot be rescheduled. You can still edit its log.");
  if (s.date < input.today) throw new UserError("Sessions can only be planned for today or later. To record past study, add it to the Study Log.");
  if (input.overrides.some((o) => o.date === s.date && o.type === "off")) throw new UserError(`${fmtDate(s.date)} is marked as a day off. Remove the day off in My Timetable first if you want to study then.`);
  const problem = placementProblem(input, s, s.id);
  if (problem) throw new UserError(problem);
  if (existing) {
    await tx.query(
      `UPDATE ${T}.sessions SET subject_id=$2,date=$3,start_time=$4,end_time=$5,task=$6,method=$7,priority=$8,kind=$9,notes=$10,pinned=TRUE,updated_at=now() WHERE id=$1`,
      [s.id, subjectId, s.date, s.start, s.end, s.task, s.method, s.priority, s.kind, s.notes],
    );
    Object.assign(existing, { subjectId, date: s.date, start: s.start, end: s.end });
    return existing.id;
  }
  const id = newId();
  const row: Session = { id, subjectId, date: s.date, start: s.start, end: s.end, task: s.task || "Study session", method: s.method, priority: s.priority, kind: s.kind, status: "planned", examId: null, topicId: null, origin: actor, pinned: true, notes: s.notes };
  await insertSession(tx, row);
  input.sessions.push(row);
  return id;
}

export async function saveSession(tz: string | null, raw: unknown, actor: Actor = "manual"): Promise<ActionResult> {
  const s = sessionSchema.parse(raw);
  const db = await getDb();
  const id = await db.transaction(async (tx) => saveSessionTx(tx, await loadInput(tx, tz), s, actor));
  return { change: await adapt(tz, s.id ? "You rescheduled a session" : "You added a session"), data: { id } };
}

export async function moveSession(tz: string | null, raw: unknown, actor: Actor = "manual"): Promise<ActionResult> {
  const m = z.object({ id: z.string(), date, start: time, end: time.optional() }).parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const input = await loadInput(tx, tz);
    const s = input.sessions.find((x) => x.id === m.id);
    if (!s) throw new UserError("That session no longer exists. Refresh and try again.");
    const end = m.end ?? fromMin(toMin(m.start) + toMin(s.end) - toMin(s.start));
    if (toMin(m.start) + toMin(s.end) - toMin(s.start) > 1439) throw new UserError("That would run past midnight.");
    await saveSessionTx(tx, input, { id: s.id, subjectId: s.subjectId, date: m.date, start: m.start, end, task: s.task, method: s.method, priority: s.priority, kind: s.kind, notes: s.notes }, actor);
  });
  return { change: await adapt(tz, "You moved a session") };
}

/** Recompute a session's status from the study logged against it. */
async function refreshStatus(tx: Queryable, sessionId: string, today: string) {
  const s = (await tx.query<{ date: string; start_time: string; end_time: string }>(`SELECT date, start_time, end_time FROM ${T}.sessions WHERE id=$1`, [sessionId]))[0];
  if (!s) return;
  const logs = await tx.query<{ minutes: number; completed_task: boolean | null }>(`SELECT minutes, completed_task FROM ${T}.logs WHERE session_id=$1`, [sessionId]);
  const done = logs.reduce((n, l) => n + Number(l.minutes), 0);
  const planned = toMin(s.end_time) - toMin(s.start_time);
  const status = !logs.length ? (s.date < today ? "missed" : "planned") : done >= planned * 0.9 || logs.some((l) => l.completed_task === true) ? "completed" : "partial";
  await tx.query(`UPDATE ${T}.sessions SET status=$2, updated_at=now() WHERE id=$1`, [sessionId, status]);
}

export async function setSessionStatus(tz: string | null, raw: unknown): Promise<ActionResult> {
  const p = z.object({ id: z.string(), status: z.enum(["completed", "missed", "planned"]), minutes: z.coerce.number().int().min(1).max(600).optional(), notes: text(1000).optional() }).parse(raw);
  const db = await getDb();
  let label = "";
  await db.transaction(async (tx) => {
    const input = await loadInput(tx, tz);
    const s = input.sessions.find((x) => x.id === p.id);
    if (!s) throw new UserError("That session no longer exists. Refresh and try again.");
    label = input.subjects.find((x) => x.id === s.subjectId)?.name ?? "session";
    const planned = toMin(s.end) - toMin(s.start);
    if (p.status === "completed") {
      if (s.date > input.today) throw new UserError("That session is in the future. Move it to today first if you did it early.");
      if (!input.logs.some((l) => l.sessionId === s.id)) {
        const minutes = p.minutes ?? planned;
        await insertLog(tx, { id: newId(), subjectId: s.subjectId, date: s.date, start: s.start, end: fromMin(toMin(s.start) + minutes), minutes, description: s.task, sessionId: s.id, completedTask: minutes >= planned * 0.9, productivity: null, notes: p.notes ?? "" });
      }
      await refreshStatus(tx, s.id, input.today);
    } else if (p.status === "missed") {
      await tx.query(`DELETE FROM ${T}.logs WHERE session_id=$1`, [s.id]);
      await tx.query(`UPDATE ${T}.sessions SET status='missed', updated_at=now() WHERE id=$1`, [s.id]);
    } else {
      if (s.date < input.today) throw new UserError("A past session cannot go back to planned. Mark it completed or missed instead.");
      await tx.query(`DELETE FROM ${T}.logs WHERE session_id=$1`, [s.id]);
      await tx.query(`UPDATE ${T}.sessions SET status='planned', updated_at=now() WHERE id=$1`, [s.id]);
    }
  });
  const trigger = { completed: `${label} session completed`, missed: `${label} session missed`, planned: `${label} session reopened` }[p.status];
  return { change: await adapt(tz, trigger) };
}

export async function deleteSession(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  const db = await getDb();
  const s = await must<{ status: string }>(db, `SELECT status FROM ${T}.sessions WHERE id=$1`, [id], "session");
  if (s.status !== "planned") throw new UserError("Completed and missed sessions are kept as history. Delete the study log entry instead if it was a mistake.");
  await db.query(`DELETE FROM ${T}.sessions WHERE id=$1 AND status='planned'`, [id]);
  // Deliberately no rebalance here: removing a session should not make it pop up elsewhere.
  void tz;
  return { message: "Session removed." };
}

/* ------------------------------------------------------------------ */
/* Study log                                                           */
/* ------------------------------------------------------------------ */

const logSchema = z
  .object({
    id: z.string().optional(),
    subjectId: z.string().optional(),
    subject: text(60).optional(),
    date,
    start: time.nullish(),
    end: time.nullish(),
    minutes: z.coerce.number().int().min(1, "Duration must be at least 1 minute").max(960, "That is longer than 16 hours").nullish(),
    description: text(300).default(""),
    sessionId: z.string().nullish(),
    completedTask: z.boolean().nullish(),
    productivity: scale.nullish(),
    notes: text(1000).default(""),
  })
  .refine((l) => l.minutes || (l.start && l.end && l.start < l.end), "Enter a duration, or a start and end time with the end after the start");

export async function saveLog(tz: string | null, raw: unknown): Promise<ActionResult> {
  const l = logSchema.parse(raw);
  const db = await getDb();
  let label = "";
  let linkedNote = "";
  await db.transaction(async (tx) => {
    const input = await loadInput(tx, tz);
    if (l.date > input.today) throw new UserError("You can only log study that has already happened.");
    const subjectId = l.subjectId ?? (await resolveSubject(tx, l.subject ?? "", false));
    label = input.subjects.find((s) => s.id === subjectId)?.name ?? l.subject ?? "study";
    const minutes = l.start && l.end ? toMin(l.end) - toMin(l.start) : l.minutes!;
    const previous = l.id ? input.logs.find((x) => x.id === l.id) : null;
    if (l.id && !previous) throw new UserError("That log entry no longer exists. Refresh and try again.");
    let sessionId = l.sessionId === undefined ? (previous?.sessionId ?? null) : l.sessionId;
    if (sessionId && !input.sessions.some((s) => s.id === sessionId && s.subjectId === subjectId)) sessionId = null;
    if (!sessionId && !previous && l.sessionId === undefined) {
      // Match the log to what was planned for that subject that day, if anything.
      const ref = l.start ? toMin(l.start) : null;
      const match = input.sessions
        .filter((s) => s.subjectId === subjectId && s.date === l.date && (s.status === "planned" || s.status === "partial" || s.status === "missed"))
        .sort((a, b) => (ref === null ? a.start.localeCompare(b.start) : Math.abs(toMin(a.start) - ref) - Math.abs(toMin(b.start) - ref)))[0];
      if (match) {
        sessionId = match.id;
        linkedNote = `Counted against your planned ${match.start} session.`;
      }
    }
    const row = { id: l.id ?? newId(), subjectId, date: l.date, start: l.start ?? null, end: l.end ?? null, minutes, description: l.description, sessionId, completedTask: l.completedTask ?? null, productivity: l.productivity ?? null, notes: l.notes };
    if (previous) {
      await tx.query(
        `UPDATE ${T}.logs SET subject_id=$2,date=$3,start_time=$4,end_time=$5,minutes=$6,description=$7,session_id=$8,completed_task=$9,productivity=$10,notes=$11 WHERE id=$1`,
        [row.id, subjectId, row.date, row.start, row.end, minutes, row.description, sessionId, row.completedTask, row.productivity, row.notes],
      );
      if (previous.sessionId && previous.sessionId !== sessionId) await refreshStatus(tx, previous.sessionId, input.today);
    } else await insertLog(tx, row);
    if (sessionId) await refreshStatus(tx, sessionId, input.today);
  });
  return { change: await adapt(tz, `${label} study logged`), message: linkedNote || undefined };
}

async function deleteLog(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { id } = z.object({ id: z.string() }).parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const input = await loadInput(tx, tz);
    const log = input.logs.find((l) => l.id === id);
    if (!log) return;
    await tx.query(`DELETE FROM ${T}.logs WHERE id=$1`, [id]);
    if (log.sessionId) await refreshStatus(tx, log.sessionId, input.today);
  });
  return { change: await adapt(tz, "Study log entry removed") };
}

/* ------------------------------------------------------------------ */
/* Settings and data                                                   */
/* ------------------------------------------------------------------ */

const settingsSchema = z
  .object({
    weekdayStart: time,
    weekdayEnd: time,
    weekendStart: time,
    weekendEnd: time,
    maxWeekdayMinutes: z.coerce.number().int().min(0).max(600),
    maxWeekendMinutes: z.coerce.number().int().min(0).max(720),
    weeklyTargetHours: z.coerce.number().min(1).max(60),
    sessionMinutes: z.coerce.number().int().min(20).max(120),
    maxSessionMinutes: z.coerce.number().int().min(25).max(180),
    breakMinutes: z.coerce.number().int().min(0).max(60),
    afterSchoolBuffer: z.coerce.number().int().min(0).max(180),
    useFreePeriods: z.boolean(),
    restDays: z.array(z.number().int().min(0).max(6)).max(6),
  })
  .partial();

export async function saveSettings(tz: string | null, raw: unknown): Promise<ActionResult> {
  const patch = settingsSchema.parse(raw);
  const db = await getDb();
  const current = { ...DEFAULT_SETTINGS, ...((await getSetting<object>(db, "prefs")) ?? {}) };
  const next = { ...current, ...patch };
  if (next.weekdayStart >= next.weekdayEnd || next.weekendStart >= next.weekendEnd) throw new UserError("Study hours must end after they start.");
  if (next.maxSessionMinutes < next.sessionMinutes) next.maxSessionMinutes = next.sessionMinutes;
  await setSetting(db, "prefs", next);
  return { change: await adapt(tz, "Preferences changed") };
}

async function resetData(tz: string | null, raw: unknown): Promise<ActionResult> {
  const { mode } = z.object({ mode: z.enum(["sample", "empty"]) }).parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await wipe(tx);
    if (mode === "sample") await seedSample(tx, tz);
    else await setSetting(tx, "prefs", DEFAULT_SETTINGS);
  });
  return { message: mode === "sample" ? "Sample data restored." : "All data cleared. Start by adding your subjects and timetable." };
}

const nullableTime = time.nullable();
const backupSchema = z.object({
  app: z.literal("study-planner"),
  settings: settingsSchema,
  subjects: z.array(z.object({ id: z.string(), name: text(60).min(1), color: z.string(), priority: z.number().int().min(1).max(3), confidence: scale, archived: z.boolean() })).max(100),
  timetable: z.array(z.object({ id: z.string(), day: z.number().int().min(0).max(6), type: z.enum(["class", "break", "free", "commitment"]), title: z.string(), subjectId: z.string().nullable(), start: time, end: time, location: z.string() })).max(500),
  overrides: z.array(z.object({ id: z.string(), date, type: z.enum(["off", "busy", "free"]), start: nullableTime, end: nullableTime, note: z.string() })).max(2000),
  exams: z.array(z.object({
    id: z.string(), name: z.string(), subjectId: z.string(), format: z.string(), confidence: scale, preparedness: scale, notes: z.string(),
    dates: z.array(z.object({ id: z.string(), date, time: nullableTime, label: z.string() })),
    topics: z.array(z.object({ id: z.string(), name: z.string(), done: z.boolean() })),
  })).max(500),
  sessions: z.array(z.object({
    id: z.string(), subjectId: z.string(), date, start: time, end: time, task: z.string(), method: z.string(), priority: z.enum(["high", "medium", "low"]),
    kind: z.enum(["revision", "homework", "practice", "study"]), status: z.enum(["planned", "completed", "partial", "missed"]), examId: z.string().nullable(),
    topicId: z.string().nullable(), origin: z.enum(["planner", "claude", "assistant", "manual"]), pinned: z.boolean(), notes: z.string(),
  })).max(20000),
  logs: z.array(z.object({
    id: z.string(), subjectId: z.string(), date, start: nullableTime, end: nullableTime, minutes: z.number().int().min(1).max(960), description: z.string(),
    sessionId: z.string().nullable(), completedTask: z.boolean().nullable(), productivity: z.number().int().min(1).max(5).nullable(), notes: z.string(),
  })).max(20000),
});

async function importBackup(_tz: string | null, raw: unknown): Promise<ActionResult> {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new UserError("That file is not a valid Study Planner backup, so nothing was changed.");
  const b = parsed.data;
  const subjectIds = new Set(b.subjects.map((s) => s.id));
  const sessionIds = new Set(b.sessions.map((s) => s.id));
  const ok = b.exams.every((e) => subjectIds.has(e.subjectId)) && b.sessions.every((s) => subjectIds.has(s.subjectId)) && b.logs.every((l) => subjectIds.has(l.subjectId));
  if (!ok) throw new UserError("That backup refers to subjects it does not contain, so nothing was changed.");
  const examIds = new Set(b.exams.map((e) => e.id));
  const topicIds = new Set(b.exams.flatMap((e) => e.topics.map((t) => t.id)));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await wipe(tx);
    await writeAll(tx, {
      settings: { ...DEFAULT_SETTINGS, ...b.settings },
      subjects: b.subjects,
      timetable: b.timetable.map((e) => ({ ...e, subjectId: e.subjectId && subjectIds.has(e.subjectId) ? e.subjectId : null })),
      overrides: b.overrides,
      exams: b.exams,
      sessions: b.sessions.map((s) => ({ ...s, examId: s.examId && examIds.has(s.examId) ? s.examId : null, topicId: s.topicId && topicIds.has(s.topicId) ? s.topicId : null })),
      logs: b.logs.map((l) => ({ ...l, sessionId: l.sessionId && sessionIds.has(l.sessionId) ? l.sessionId : null })),
    });
  });
  return { message: "Backup restored." };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

type Handler = (tz: string | null, payload: unknown) => Promise<ActionResult>;

export const actions: Record<string, Handler> = {
  sync: (tz) => sync(tz),
  "subject.save": saveSubject,
  "subject.delete": deleteSubject,
  "timetable.save": saveEntry,
  "timetable.delete": deleteEntry,
  "timetable.import": importTimetable,
  "override.save": saveOverride,
  "override.delete": deleteOverride,
  "exam.save": saveExam,
  "exam.delete": deleteExam,
  "topic.toggle": toggleTopic,
  "session.save": (tz, p) => saveSession(tz, p),
  "session.move": (tz, p) => moveSession(tz, p),
  "session.status": setSessionStatus,
  "session.delete": deleteSession,
  "log.save": saveLog,
  "log.delete": deleteLog,
  "settings.save": saveSettings,
  "plan.rebalance": async (tz) => {
    const change = await adapt(tz, "You asked for a rebalance");
    return { change, message: change ? undefined : "Your plan is already up to date." };
  },
  "plan.undo": undoChange,
  "data.reset": resetData,
  "data.import": importBackup,
};

/** Turn any thrown error into a message that is safe and useful to show. */
export function explain(err: unknown): { status: number; message: string } {
  if (err instanceof UserError) return { status: 400, message: err.message };
  if (err instanceof z.ZodError) return { status: 400, message: err.issues[0]?.message ?? "Please check the form and try again." };
  console.error("[study-planner]", err);
  return { status: 500, message: "Something went wrong while saving. Nothing was lost; please try again." };
}
