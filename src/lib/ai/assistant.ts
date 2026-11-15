import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getDb } from "../db";
import {
  UserError,
  adapt,
  deleteExam,
  deleteOverride,
  deleteSession,
  explain,
  moveSession,
  resolveSubject,
  saveExam,
  saveLog,
  saveOverride,
  saveSession,
  saveSettings,
  saveSubject,
  setSessionStatus,
  type ActionResult,
} from "../service";
import { loadChat, loadInput, saveChat, setSetting } from "../store";
import { fmtDate, fmtDuration } from "../time";
import { aiProblem, claude, model } from "./client";
import { snapshot } from "./context";
import { proposeInsights, proposePlan } from "./plan";

/**
 * The study assistant. Claude never edits the database directly: it calls the
 * tools below, each of which runs the same validated server action as the
 * matching button in the UI. Invalid requests come back to Claude as errors it
 * can correct, and nothing is saved unless validation passes.
 */

const SYSTEM = `You are the study assistant built into a student's study planner. You are the same intelligence that plans their week, so you can see their timetable, plan, study log and exams, and you can change them with your tools.

How the app works, so your actions fit it:
- The plan covers today through the end of next week. A scheduler keeps it realistic: it never books over classes or commitments, caps each day and week, and weights subjects by exam dates, confidence and how much study has actually been done.
- After most changes you make (logging study, marking a session missed, adding an exam, changing availability, changing a subject's confidence) the scheduler automatically rebalances the upcoming plan and tells you what it changed in the tool result. You do not need to move sessions yourself for those; only use edit_sessions when the student wants something specific, or to fine-tune after a rebalance.
- Completed, partial and missed sessions are history and cannot be edited or removed. Only future planned sessions can change.
- Sessions you add or move with edit_sessions are treated as fixed choices that the scheduler will plan around.

Working with the student:
- When they tell you something happened or will happen ("I didn't study Maths today", "I did two extra hours of Biology", "Chemistry test next Friday", "I want Sunday off", "I'm free tomorrow afternoon"), record it with the right tool straight away, then tell them what changed. Work out real dates from today's date in the data; say the date you used so they can correct you.
- If a request is ambiguous in a way that changes what gets saved (which exam, which day), ask one short question first. Otherwise make a sensible assumption and state it.
- After changes, explain the significant ones in plain language: what moved or was added, and why. Keep it brief; a short list is fine for several changes.
- When they ask about workload, progress or strategy, answer from their actual data with specific numbers and dates. Be honest when they are behind, and practical about catching up without cramming.
- If a tool returns an error, fix the request if you can or explain the problem simply. Never claim a change was made unless a tool confirmed it.
- Write warmly and directly, like a good tutor. Plain text, no headings. Times in 24-hour format.`;

