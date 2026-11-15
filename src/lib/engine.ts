/**
 * The planning engine. Pure functions: a snapshot of the student's data goes
 * in, a list of sessions to remove and to add comes out. Nothing here touches
 * the database, which makes every rule testable.
 *
 * Ground rules it enforces, whoever proposes the sessions (itself or Claude):
 *  - history is never touched: only future sessions that are still "planned";
 *  - nothing overlaps classes, commitments, days off or other sessions;
 *  - each day and each week has a ceiling, so the plan stays achievable;
 *  - existing sessions are kept unless there is a reason to change them.
 */
import type { Exam, PlanInput, Priority, Session, SessionKind, Subject } from "./types";
import {
  addDays,
  diffDays,
  fmtDate,
  fmtDuration,
  fromMin,
  merge,
  overlaps,
  relativeDay,
  subtract,
  toMin,
  weekday,
  weekStart,
  type Interval,
} from "./time";

export type PlanMode = "rebalance" | "regenerate";

export type NewSession = Pick<
  Session,
  "subjectId" | "date" | "start" | "end" | "task" | "method" | "priority" | "kind" | "examId" | "topicId"
>;

export interface Proposal {
  subjectId: string;
  date: string;
  start: string;
  end: string;
  task: string;
  method: string;
  priority?: Priority;
  kind?: SessionKind;
  examId?: string | null;
  topicId?: string | null;
}

export interface PlanResult {
  remove: Session[];
  add: NewSession[];
  notes: string[];
  summary: string;
  rejected: string[];
}

export interface DayBrief {
  date: string;
  freeWindows: { start: string; end: string }[];
  budgetMinutes: number;
  alreadyScheduledMinutes: number;
}

export interface PlanBrief {
  days: DayBrief[];
  weeks: { weekStart: string; needs: { subjectId: string; minutes: number; reason: string }[] }[];
  keptSessions: Session[];
}

const round5 = (n: number) => Math.round(n / 5) * 5;
const ceil5 = (n: number) => Math.ceil(n / 5) * 5;
const dur = (s: { start: string; end: string }) => toMin(s.end) - toMin(s.start);
const span = (s: { start: string; end: string }): Interval => ({ start: toMin(s.start), end: toMin(s.end) });

