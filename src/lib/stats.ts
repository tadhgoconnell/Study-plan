/** Numbers for the dashboard and progress views. Pure functions over the app state. */
import type { AppState, Exam, Session, Subject } from "./types";
import { addDays, diffDays, fmtDuration, toMin, weekStart } from "./time";

export const dur = (s: { start: string; end: string }) => toMin(s.end) - toMin(s.start);
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

export function activeSubjects(state: AppState): Subject[] {
  return state.subjects.filter((s) => !s.archived);
}

export function subjectMap(state: AppState): Map<string, Subject> {
  return new Map(state.subjects.map((s) => [s.id, s]));
}

export interface WeekStats {
  start: string;
  end: string;
  planned: number;
  actual: number;
  pct: number;
  completed: number;
  partial: number;
  missed: number;
  upcoming: number;
  bySubject: { subject: Subject; planned: number; actual: number }[];
}

export function weekStats(state: AppState, anyDate: string): WeekStats {
  const start = weekStart(anyDate);
  const end = addDays(start, 6);
  const sessions = state.sessions.filter((s) => s.date >= start && s.date <= end);
  const logs = state.logs.filter((l) => l.date >= start && l.date <= end);
  const planned = sum(sessions.map(dur));
  const actual = sum(logs.map((l) => l.minutes));
  const subjects = state.subjects.filter((s) => !s.archived || logs.some((l) => l.subjectId === s.id));
  return {
    start,
    end,
    planned,
    actual,
    pct: planned ? Math.min(100, Math.round((actual / planned) * 100)) : actual ? 100 : 0,
    completed: sessions.filter((s) => s.status === "completed").length,
    partial: sessions.filter((s) => s.status === "partial").length,
    missed: sessions.filter((s) => s.status === "missed").length,
    upcoming: sessions.filter((s) => s.status === "planned").length,
    bySubject: subjects
      .map((subject) => ({
        subject,
        planned: sum(sessions.filter((s) => s.subjectId === subject.id).map(dur)),
        actual: sum(logs.filter((l) => l.subjectId === subject.id).map((l) => l.minutes)),
      }))
      .filter((r) => r.planned || r.actual || !r.subject.archived),
  };
}

export function dayStats(state: AppState, date: string) {
  const sessions = state.sessions.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const logs = state.logs.filter((l) => l.date === date);
  return {
    sessions,
    planned: sum(sessions.map(dur)),
    actual: sum(logs.map((l) => l.minutes)),
    remaining: sessions.filter((s) => s.status === "planned"),
  };
}

export function dailySeries(state: AppState, days: number) {
  const out: { date: string; planned: number; actual: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(state.today, -i);
    out.push({
      date,
      planned: sum(state.sessions.filter((s) => s.date === date).map(dur)),
      actual: sum(state.logs.filter((l) => l.date === date).map((l) => l.minutes)),
    });
  }
  return out;
}

export interface ExamRow {
  exam: Exam;
  subject: Subject | undefined;
  date: string;
  label: string;
  time: string | null;
  days: number;
  readiness: number;
  status: "On track" | "Needs attention" | "At risk";
  scheduled: Session[];
}

/** Each upcoming sitting, soonest first, with a rough readiness score. */
export function examRows(state: AppState, includePast = false): ExamRow[] {
  const subjects = subjectMap(state);
  const rows: ExamRow[] = [];
  for (const exam of state.exams) {
    const topicPct = exam.topics.length ? exam.topics.filter((t) => t.done).length / exam.topics.length : null;
    const felt = ((exam.preparedness - 1) / 4) * 0.6 + ((exam.confidence - 1) / 4) * 0.4;
    const readiness = Math.round((topicPct === null ? felt : topicPct * 0.6 + felt * 0.4) * 100);
    for (const d of exam.dates) {
      const days = diffDays(state.today, d.date);
      if (days < 0 && !includePast) continue;
      const expected = days >= 21 ? 20 : days >= 10 ? 40 : days >= 4 ? 60 : 75;
      rows.push({
        exam,
        subject: subjects.get(exam.subjectId),
        date: d.date,
        label: d.label,
        time: d.time,
        days,
        readiness,
        status: readiness >= expected ? "On track" : readiness >= expected - 25 ? "Needs attention" : "At risk",
        scheduled: state.sessions.filter((s) => s.examId === exam.id && s.status === "planned" && s.date <= d.date).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Plain-language observations worked out from the numbers. Always available, no AI needed. */
export function insights(state: AppState): { tone: "good" | "warn" | "info"; text: string }[] {
  const out: { tone: "good" | "warn" | "info"; text: string }[] = [];
  const week = weekStats(state, state.today);
  const start = week.start;

  const behind = activeSubjects(state)
    .map((subject) => {
      const due = sum(state.sessions.filter((s) => s.subjectId === subject.id && s.date >= start && s.date < state.today).map(dur));
      const done = sum(state.logs.filter((l) => l.subjectId === subject.id && l.date >= start && l.date <= state.today).map((l) => l.minutes));
      return { subject, gap: due - done };
    })
    .filter((r) => r.gap >= 30)
    .sort((a, b) => b.gap - a.gap);
  if (behind.length) {
    out.push({ tone: "warn", text: `You are ${fmtDuration(behind[0].gap)} behind on ${behind[0].subject.name} this week${behind[1] ? `, and ${fmtDuration(behind[1].gap)} behind on ${behind[1].subject.name}` : ""}. The plan has already spread that time over the days you have left.` });
  } else if (week.actual > 0) {
    out.push({ tone: "good", text: "You are keeping up with everything planned so far this week." });
  }

  const from = addDays(state.today, -13);
  const recent = activeSubjects(state)
    .map((subject) => ({ subject, mins: sum(state.logs.filter((l) => l.subjectId === subject.id && l.date >= from).map((l) => l.minutes)) }))
    .sort((a, b) => b.mins - a.mins);
  if (recent.length >= 2 && recent[0].mins > 0) {
    const least = recent[recent.length - 1];
    out.push({ tone: "info", text: `Over the last two weeks ${recent[0].subject.name} got the most of your time (${fmtDuration(recent[0].mins)}) and ${least.subject.name} the least (${least.mins ? fmtDuration(least.mins) : "none"}).` });
  }

  const next = examRows(state)[0];
  if (next) {
    const open = next.exam.topics.filter((t) => !t.done).length;
    out.push({
      tone: next.status === "On track" ? "good" : "warn",
      text: `${next.exam.name} is ${next.days === 0 ? "today" : next.days === 1 ? "tomorrow" : `in ${next.days} days`}${open ? ` with ${open} topic${open > 1 ? "s" : ""} still to revise` : ""}. ${next.scheduled.length ? `${next.scheduled.length} revision session${next.scheduled.length > 1 ? "s are" : " is"} lined up before it.` : "No revision is scheduled for it yet."}`,
    });
  }

  const lastWeek = weekStats(state, addDays(start, -7));
  if (lastWeek.missed >= 2) out.push({ tone: "warn", text: `You missed ${lastWeek.missed} sessions last week. If the plan feels too heavy, lower your weekly target in Settings so it stays achievable.` });
  if (!state.sessions.some((s) => s.status === "planned")) out.push({ tone: "info", text: "Nothing is scheduled yet. Open the Study Planner and generate a plan." });
  return out;
}