const str = { type: "string" as const };
const tools: Anthropic.Tool[] = [
  {
    name: "log_study",
    description: "Record study the student actually did, today or in the past. Use this for planned sessions they completed (pass session_id) and for extra or unplanned study. Give either minutes or start and end times. The upcoming plan rebalances afterwards.",
    input_schema: {
      type: "object",
      properties: {
        subject: { ...str, description: "Subject name" },
        date: { ...str, description: "YYYY-MM-DD, today or earlier" },
        minutes: { type: "integer" },
        start: { ...str, description: "HH:MM" },
        end: { ...str, description: "HH:MM" },
        description: { ...str, description: "What was studied" },
        session_id: { ...str, description: "The planned session this counts against, if any. Omit to let the app match it automatically." },
        completed_task: { type: "boolean", description: "Whether the planned task was finished" },
        productivity: { type: "integer", description: "1 (poor) to 5 (excellent)" },
        notes: str,
      },
      required: ["subject", "date"],
    },
  },
  {
    name: "set_session_status",
    description: "Mark a planned session as completed (logs its full planned time unless minutes is given), missed, or back to planned. Use for 'I didn't manage to study X today' (missed) and 'I did my X session' (completed).",
    input_schema: {
      type: "object",
      properties: { session_id: str, status: { type: "string", enum: ["completed", "missed", "planned"] }, minutes: { type: "integer", description: "Minutes actually studied, if different from planned" } },
      required: ["session_id", "status"],
    },
  },
  {
    name: "save_exam",
    description: "Add an exam, test or assessment, or update one (pass id). On update, only the fields you pass change. The plan reprioritises afterwards.",
    input_schema: {
      type: "object",
      properties: {
        id: { ...str, description: "Existing exam id when updating" },
        name: str,
        subject: { ...str, description: "Subject name" },
        dates: { type: "array", items: { type: "object", properties: { date: { ...str, description: "YYYY-MM-DD" }, time: { ...str, description: "HH:MM, optional" }, label: { ...str, description: "e.g. Paper 1" } }, required: ["date"] } },
        topics: { type: "array", items: str, description: "Topics covered" },
        format: str,
        confidence: { type: "integer", description: "1 to 5" },
        preparedness: { type: "integer", description: "1 to 5" },
        notes: str,
      },
    },
  },
  { name: "delete_exam", description: "Remove an exam. Only when the student clearly asks.", input_schema: { type: "object", properties: { id: str }, required: ["id"] } },
  {
    name: "save_subject",
    description: "Add a subject, or change how much attention an existing one gets. Use when the student says they are struggling with a subject (lower confidence and/or attention 3) or finding one easy.",
    input_schema: {
      type: "object",
      properties: { name: str, confidence: { type: "integer", description: "1 (struggling) to 5 (very confident)" }, attention: { type: "integer", description: "1 light, 2 normal, 3 extra time" } },
      required: ["name"],
    },
  },
  {
    name: "set_availability",
    description: "Change availability on one date. type 'off' = no study that day; 'busy' = unavailable between start and end; 'free' = available between start and end even if the timetable says otherwise (e.g. a free afternoon, school closed).",
    input_schema: {
      type: "object",
      properties: { date: { ...str, description: "YYYY-MM-DD" }, type: { type: "string", enum: ["off", "busy", "free"] }, start: { ...str, description: "HH:MM" }, end: { ...str, description: "HH:MM" }, note: str },
      required: ["date", "type"],
    },
  },
  { name: "remove_availability", description: "Remove an availability change by its id.", input_schema: { type: "object", properties: { id: str }, required: ["id"] } },
  {
    name: "edit_sessions",
    description: "Make specific changes to future planned sessions: add, move, update details, or remove. Each operation is validated (no clashes with classes, commitments or other sessions) and applied independently; the result lists which succeeded and why any failed.",
    input_schema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "move", "update", "remove"] },
              session_id: { ...str, description: "For move, update and remove" },
              subject: { ...str, description: "For add" },
              date: { ...str, description: "YYYY-MM-DD" },
              start: { ...str, description: "HH:MM" },
              end: { ...str, description: "HH:MM" },
              task: str,
              method: str,
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["op"],
          },
        },
      },
      required: ["operations"],
    },
  },
  {
    name: "replan",
    description: "Ask the scheduler to rework the upcoming plan. 'rebalance' makes the smallest changes needed (use for catching up or after several edits). 'regenerate' rebuilds every future session that was not placed by hand (use when the student asks to reorganise the rest of the week from scratch). Optional guidance describes what the student wants from the new plan.",
    input_schema: { type: "object", properties: { mode: { type: "string", enum: ["rebalance", "regenerate"] }, guidance: str }, required: ["mode"] },
  },
  {
    name: "update_preferences",
    description: "Change standing preferences when the student says they generally have more or less time: weekly target hours, daily limits, study hours, session length, or weekly rest days (0 = Monday ... 6 = Sunday).",
    input_schema: {
      type: "object",
      properties: {
        weeklyTargetHours: { type: "number" },
        maxWeekdayMinutes: { type: "integer" },
        maxWeekendMinutes: { type: "integer" },
        weekdayStart: str,
        weekdayEnd: str,
        weekendStart: str,
        weekendEnd: str,
        sessionMinutes: { type: "integer" },
        restDays: { type: "array", items: { type: "integer" } },
      },
    },
  },
];

const obj = z.record(z.string(), z.unknown());

function report(r: ActionResult, done: string) {
  return JSON.stringify({
    ok: true,
    done,
    note: r.message,
    planChange: r.change ? { summary: r.change.summary, details: r.change.items } : "The upcoming plan did not need to change.",
  });
}