/** Days the planner looks after: today through the Sunday of next week. */
export function horizon(today: string): string[] {
  const end = addDays(weekStart(today), 13);
  const out: string[] = [];
  for (let d = today; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isDayOff(input: PlanInput, date: string): boolean {
  return input.overrides.some((o) => o.date === date && o.type === "off");
}

/** Time that is firmly taken on a date: classes, breaks, commitments, one-off busy blocks. */
export function busyIntervals(input: PlanInput, date: string): (Interval & { label: string })[] {
  const day = weekday(date);
  const freed = input.overrides
    .filter((o) => o.date === date && o.type === "free" && o.start && o.end)
    .map((o) => span({ start: o.start!, end: o.end! }));
  const out: (Interval & { label: string })[] = [];
  for (const e of input.timetable) {
    if (e.day !== day || e.type === "free") continue;
    for (const piece of subtract([span(e)], freed)) out.push({ ...piece, label: e.title });
  }
  for (const o of input.overrides) {
    if (o.date === date && o.type === "busy" && o.start && o.end) {
      out.push({ ...span({ start: o.start, end: o.end }), label: o.note || "Busy" });
    }
  }
  return out;
}

/** Windows in which the planner may place study on a date. */
export function studyWindows(input: PlanInput, date: string): Interval[] {
  const s = input.settings;
  const day = weekday(date);
  if (isDayOff(input, date) || s.restDays.includes(day)) return [];
  const weekend = day >= 5;
  const base: Interval[] = [
    { start: toMin(weekend ? s.weekendStart : s.weekdayStart), end: toMin(weekend ? s.weekendEnd : s.weekdayEnd) },
  ];
  const todays = input.timetable.filter((e) => e.day === day);
  if (s.useFreePeriods) for (const e of todays) if (e.type === "free") base.push(span(e));
  for (const o of input.overrides) {
    if (o.date === date && o.type === "free" && o.start && o.end) base.push(span({ start: o.start, end: o.end }));
  }
  const busy: Interval[] = busyIntervals(input, date);
  // A breather after the last lesson before study starts.
  const lessons = busy.length ? todays.filter((e) => e.type === "class") : [];
  if (lessons.length && s.afterSchoolBuffer > 0) {
    const last = Math.max(...lessons.map((e) => toMin(e.end)));
    const freed = input.overrides.some(
      (o) => o.date === date && o.type === "free" && o.start && o.end && toMin(o.start) < last && toMin(o.end) >= last,
    );
    if (!freed) busy.push({ start: last, end: last + s.afterSchoolBuffer });
  }
  let windows = subtract(merge(base), busy);
  if (date === input.today) {
    const from = ceil5(toMin(input.nowTime) + 10);
    windows = subtract(windows, [{ start: 0, end: from }]);
  }
  return windows.filter((w) => w.end - w.start >= 20);
}

/** Why a session cannot sit at this date and time, or null when it can. */
export function placementProblem(
  input: PlanInput,
  slot: { date: string; start: string; end: string },
  ignoreSessionId?: string,
): string | null {
  if (toMin(slot.end) <= toMin(slot.start)) return "The end time must be after the start time.";
  const me = span(slot);
  const clash = busyIntervals(input, slot.date).find((b) => overlaps(b, me));
  if (clash) return `That overlaps with ${clash.label} (${fromMin(clash.start)}–${fromMin(clash.end)}).`;
  const other = input.sessions.find(
    (s) => s.id !== ignoreSessionId && s.date === slot.date && s.status !== "missed" && overlaps(span(s), me),
  );
  if (other) {
    const name = input.subjects.find((x) => x.id === other.subjectId)?.name ?? "another";
    return `That overlaps with your ${name} session at ${other.start}–${other.end}.`;
  }
  return null;
}

/** The exam sitting that a study block on `date` would be preparing for. */
export function nextExam(input: PlanInput, subjectId: string, date: string): { exam: Exam; date: string; days: number } | null {
  let best: { exam: Exam; date: string; days: number } | null = null;
  for (const exam of input.exams) {
    if (exam.subjectId !== subjectId) continue;
    for (const d of exam.dates) {
      const days = diffDays(date, d.date);
      if (days < 1) continue;
      if (!best || days < best.days) best = { exam, date: d.date, days };
    }
  }
  return best;
}

/** How strongly a subject pulls for study time on a given date. */
export function subjectWeight(input: PlanInput, subject: Subject, date: string): number {
  let w = [0.75, 1, 1.35][subject.priority - 1] ?? 1;
  w *= 1 + (3 - subject.confidence) * 0.18;
  const next = nextExam(input, subject.id, date);
  if (next && next.days <= 56) {
    const { exam, days } = next;
    const remaining = exam.topics.filter((t) => !t.done).length;
    let boost = 2.4 * Math.exp(-days / 9);
    boost *= 1 + (3 - exam.preparedness) * 0.15;
    boost *= 1 + (3 - exam.confidence) * 0.1;
    boost *= 1 + Math.min(remaining, 10) * 0.03;
    w *= 1 + boost;
  }
  return w;
}

function methodFor(daysToExam: number, n: number): string {
  if (daysToExam <= 1) return "Active recall";
  if (daysToExam <= 5) return n % 2 === 0 ? "Past papers" : "Practice questions";
  if (daysToExam <= 10) return n % 2 === 0 ? "Practice questions" : "Active recall";
  if (daysToExam <= 21) return n % 2 === 0 ? "Active recall" : "Flashcards";
  return n % 2 === 0 ? "Summarising" : "Flashcards";
}

const ROUTINE: { kind: SessionKind; method: string; task: string }[] = [
  { kind: "homework", method: "Homework", task: "Homework and class follow-up" },
  { kind: "revision", method: "Active recall", task: "Review this week's notes from memory" },
  { kind: "practice", method: "Practice questions", task: "Independent practice questions" },
  { kind: "study", method: "Summarising", task: "Summarise the current topic in your own words" },
];

interface Ctx {
  input: PlanInput;
  mode: PlanMode;
  days: string[];
  kept: Session[];
  removed: Session[];
  added: NewSession[];
  notes: string[];
  rejected: string[];
  /** Sessions removed only because their slot became impossible; their work is re-placed. */
  displaced: Map<string, Session[]>;
  budget: Map<string, number>;
  placed: Map<string, number>;
  needs: Map<string, Map<string, number>>;
  reasons: Map<string, string>;
  topicUse: Map<string, number>;
  routineUse: Map<string, number>;
}

function occupied(ctx: Ctx, date: string): Interval[] {
  const out: Interval[] = [];
  for (const s of ctx.input.sessions) {
    if (s.date === date && s.status !== "missed" && !ctx.removed.includes(s)) out.push(span(s));
  }
  for (const a of ctx.added) if (a.date === date) out.push(span(a));
  return out.sort((a, b) => a.start - b.start);
}

/** Minutes of back-to-back study a block would become part of. */
function chainLength(blocks: Interval[], start: number, end: number): number {
  const rest = [...blocks];
  let total = end - start;
  let from = start;
  let to = end;
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      const b = rest[i];
      if (b.end <= from && from - b.end <= 20) {
        total += b.end - b.start;
        from = b.start;
      } else if (b.start >= to && b.start - to <= 20) {
        total += b.end - b.start;
        to = b.end;
      } else continue;
      rest.splice(i, 1);
      grew = true;
    }
  }
  return total;
}

