import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { brief, type PlanMode, type Proposal } from "../engine";
import type { PlanInput } from "../types";
import { METHODS } from "../types";
import { claude, model } from "./client";
import { snapshot } from "./context";
import { UserError } from "../service";

const PlanOutput = z.object({
  sessions: z.array(
    z.object({
      subjectId: z.string(),
      date: z.string(),
      start: z.string(),
      end: z.string(),
      task: z.string(),
      method: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      kind: z.enum(["revision", "homework", "practice", "study"]),
      examId: z.string().nullable(),
      topicId: z.string().nullable(),
    }),
  ),
  summary: z.string(),
  recommendations: z.array(z.string()),
});

const PLAN_SYSTEM = `You design study sessions for one secondary-school student inside a study planner app.

The app's scheduler has already worked out the hard constraints: when the student is free, how many minutes each day can realistically hold, and how many minutes each subject still needs each week. Your job is the part that needs judgement: which topic goes where, in what order, with which study method, so that the week makes sense as a revision programme.

How your output is used: every session you return is checked by the app. A session is dropped if it falls outside a listed free window, overlaps another session, pushes a day past its budget, or gives a subject much more time than it needs. Anything you leave out is filled in automatically with generic sessions, so a complete, valid answer is what makes the plan good.

Guidance:
- Place sessions only inside "freeWindows" for that date, using HH:MM 24-hour times on 5-minute marks. Leave at least the student's break length between sessions, and avoid more than two sessions back to back.
- Aim for each subject's "minutes" need per week (within about 15 minutes) and stay within each day's "budgetMinutes". Spread work across days rather than stacking it.
- Sessions should usually be the student's preferred length, never longer than their maximum.
- For subjects with an exam coming, build a progression: understanding and summarising first, then active recall and flashcards, then exam-style questions, with timed past papers in the last few days and only a light review the evening before. Never schedule revision for an exam on or after its date.
- Give each session one concrete, specific task ("Exam-style questions on enzymes: rate graphs and inhibitors"), drawn from the exam's unfinished topics where there are any. Set examId and topicId when the session is for a listed exam or topic; otherwise null.
- Subjects without an exam still need a balance of homework, review of recent classes and independent practice.
- Use these study methods: ${METHODS.join(", ")}.
- "summary" is one or two plain sentences for the student about the shape of the plan. "recommendations" are three to five short, specific pieces of advice based on their actual data (what they are behind on, what is going well, how to approach the nearest exam). Write to the student directly as "you".`;

export async function proposePlan(input: PlanInput, mode: PlanMode, guidance?: string): Promise<{ proposals: Proposal[]; summary: string; recommendations: string[] }> {
  const b = brief(input, mode);
  const snap = snapshot(input);
  const subjectName = (id: string) => input.subjects.find((s) => s.id === id)?.name;
  const payload = {
    now: snap.now,
    preferences: { sessionMinutes: input.settings.sessionMinutes, maxSessionMinutes: input.settings.maxSessionMinutes, breakMinutes: input.settings.breakMinutes },
    subjects: snap.subjects,
    exams: snap.exams,
    recentStudy: snap.studyLog,
    thisWeekSoFar: snap.thisWeek,
    sessionsAlreadyFixed: b.keptSessions.map((s) => ({ date: s.date, start: s.start, end: s.end, subject: subjectName(s.subjectId), task: s.task })),
    days: b.days,
    needs: b.weeks.map((w) => ({ weekStarting: w.weekStart, subjects: w.needs.map((n) => ({ subjectId: n.subjectId, subject: subjectName(n.subjectId), minutes: n.minutes, why: n.reason })) })),
  };
  const response = await claude().messages.parse({
    model: model(),
    max_tokens: 16000,
    system: PLAN_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${guidance ? `The student asked for this in particular: ${guidance}\n\n` : ""}Here is the planning data as JSON. Design the sessions.\n\n${JSON.stringify(payload)}`,
      },
    ],
    output_config: { format: zodOutputFormat(PlanOutput) },
  });
  if (response.stop_reason === "refusal") throw new UserError("Claude declined to generate this plan. The built-in planner was used instead.");
  const out = response.parsed_output;
  if (!out) throw new UserError("Claude's plan could not be read. The built-in planner was used instead.");
  return { proposals: out.sessions, summary: out.summary.trim(), recommendations: out.recommendations.map((r) => r.trim()).filter(Boolean).slice(0, 6) };
}

const InsightOutput = z.object({ recommendations: z.array(z.string()) });

export async function proposeInsights(input: PlanInput): Promise<string[]> {
  const response = await claude().messages.parse({
    model: model(),
    max_tokens: 4000,
    system:
      "You are the study coach inside a student's planner app. From their data, write three to five short recommendations (one or two sentences each). Be specific to the numbers and dates you can see: where they are behind, which exam needs attention first, what is going well, and one concrete change to how they study. Address the student as \"you\". No headings, no generic study tips.",
    messages: [{ role: "user", content: JSON.stringify(snapshot(input)) }],
    output_config: { format: zodOutputFormat(InsightOutput) },
  });
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || !out) throw new UserError("Claude could not produce recommendations just now. Try again in a moment.");
  return out.recommendations.map((r) => r.trim()).filter(Boolean).slice(0, 6);
}