/** Run one tool call. Returns the text for Claude and a short line for the chat UI. */
async function runTool(tz: string | null, name: string, raw: unknown): Promise<{ result: string; action: string }> {
  const a = obj.parse(raw ?? {});
  switch (name) {
    case "log_study": {
      const r = await saveLog(tz, { subject: a.subject, date: a.date, minutes: a.minutes, start: a.start, end: a.end, description: a.description ?? "", sessionId: a.session_id, completedTask: a.completed_task, productivity: a.productivity, notes: a.notes ?? "" });
      const action = `Logged ${a.minutes ? fmtDuration(Number(a.minutes)) : `${a.start}–${a.end}`} of ${a.subject}`;
      return { result: report(r, action), action };
    }
    case "set_session_status": {
      const r = await setSessionStatus(tz, { id: a.session_id, status: a.status, minutes: a.minutes });
      const action = `Marked a session as ${a.status}`;
      return { result: report(r, action), action };
    }
    case "save_exam": {
      const db = await getDb();
      const existing = a.id ? (await loadInput(db, tz)).exams.find((e) => e.id === a.id) : null;
      if (a.id && !existing) throw new UserError("No exam has that id.");
      const names = Array.isArray(a.topics) ? (a.topics as unknown[]).map(String) : null;
      const payload = {
        id: existing?.id,
        name: a.name ?? existing?.name,
        subject: a.subject,
        subjectId: a.subject ? undefined : existing?.subjectId,
        format: a.format ?? existing?.format ?? "",
        confidence: a.confidence ?? existing?.confidence ?? 3,
        preparedness: a.preparedness ?? existing?.preparedness ?? 3,
        notes: a.notes ?? existing?.notes ?? "",
        dates: a.dates ?? existing?.dates,
        topics: names
          ? names.map((n) => existing?.topics.find((t) => t.name.toLowerCase() === n.toLowerCase()) ?? { name: n, done: false })
          : (existing?.topics ?? []),
      };
      if (!payload.subject && !payload.subjectId) throw new UserError("Which subject is this exam for?");
      const r = await saveExam(tz, payload);
      const action = `${existing ? "Updated" : "Added"} exam: ${payload.name}`;
      return { result: report(r, action), action };
    }
    case "delete_exam": {
      const r = await deleteExam(tz, { id: a.id });
      return { result: report(r, "Exam removed"), action: "Removed an exam" };
    }
    case "save_subject": {
      const db = await getDb();
      const subjects = (await loadInput(db, tz)).subjects;
      const existing = subjects.find((s) => s.name.toLowerCase() === String(a.name ?? "").trim().toLowerCase() && !s.archived);
      const r = await saveSubject(tz, { id: existing?.id, name: existing?.name ?? a.name, priority: a.attention ?? existing?.priority ?? 2, confidence: a.confidence ?? existing?.confidence ?? 3 });
      const action = existing ? `Updated ${existing.name}` : `Added subject: ${a.name}`;
      return { result: report(r, action), action };
    }
    case "set_availability": {
      const r = await saveOverride(tz, { date: a.date, type: a.type, start: a.start, end: a.end, note: a.note ?? "" });
      const what = { off: "Day off", busy: "Busy", free: "Free time" }[String(a.type)] ?? "Availability";
      const action = `${what} on ${fmtDate(String(a.date))}${a.start ? ` ${a.start}–${a.end}` : ""}`;
      return { result: report(r, action), action };
    }
    case "remove_availability": {
      const r = await deleteOverride(tz, { id: a.id });
      return { result: report(r, "Availability change removed"), action: "Removed an availability change" };
    }
    case "edit_sessions": {
      const ops = z.array(obj).min(1).max(30).parse(a.operations);
      const outcomes: string[] = [];
      let okCount = 0;
      for (const [i, op] of ops.entries()) {
        try {
          if (op.op === "add") {
            await saveSession(tz, { subject: op.subject, date: op.date, start: op.start, end: op.end, task: op.task ?? "", method: op.method ?? "", priority: op.priority ?? "medium" }, "assistant");
          } else if (op.op === "move") {
            await moveSession(tz, { id: op.session_id, date: op.date, start: op.start, end: op.end }, "assistant");
          } else if (op.op === "update") {
            const db = await getDb();
            const s = (await loadInput(db, tz)).sessions.find((x) => x.id === op.session_id);
            if (!s) throw new UserError("No session has that id.");
            const subjectId = op.subject ? await resolveSubject(db, String(op.subject), false) : s.subjectId;
            await saveSession(tz, { id: s.id, subjectId, date: op.date ?? s.date, start: op.start ?? s.start, end: op.end ?? s.end, task: op.task ?? s.task, method: op.method ?? s.method, priority: op.priority ?? s.priority, kind: s.kind, notes: s.notes }, "assistant");
          } else if (op.op === "remove") {
            await deleteSession(tz, { id: op.session_id });
          } else throw new UserError("Unknown operation.");
          okCount++;
          outcomes.push(`#${i + 1} ${op.op}: done`);
        } catch (err) {
          outcomes.push(`#${i + 1} ${op.op}: FAILED - ${explain(err).message}`);
        }
      }
      return { result: JSON.stringify({ ok: okCount > 0, outcomes }), action: `Edited ${okCount} session${okCount === 1 ? "" : "s"}` };
    }
    case "replan": {
      const mode = a.mode === "regenerate" ? "regenerate" : "rebalance";
      const change = await replan(tz, mode, typeof a.guidance === "string" ? a.guidance : undefined, "The assistant reworked your plan", "assistant");
      return { result: report({ change }, "Replanned"), action: mode === "regenerate" ? "Rebuilt the upcoming plan" : "Rebalanced the plan" };
    }
    case "update_preferences": {
      const r = await saveSettings(tz, a);
      return { result: report(r, "Preferences updated"), action: "Updated your preferences" };
    }
    default:
      throw new UserError(`Unknown tool: ${name}`);
  }
}

