import type { PlanInput } from "../types";
import { DAY_NAMES, addDays, fmtDate, toMin, weekStart, weekday } from "../time";
import { horizon } from "../engine";

/** A compact, complete picture of the student's academic life for Claude. */
export function snapshot(input: PlanInput) {
  const name = (id: string | null) => input.subjects.find((s) => s.id === id)?.name ?? null;
  const ws = weekStart(input.today);
  const end = horizon(input.today).at(-1)!;
  const from = addDays(input.today, -10);
  const mins = (s: { start: string; end: string }) => toMin(s.end) - toMin(s.start);
  const thisWeek = input.subjects
    .filter((s) => !s.archived)
    .map((s) => {
      const sessions = input.sessions.filter((x) => x.subjectId === s.id && x.date >= ws && x.date <= addDays(ws, 6));
      return {
        subject: s.name,
        plannedMinutes: sessions.reduce((n, x) => n + mins(x), 0),
        studiedMinutes: input.logs.filter((l) => l.subjectId === s.id && l.date >= ws && l.date <= addDays(ws, 6)).reduce((n, l) => n + l.minutes, 0),
        missedSessions: sessions.filter((x) => x.status === "missed").length,
        stillToDoMinutes: sessions.filter((x) => x.status === "planned").reduce((n, x) => n + mins(x), 0),
      };
    });
  return {
    now: { date: input.today, weekday: DAY_NAMES[weekday(input.today)], time: input.nowTime, readable: fmtDate(input.today, { year: true }) },
    planningWindowEnds: end,
    preferences: input.settings,
    subjects: input.subjects.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name, attention: ["light", "normal", "extra"][s.priority - 1], confidence1to5: s.confidence })),
    weeklyTimetable: DAY_NAMES.map((day, i) => ({
      day,
      entries: input.timetable.filter((e) => e.day === i).map((e) => `${e.start}-${e.end} ${e.type}: ${e.title}${e.location ? ` (${e.location})` : ""}`),
    })),
    availabilityChanges: input.overrides.filter((o) => o.date >= input.today).map((o) => ({ id: o.id, date: o.date, type: o.type, start: o.start, end: o.end, note: o.note })),
    exams: input.exams.map((e) => ({
      id: e.id, name: e.name, subject: name(e.subjectId), format: e.format, confidence1to5: e.confidence, preparedness1to5: e.preparedness, notes: e.notes,
      dates: e.dates.map((d) => ({ date: d.date, time: d.time, label: d.label })),
      topics: e.topics.map((t) => ({ id: t.id, name: t.name, done: t.done })),
    })),
    sessions: input.sessions
      .filter((s) => s.date >= from && s.date <= end)
      .map((s) => ({ id: s.id, date: s.date, day: DAY_NAMES[weekday(s.date)].slice(0, 3), start: s.start, end: s.end, subject: name(s.subjectId), status: s.status, task: s.task, method: s.method, priority: s.priority, placedByHand: s.pinned })),
    studyLog: input.logs
      .filter((l) => l.date >= addDays(input.today, -14))
      .map((l) => ({ date: l.date, subject: name(l.subjectId), minutes: l.minutes, what: l.description, forPlannedSession: l.sessionId, productivity1to5: l.productivity, notes: l.notes })),
    thisWeek,
  };
}