function freeGaps(ctx: Ctx, date: string): Interval[] {
  const pad = ctx.input.settings.breakMinutes;
  const taken = occupied(ctx, date).map((o) => ({ start: o.start - pad, end: o.end + pad }));
  return subtract(studyWindows(ctx.input, date), taken);
}

function findSlot(ctx: Ctx, date: string, len: number): number | null {
  const blocks = occupied(ctx, date);
  for (const gap of freeGaps(ctx, date)) {
    for (let start = ceil5(gap.start); start + len <= gap.end; start += 15) {
      if (chainLength(blocks, start, start + len) <= 125) return start;
    }
  }
  return null;
}

function analyse(input: PlanInput, mode: PlanMode): Ctx {
  const days = horizon(input.today);
  const end = days[days.length - 1];
  const now = toMin(input.nowTime);
  const active = input.subjects.filter((s) => !s.archived);
  const ctx: Ctx = {
    input,
    mode,
    days,
    kept: [],
    removed: [],
    added: [],
    notes: [],
    rejected: [],
    displaced: new Map(),
    budget: new Map(),
    placed: new Map(),
    needs: new Map(),
    reasons: new Map(),
    topicUse: new Map(),
    routineUse: new Map(),
  };

  const isFuture = (s: Session) =>
    s.status === "planned" && s.date <= end && (s.date > input.today || (s.date === input.today && toMin(s.start) >= now));
  const future = input.sessions.filter(isFuture).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.date + a.start).localeCompare(b.date + b.start));

  // 1. Drop what can no longer happen where it is (or everything movable, when regenerating).
  const displace = (s: Session, why: string) => {
    ctx.removed.push(s);
    ctx.displaced.set(s.subjectId, [...(ctx.displaced.get(s.subjectId) ?? []), s]);
    ctx.reasons.set(`moved:${s.id}`, why);
  };
  for (const s of future) {
    const subject = input.subjects.find((x) => x.id === s.subjectId);
    if (!subject || subject.archived) {
      ctx.removed.push(s);
      continue;
    }
    if (mode === "regenerate" && !s.pinned) {
      ctx.removed.push(s);
      continue;
    }
    const me = span(s);
    const clash = busyIntervals(input, s.date).find((b) => overlaps(b, me));
    if (isDayOff(input, s.date)) displace(s, "that day is now a day off");
    else if (clash) displace(s, `it clashed with ${clash.label}`);
    else if (!s.pinned && input.settings.restDays.includes(weekday(s.date))) displace(s, "that is a rest day");
    else if (ctx.kept.some((k) => k.date === s.date && overlaps(span(k), me))) displace(s, "it overlapped another session");
    else ctx.kept.push(s);
  }

  // Sessions that already happened or are in progress today still count as scheduled.
  const scheduledMinutes = (date: string) =>
    ctx.kept.filter((s) => s.date === date).reduce((n, s) => n + dur(s), 0) +
    input.sessions
      .filter((s) => s.date === date && s.status === "planned" && !isFuture(s) && date === input.today)
      .reduce((n, s) => n + dur(s), 0);

  const logged = (from: string, to: string, subjectId?: string) =>
    input.logs
      .filter((l) => l.date >= from && l.date <= to && (!subjectId || l.subjectId === subjectId))
      .reduce((n, l) => n + l.minutes, 0);

  let carry = new Map<string, number>();
  // Unfinished work from last week comes along, softened so it never snowballs.
  const lastWeek = addDays(weekStart(input.today), -7);
  for (const s of input.sessions) {
    if (s.date < lastWeek || s.date > addDays(lastWeek, 6)) continue;
    if (s.status !== "missed" && s.status !== "partial") continue;
    const done = input.logs.filter((l) => l.sessionId === s.id).reduce((n, l) => n + l.minutes, 0);
    carry.set(s.subjectId, Math.min(90, (carry.get(s.subjectId) ?? 0) + Math.max(0, dur(s) - done) * 0.5));
  }

  const weekStarts = [...new Set(days.map(weekStart))];
  for (const ws of weekStarts) {
    const we = addDays(ws, 6);
    const weekDays = days.filter((d) => weekStart(d) === ws);
    const actualTotal = logged(ws, we);

    // 2. A realistic ceiling for each remaining day.
    const cap = new Map<string, number>();
    for (const d of weekDays) {
      const free = studyWindows(input, d).reduce((n, w) => n + (w.end - w.start), 0);
      const limit = weekday(d) >= 5 ? input.settings.maxWeekendMinutes : input.settings.maxWeekdayMinutes;
      const doneToday = d === input.today ? logged(d, d) : 0;
      // Hand-placed sessions are honoured even outside the usual study hours.
      const pinnedHere = ctx.kept.filter((s) => s.date === d && s.pinned).reduce((n, s) => n + dur(s), 0);
      cap.set(d, Math.max(0, Math.min(limit - doneToday, Math.max(Math.round(free * 0.8), pinnedHere))));
    }
    const capTotal = [...cap.values()].reduce((a, b) => a + b, 0);

    // 3. A weekly total: the target, nudged up a little in exam weeks.
    const examSoon = input.exams.some((e) => e.dates.some((d) => d.date >= input.today && d.date <= addDays(we, 7)));
    const examThisWeek = input.exams.some((e) => e.dates.some((d) => d.date >= input.today && d.date >= ws && d.date <= we));
    const target = input.settings.weeklyTargetHours * 60 * (examThisWeek ? 1.2 : examSoon ? 1.1 : 1);
    const floor = Math.min(capTotal, (target * 0.25 * weekDays.length) / 7);
    const remainingBudget = Math.min(capTotal, Math.max(target - actualTotal, floor));
    for (const d of weekDays) {
      ctx.budget.set(d, capTotal > 0 ? (remainingBudget * (cap.get(d) ?? 0)) / capTotal : 0);
      ctx.placed.set(d, scheduledMinutes(d));
    }

    // 4. Split the week between subjects by how much each one needs attention.
    const share = new Map<string, number>();
    let shareTotal = 0;
    for (const s of active) {
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        const all = active.reduce((n, x) => n + subjectWeight(input, x, d), 0);
        sum += subjectWeight(input, s, d) / all;
      }
      share.set(s.id, sum / 7);
      shareTotal += sum / 7;
    }
    const weekTotal = actualTotal + remainingBudget;
    const minimum = active.length ? Math.min(40, weekTotal / (active.length * 2.5)) : 0;
    const remaining = new Map<string, number>();
    let remainingSum = 0;
    for (const s of active) {
      const desired = Math.max(minimum, (weekTotal * (share.get(s.id) ?? 0)) / (shareTotal || 1)) + (carry.get(s.id) ?? 0);
      const left = Math.max(0, desired - logged(ws, we, s.id));
      remaining.set(s.id, left);
      remainingSum += left;
    }
    const scale = remainingSum > remainingBudget && remainingSum > 0 ? remainingBudget / remainingSum : 1;

    // 5. Keep what is already scheduled unless a subject is clearly over or under.
    const need = new Map<string, number>();
    for (const s of active) {
      const want = (remaining.get(s.id) ?? 0) * scale;
      const mine = () => ctx.kept.filter((k) => k.subjectId === s.id && weekStart(k.date) === ws);
      let have =
        mine().reduce((n, k) => n + dur(k), 0) +
        input.sessions
          .filter((k) => k.subjectId === s.id && k.date === input.today && k.status === "planned" && !isFuture(k) && weekStart(k.date) === ws)
          .reduce((n, k) => n + dur(k), 0);
      const surplusTolerance = Math.max(30, have * 0.35);
      if (have - want > surplusTolerance) {
        const rank: Record<Priority, number> = { low: 0, medium: 1, high: 2 };
        const candidates = mine()
          .filter((k) => !k.pinned)
          .sort((a, b) => rank[a.priority] - rank[b.priority] || (b.date + b.start).localeCompare(a.date + a.start));
        let cut = 0;
        for (const k of candidates) {
          if (have - want <= surplusTolerance || have - dur(k) < want - 15) break;
          ctx.kept.splice(ctx.kept.indexOf(k), 1);
          ctx.removed.push(k);
          ctx.placed.set(k.date, (ctx.placed.get(k.date) ?? 0) - dur(k));
          have -= dur(k);
          cut += dur(k);
        }
        if (cut && mode === "rebalance") {
          const ahead = logged(ws, we, s.id) > 0;
          ctx.notes.push(
            `Eased off ${s.name} by ${fmtDuration(cut)} ${ahead ? "because you have already put in the time this week" : "to make room for more urgent subjects"}.`,
          );
        }
      }
      const gap = want - have;
      need.set(s.id, gap >= Math.max(20, want * 0.15) ? gap : 0);

      const next = nextExam(input, s.id, weekDays[0]);
      const plannedSoFar = input.sessions
        .filter((k) => k.subjectId === s.id && k.date >= ws && k.date < input.today)
        .reduce((n, k) => n + dur(k), 0);
      const reason =
        next && next.days <= 14
          ? `${next.exam.name} is ${relativeDay(input.today, next.date)}`
          : plannedSoFar - logged(ws, we, s.id) >= 30
            ? "catching up on time missed earlier this week"
            : s.confidence <= 2
              ? "you said you feel less confident here"
              : s.priority === 3
                ? "you marked it as needing extra attention"
                : next
                  ? `building up to ${next.exam.name}`
                  : "keeping every subject ticking over";
      ctx.reasons.set(`${ws}:${s.id}`, reason);
    }
    ctx.needs.set(ws, need);

    // Never let one day carry more than its ceiling, even after settings change.
    for (const d of weekDays) {
      const limit = (weekday(d) >= 5 ? input.settings.maxWeekendMinutes : input.settings.maxWeekdayMinutes) + 20;
      const movable = ctx.kept.filter((k) => k.date === d && !k.pinned).sort((a, b) => b.start.localeCompare(a.start));
      while ((ctx.placed.get(d) ?? 0) > limit && movable.length) {
        const k = movable.shift()!;
        ctx.kept.splice(ctx.kept.indexOf(k), 1);
        displace(k, "that day was overloaded");
        ctx.placed.set(d, (ctx.placed.get(d) ?? 0) - dur(k));
        need.set(k.subjectId, (need.get(k.subjectId) ?? 0) + dur(k));
      }
    }
    carry = new Map();
  }

  for (const s of [...ctx.kept, ...input.sessions.filter((x) => x.status !== "planned")]) {
    if (s.topicId) ctx.topicUse.set(s.topicId, (ctx.topicUse.get(s.topicId) ?? 0) + 1);
  }
  return ctx;
}

