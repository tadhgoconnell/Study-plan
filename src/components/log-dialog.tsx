"use client";

import { useEffect, useState } from "react";
import type { StudyLog } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import { activeSubjects } from "@/lib/stats";
import { useApp, useStore } from "./store";
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from "./ui";

export type LogTarget = { log: StudyLog } | { create: true } | null;

/** Record study that actually happened, planned or not. */
export function LogDialog({ target, onClose }: { target: LogTarget; onClose: () => void }) {
  const state = useApp();
  const { run, busy } = useStore();
  const subjects = activeSubjects(state);
  const existing = target && "log" in target ? target.log : null;
  const [mode, setMode] = useState<"duration" | "times">("duration");
  const [f, setF] = useState({ subjectId: "", date: state.today, minutes: "45", start: "", end: "", description: "", sessionId: "auto", completedTask: "unset", productivity: "0", notes: "" });

  useEffect(() => {
    if (!target) return;
    if (existing) {
      setMode(existing.start && existing.end ? "times" : "duration");
      setF({
        subjectId: existing.subjectId, date: existing.date, minutes: String(existing.minutes), start: existing.start ?? "", end: existing.end ?? "", description: existing.description,
        sessionId: existing.sessionId ?? "none", completedTask: existing.completedTask === null ? "unset" : existing.completedTask ? "yes" : "no", productivity: String(existing.productivity ?? 0), notes: existing.notes,
      });
    } else {
      setMode("duration");
      setF({ subjectId: subjects[0]?.id ?? "", date: state.today, minutes: "45", start: "", end: "", description: "", sessionId: "auto", completedTask: "unset", productivity: "0", notes: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const candidates = state.sessions.filter((s) => s.subjectId === f.subjectId && s.date === f.date);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      id: existing?.id,
      subjectId: f.subjectId,
      date: f.date,
      description: f.description,
      notes: f.notes,
      completedTask: f.completedTask === "unset" ? null : f.completedTask === "yes",
      productivity: Number(f.productivity) || null,
      ...(mode === "times" ? { start: f.start, end: f.end, minutes: null } : { minutes: Number(f.minutes), start: null, end: null }),
    };
    if (f.sessionId !== "auto") payload.sessionId = f.sessionId === "none" ? null : f.sessionId;
    const res = await run("log.save", payload, { success: existing ? "Log updated." : "Study logged." });
    if (res.ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={existing ? "Edit study log" : "Log study time"}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => set("subjectId", e.target.value)} required>
              {!subjects.some((s) => s.id === f.subjectId) && <option value={f.subjectId}>Choose…</option>}
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Date"><Input type="date" max={state.today} value={f.date} onChange={(e) => set("date", e.target.value)} required /></Field>
        </div>
        <div>
          <Segmented label="How to enter the time" value={mode} onChange={setMode} options={[{ value: "duration", label: "Total duration" }, { value: "times", label: "Start and end" }]} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {mode === "duration" ? (
              <Field label="Minutes studied"><Input type="number" inputMode="numeric" min={1} max={960} value={f.minutes} onChange={(e) => set("minutes", e.target.value)} required /></Field>
            ) : (
              <>
                <Field label="Start"><Input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} required /></Field>
                <Field label="End"><Input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} required /></Field>
              </>
            )}
          </div>
        </div>
        <Field label="What did you study?"><Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Past paper questions on respiration" maxLength={300} /></Field>
        <Field label="Counts towards" hint="Linking a log to a planned session lets the planner see exactly what was done and what is left.">
          <Select value={f.sessionId} onChange={(e) => set("sessionId", e.target.value)}>
            {!existing && <option value="auto">Match automatically</option>}
            <option value="none">Extra study, not in the plan</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.date)} {s.start}–{s.end}: {s.task}</option>)}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Finished the planned task?">
            <Select value={f.completedTask} onChange={(e) => set("completedTask", e.target.value)}>
              <option value="unset">Not sure / no planned task</option><option value="yes">Yes, completed</option><option value="no">No, not finished</option>
            </Select>
          </Field>
          <Field label="How productive was it?">
            <Select value={f.productivity} onChange={(e) => set("productivity", e.target.value)}>
              <option value="0">Skip</option><option value="1">1 · Struggled to focus</option><option value="2">2 · Below par</option><option value="3">3 · Fine</option><option value="4">4 · Good</option><option value="5">5 · Excellent</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering about this session" maxLength={1000} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || !f.subjectId}>{existing ? "Save changes" : "Log it"}</Button>
        </div>
      </form>
    </Modal>
  );
}
