import { describe, expect, it } from "vitest";
import { busyIntervals, horizon, plan, studyWindows, subjectWeight } from "@/lib/engine";
import { sampleData } from "@/lib/sample";
import type { PlanInput, Session } from "@/lib/types";
import { addDays, overlaps, toMin, weekday } from "@/lib/time";

const TODAY = "2026-11-16"; // a Monday
const fresh = () => sampleData(TODAY, "08:00");
let n = 0;
/** Apply a plan result the way the server does. */
function apply(input: PlanInput, mode: "rebalance" | "regenerate" = "rebalance") {
  const r = plan(input, mode);
  const gone = new Set(r.remove.map((s) => s.id));
  input.sessions = [
    ...input.sessions.filter((s) => !gone.has(s.id)),
    ...r.add.map((a): Session => ({ ...a, id: `new${++n}`, status: "planned", origin: "planner", pinned: false, notes: "" })),
  ];
  return r;
}
const span = (s: { start: string; end: string }) => ({ start: toMin(s.start), end: toMin(s.end) });
const mins = (list: { start: string; end: string }[]) => list.reduce((t, s) => t + toMin(s.end) - toMin(s.start), 0);
const upcoming = (i: PlanInput) => i.sessions.filter((s) => s.status === "planned");
const subject = (i: PlanInput, name: string) => i.subjects.find((s) => s.name === name)!;

describe("planning engine", () => {
  it("builds a plan that never overlaps classes, commitments or itself", () => {
    const input = fresh();
    apply(input, "regenerate");
    const planned = upcoming(input);
    expect(planned.length).toBeGreaterThan(8);
    for (const s of planned) {
      for (const b of busyIntervals(input, s.date)) expect(overlaps(b, span(s)), `${s.date} ${s.start} vs ${b.label}`).toBe(false);
      for (const o of planned) if (o !== s && o.date === s.date) expect(overlaps(span(o), span(s))).toBe(false);
      expect(studyWindows(input, s.date).some((w) => w.start <= toMin(s.start) && w.end >= toMin(s.end))).toBe(true);
    }
  });

  it("keeps every day and the week achievable", () => {
    const input = fresh();
    apply(input, "regenerate");
    for (const d of horizon(TODAY)) {
      const limit = weekday(d) >= 5 ? input.settings.maxWeekendMinutes : input.settings.maxWeekdayMinutes;
      expect(mins(upcoming(input).filter((s) => s.date === d))).toBeLessThanOrEqual(limit + 20);
    }
    const week1 = mins(upcoming(input).filter((s) => s.date <= addDays(TODAY, 6)));
    expect(week1).toBeLessThanOrEqual(input.settings.weeklyTargetHours * 60 * 1.2 + 30);
    expect(week1).toBeGreaterThan(input.settings.weeklyTargetHours * 60 * 0.6);
  });

  it("never touches history", () => {
    const input = fresh();
    const before = JSON.stringify(input.sessions.filter((s) => s.status !== "planned"));
    apply(input, "regenerate");
    apply(input);
    expect(JSON.stringify(input.sessions.filter((s) => s.status !== "planned"))).toBe(before);
    expect(input.logs.length).toBeGreaterThan(0);
  });

  it("is stable: planning twice with no new information changes nothing", () => {
    const input = fresh();
    apply(input, "regenerate");
    const again = apply(input);
    expect(again.add).toHaveLength(0);
    expect(again.remove).toHaveLength(0);
  });

  it("gives an imminent exam more time, concentrated before the exam", () => {
    const input = fresh();
    apply(input, "regenerate");
    const bio = subject(input, "Biology");
    const hist = subject(input, "History");
    const examDate = addDays(TODAY, 5);
    const week = upcoming(input).filter((s) => s.date <= addDays(TODAY, 6));
    const bioBefore = mins(week.filter((s) => s.subjectId === bio.id && s.date < examDate));
    expect(bioBefore).toBeGreaterThan(mins(week.filter((s) => s.subjectId === hist.id)) * 2);
    expect(week.some((s) => s.subjectId === bio.id && s.method === "Past papers")).toBe(true);
    // Other subjects are not abandoned.
    for (const s of input.subjects) expect(mins(week.filter((x) => x.subjectId === s.id)), s.name).toBeGreaterThanOrEqual(25);
    // Once the exam has passed the pull drops back.
    expect(subjectWeight(input, bio, addDays(examDate, 1))).toBeLessThan(subjectWeight(input, bio, TODAY) / 1.5);
  });

  it("spreads a missed session across the week instead of dumping it on the next day", () => {
    const input = fresh();
    apply(input, "regenerate");
    const day1 = upcoming(input).filter((s) => s.date === TODAY);
    expect(day1.length).toBeGreaterThan(0);
    for (const s of day1) s.status = "missed";
    input.today = addDays(TODAY, 1);
    const tuesdayBefore = mins(upcoming(input).filter((s) => s.date === input.today));
    const r = apply(input);
    const tuesdayAfter = mins(upcoming(input).filter((s) => s.date === input.today));
    expect(r.add.length).toBeGreaterThan(0);
    expect(tuesdayAfter - tuesdayBefore).toBeLessThan(mins(day1));
    expect(tuesdayAfter).toBeLessThanOrEqual(input.settings.maxWeekdayMinutes + 20);
  });

  it("eases off a subject after extra study", () => {
    const input = fresh();
    apply(input, "regenerate");
    const eng = subject(input, "English");
    const before = mins(upcoming(input).filter((s) => s.subjectId === eng.id && s.date <= addDays(TODAY, 6)));
    input.logs.push({ id: "x", subjectId: eng.id, date: TODAY, start: null, end: null, minutes: 180, description: "", sessionId: null, completedTask: null, productivity: null, notes: "" });
    apply(input);
    const after = mins(upcoming(input).filter((s) => s.subjectId === eng.id && s.date <= addDays(TODAY, 6)));
    expect(after).toBeLessThan(before);
  });

  it("clears a day off and moves that work elsewhere, keeping pinned sessions otherwise", () => {
    const input = fresh();
    apply(input, "regenerate");
    const sunday = addDays(TODAY, 6);
    const pinned = upcoming(input).find((s) => s.date === addDays(TODAY, 2))!;
    pinned.pinned = true;
    input.overrides.push({ id: "o", date: sunday, type: "off", start: null, end: null, note: "" });
    const r = apply(input);
    expect(upcoming(input).filter((s) => s.date === sunday)).toHaveLength(0);
    expect(input.sessions).toContain(pinned);
    expect(r.notes.join(" ")).toMatch(/day off/);
  });

  it("moves sessions out of the way of a new commitment", () => {
    const input = fresh();
    apply(input, "regenerate");
    const victim = upcoming(input).find((s) => s.date > TODAY)!;
    input.overrides.push({ id: "b", date: victim.date, type: "busy", start: victim.start, end: victim.end, note: "Dentist" });
    const r = apply(input);
    expect(input.sessions.find((s) => s.id === victim.id)).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/Dentist/);
    for (const s of upcoming(input)) for (const b of busyIntervals(input, s.date)) expect(overlaps(b, span(s))).toBe(false);
  });
});