/** Decide what a new block for a subject on a date should be about. */
function describeBlock(ctx: Ctx, subject: Subject, date: string): Omit<NewSession, "date" | "start" | "end"> {
  const { input } = ctx;
  const reuse = ctx.displaced.get(subject.id)?.find((s) => !ctx.reasons.has(`reused:${s.id}`));
  if (reuse) {
    ctx.reasons.set(`reused:${reuse.id}`, "1");
    return { subjectId: subject.id, task: reuse.task, method: reuse.method, priority: reuse.priority, kind: reuse.kind, examId: reuse.examId, topicId: reuse.topicId };
  }
  const next = nextExam(input, subject.id, date);
  if (next && next.days <= 35) {
    const { exam, days } = next;
    const n = (ctx.routineUse.get(`exam:${exam.id}`) ?? 0) + 1;
    ctx.routineUse.set(`exam:${exam.id}`, n);
    const method = methodFor(days, n);
    const open = exam.topics.filter((t) => !t.done);
    const topic = [...open].sort((a, b) => (ctx.topicUse.get(a.id) ?? 0) - (ctx.topicUse.get(b.id) ?? 0))[0];
    const priority: Priority = days <= 7 || exam.preparedness <= 2 ? "high" : days <= 21 ? "medium" : "low";
    let task: string;
    let topicId: string | null = null;
    if (method === "Past papers") task = `Timed past paper for ${exam.name}, then mark it`;
    else if (days <= 1 && !ctx.routineUse.has(`final:${exam.id}`)) {
      ctx.routineUse.set(`final:${exam.id}`, 1);
      task = `Light final review for ${exam.name}: weak spots only`;
    }
    else if (topic) {
      topicId = topic.id;
      ctx.topicUse.set(topic.id, (ctx.topicUse.get(topic.id) ?? 0) + 1);
      task = method === "Practice questions" ? `Exam-style questions on ${topic.name}` : `Revise ${topic.name}`;
    } else task = `Revision for ${exam.name}`;
    return { subjectId: subject.id, task, method, priority, kind: method === "Past papers" || method === "Practice questions" ? "practice" : "revision", examId: exam.id, topicId };
  }
  const n = ctx.routineUse.get(subject.id) ?? [...ctx.kept, ...input.sessions].filter((s) => s.subjectId === subject.id).length;
  ctx.routineUse.set(subject.id, n + 1);
  const r = ROUTINE[n % ROUTINE.length];
  const priority: Priority = subject.confidence <= 2 || subject.priority === 3 ? "high" : subject.priority === 1 ? "low" : "medium";
  return { subjectId: subject.id, task: r.task, method: r.method, priority, kind: r.kind, examId: null, topicId: null };
}