/**
 * Rework the plan. When Claude is connected and a full rebuild is wanted, it
 * designs the sessions and the engine validates them; otherwise the engine
 * does the whole job. A Claude failure never blocks planning.
 */
export async function replan(tz: string | null, mode: "rebalance" | "regenerate", guidance: string | undefined, trigger: string, source: "claude" | "assistant" | "planner" = "claude") {
  const db = await getDb();
  const useClaude = mode === "regenerate" && (await import("../store")).aiStatus().configured;
  if (!useClaude) return adapt(tz, trigger, { mode, source: source === "claude" ? "planner" : source });
  try {
    const input = await loadInput(db, tz);
    const ai = await proposePlan(input, mode, guidance);
    if (ai.recommendations.length) await setSetting(db, "insights", { text: ai.recommendations, generatedAt: new Date().toISOString() });
    return adapt(tz, trigger, { mode, proposals: ai.proposals, source, intro: ai.summary });
  } catch (err) {
    return adapt(tz, trigger, { mode, source: "planner", extraNotes: [`${aiProblem(err)} The built-in planner made this plan instead.`] });
  }
}

export async function refreshInsights(tz: string | null): Promise<ActionResult> {
  const db = await getDb();
  const text = await proposeInsights(await loadInput(db, tz));
  await setSetting(db, "insights", { text, generatedAt: new Date().toISOString() });
  return { message: "Recommendations updated." };
}

export type ChatEvent = { t: "text"; v: string } | { t: "action"; v: string } | { t: "error"; v: string } | { t: "done" };

/** One assistant turn: stream text to the UI, run tools on the server, save the exchange. */
export async function chat(tz: string | null, message: string, emit: (e: ChatEvent) => void): Promise<void> {
  const db = await getDb();
  const client = claude();
  const history = await loadChat(db, 16);
  const input = await loadInput(db, tz);
  await saveChat(db, "user", message);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m): Anthropic.MessageParam => ({ role: m.role, content: m.content || "(no text)" })),
    { role: "user", content: `<current_data>\n${JSON.stringify(snapshot(input))}\n</current_data>\n\n${message}` },
  ];
  // The API needs the conversation to open with the student.
  while (messages[0]?.role === "assistant") messages.shift();

  const actions: string[] = [];
  let reply = "";
  try {
    for (let turn = 0; turn < 10; turn++) {
      const stream = client.messages.stream({
        model: model(),
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });
      if (reply && !reply.endsWith("\n")) {
        reply += "\n\n";
        emit({ t: "text", v: "\n\n" });
      }
      stream.on("text", (delta) => {
        reply += delta;
        emit({ t: "text", v: delta });
      });
      const response = await stream.finalMessage();
      if (response.stop_reason === "refusal") {
        emit({ t: "error", v: "Claude declined to answer that. Try rephrasing your request." });
        break;
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!calls.length) break;
      if (response.stop_reason === "max_tokens") {
        emit({ t: "error", v: "That request was too large to finish. Try asking for one change at a time." });
        break;
      }
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      // One at a time: each change may reshape the plan the next one relies on.
      for (const call of calls) {
        try {
          const out = await runTool(tz, call.name, call.input);
          actions.push(out.action);
          emit({ t: "action", v: out.action });
          results.push({ type: "tool_result", tool_use_id: call.id, content: out.result });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: explain(err).message, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    emit({ t: "error", v: aiProblem(err) });
  }
  if (reply.trim() || actions.length) await saveChat(db, "assistant", reply.trim(), actions);
  emit({ t: "done" });
}