function place(ctx: Ctx, s: NewSession) {
  ctx.added.push(s);
  ctx.placed.set(s.date, (ctx.placed.get(s.date) ?? 0) + dur(s));
  const need = ctx.needs.get(weekStart(s.date));
  if (need) need.set(s.subjectId, (need.get(s.subjectId) ?? 0) - dur(s));
}

function acceptProposals(ctx: Ctx, proposals: Proposal[]) {
  const { input } = ctx;
  for (const p of proposals) {
    const subject = input.subjects.find((s) => s.id === p.subjectId && !s.archived);
    const label = `${subject?.name ?? p.subjectId} ${p.date} ${p.start}`;
    const reject = (why: string) => ctx.rejected.push(`${label}: ${why}`);
    if (!subject) { reject("unknown subject"); continue; }
    if (!ctx.days.includes(p.date)) { reject("outside the planning window"); continue; }
    const start = round5(toMin(p.start));
    const len = round5(toMin(p.end) - toMin(p.start));
    if (len < 20 || len > Math.max(input.settings.maxSessionMinutes, 90)) { reject("unrealistic length"); continue; }
    const fits = freeGaps(ctx, p.date).some((g) => start >= g.start && start + len <= g.end);
    if (!fits) { reject("not inside free study time"); continue; }
    if ((ctx.placed.get(p.date) ?? 0) + len > (ctx.budget.get(p.date) ?? 0) + 25) { reject("would overload the day"); continue; }
    const need = ctx.needs.get(weekStart(p.date))?.get(p.subjectId) ?? 0;
    if (need < len * 0.5) { reject("subject already has enough time this week"); continue; }
    const exam = input.exams.find((e) => e.id === p.examId && e.subjectId === subject.id) ?? null;
    const topic = exam?.topics.find((t) => t.id === p.topicId) ?? null;
    const fallback = describeBlock(ctx, subject, p.date);
    place(ctx, {
      subjectId: subject.id,
      date: p.date,
      start: fromMin(start),
      end: fromMin(start + len),
      task: p.task.trim().slice(0, 200) || fallback.task,
      method: p.method.trim().slice(0, 40) || fallback.method,
      priority: p.priority ?? fallback.priority,
      kind: p.kind ?? fallback.kind,
      examId: exam?.id ?? null,
      topicId: topic?.id ?? null,
    });
  }
}

function fill(ctx: Ctx) {
  const { input } = ctx;
  const s = input.settings;
  const pref = Math.min(s.sessionMinutes, s.maxSessionMinutes);
  for (const [ws, need] of ctx.needs) {
    const weekDays = ctx.days.filter((d) => weekStart(d) === ws);
    const stuck = new Set<string>();
    for (let guard = 0; guard < 80; guard++) {
      const open = [...need.entries()].filter(([id, n]) => n >= 20 && !stuck.has(id)).sort((a, b) => b[1] - a[1]);
      if (!open.length) break;
      const [subjectId, left] = open[0];
      const subject = input.subjects.find((x) => x.id === subjectId)!;
      const count = Math.max(1, Math.round(left / pref));
      const len = Math.max(25, Math.min(s.maxSessionMinutes, round5(left / count)));
      const peak = Math.max(...weekDays.map((d) => subjectWeight(input, subject, d)));

      // Try the ideal length first, then shorter blocks that can use up a leftover gap.
      let best: { date: string; start: number; len: number; score: number } | null = null;
      for (const tryLen of [len, 35, 25].filter((l, i) => i === 0 || (l < len && l <= left + 10))) {
        for (const d of weekDays) {
          const budget = ctx.budget.get(d) ?? 0;
          const used = ctx.placed.get(d) ?? 0;
          if (budget <= 0 || used + tryLen > budget + 15) continue;
          const next = nextExam(input, subjectId, d);
          const sameDay = occupiedBySubject(ctx, d, subjectId);
          if (sameDay >= (next && next.days <= 3 ? 3 : 2)) continue;
          const start = findSlot(ctx, d, tryLen);
          if (start === null) continue;
          const score = subjectWeight(input, subject, d) / peak + (1 - used / budget) * 1.2 - sameDay * 0.8 - weekDays.indexOf(d) * 0.02;
          if (!best || score > best.score) best = { date: d, start, len: tryLen, score };
        }
        if (best) break;
      }
      if (!best) {
        stuck.add(subjectId);
        continue;
      }
      place(ctx, { ...describeBlock(ctx, subject, best.date), date: best.date, start: fromMin(best.start), end: fromMin(best.start + best.len) });
    }
    for (const id of stuck) {
      const left = need.get(id) ?? 0;
      const subject = input.subjects.find((x) => x.id === id)!;
      if (left >= 40) ctx.notes.push(`Could not fit ${fmtDuration(round5(left))} of ${subject.name} into the week of ${fmtDate(ws, { weekday: false })} without overloading a day, so it was left out rather than crammed in.`);
    }
  }
}

function occupiedBySubject(ctx: Ctx, date: string, subjectId: string): number {
  return (
    ctx.input.sessions.filter((s) => s.date === date && s.subjectId === subjectId && s.status !== "missed" && !ctx.removed.includes(s)).length +
    ctx.added.filter((a) => a.date === date && a.subjectId === subjectId).length
  );
}

function finish(ctx: Ctx): PlanResult {
  const { input } = ctx;
  const name = (id: string) => input.subjects.find((s) => s.id === id)?.name ?? "Subject";
  const notes: string[] = [];
  const movedIds = new Set<string>();
  const usedAdds = new Set<NewSession>();

  // Pair displaced sessions with the block that replaced them, so they read as moves.
  for (const [subjectId, list] of ctx.displaced) {
    for (const old of list) {
      const to = ctx.added.find((a) => !usedAdds.has(a) && a.subjectId === subjectId && a.task === old.task);
      const why = ctx.reasons.get(`moved:${old.id}`) ?? "its slot was no longer free";
      if (to) {
        usedAdds.add(to);
        movedIds.add(old.id);
        notes.push(`Moved ${name(subjectId)} (${old.task}) from ${fmtDate(old.date)} ${old.start} to ${fmtDate(to.date)} ${to.start} because ${why}.`);
      } else {
        movedIds.add(old.id);
        notes.push(`Removed ${name(subjectId)} on ${fmtDate(old.date)} ${old.start} because ${why}; there was no sensible slot left for it.`);
      }
    }
  }
  const bySubject = new Map<string, NewSession[]>();
  for (const a of ctx.added) if (!usedAdds.has(a)) bySubject.set(a.subjectId, [...(bySubject.get(a.subjectId) ?? []), a]);
  for (const [subjectId, list] of bySubject) {
    const mins = list.reduce((n, a) => n + dur(a), 0);
    const why = ctx.reasons.get(`${weekStart(list[0].date)}:${subjectId}`);
    notes.push(`Added ${list.length} ${name(subjectId)} session${list.length > 1 ? "s" : ""} (${fmtDuration(mins)})${why ? `: ${why}` : ""}.`);
  }
  notes.push(...ctx.notes);

  const moved = usedAdds.size;
  const added = ctx.added.length - moved;
  const removed = ctx.removed.length - moved;
  const parts = [added && `${added} added`, moved && `${moved} moved`, removed && `${removed} removed`].filter(Boolean);
  const summary =
    ctx.mode === "regenerate"
      ? `Built a fresh plan with ${ctx.added.length} session${ctx.added.length === 1 ? "" : "s"} (${fmtDuration(ctx.added.reduce((n, a) => n + dur(a), 0))}).`
      : parts.length
        ? `Plan updated: ${parts.join(", ")}.`
        : "No changes needed. Your plan is still on track.";
  ctx.added.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return {
    remove: ctx.removed,
    add: ctx.added,
    notes: ctx.mode === "regenerate" ? notes.filter((n) => !n.startsWith("Moved") && !n.startsWith("Removed")) : notes,
    summary,
    rejected: ctx.rejected,
  };
}

/**
 * Work out the changes that bring the upcoming plan in line with reality.
 * `proposals` are sessions suggested by Claude: each is checked against every
 * rule and the engine fills whatever is still missing.
 */
export function plan(input: PlanInput, mode: PlanMode, proposals: Proposal[] = []): PlanResult {
  const ctx = analyse(input, mode);
  if (proposals.length) acceptProposals(ctx, proposals);
  fill(ctx);
  return finish(ctx);
}

/** The facts Claude needs to design sessions that the engine will accept. */
export function brief(input: PlanInput, mode: PlanMode): PlanBrief {
  const ctx = analyse(input, mode);
  return {
    days: ctx.days.map((date) => ({
      date,
      freeWindows: freeGaps(ctx, date).filter((g) => g.end - g.start >= 25).map((g) => ({ start: fromMin(ceil5(g.start)), end: fromMin(g.end) })),
      budgetMinutes: Math.max(0, Math.round((ctx.budget.get(date) ?? 0) - (ctx.placed.get(date) ?? 0))),
      alreadyScheduledMinutes: Math.round(ctx.placed.get(date) ?? 0),
    })),
    weeks: [...ctx.needs.entries()].map(([ws, need]) => ({
      weekStart: ws,
      needs: [...need.entries()]
        .filter(([, n]) => n >= 20)
        .map(([subjectId, n]) => ({ subjectId, minutes: round5(n), reason: ctx.reasons.get(`${ws}:${subjectId}`) ?? "" })),
    })),
    keptSessions: ctx.kept,
  };
}
