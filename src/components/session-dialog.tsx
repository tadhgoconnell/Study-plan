"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { METHODS, type Session } from "@/lib/types";
import { fmtDate, fmtDuration, fromMin, toMin } from "@/lib/time";
import { activeSubjects, dur, subjectMap } from "@/lib/stats";
import { useApp, useStore } from "./store";
import { Badge, Button, Field, Input, Modal, Select, SubjectChip, Textarea, useConfirm, type Tone } from "./ui";

export const STATUS: Record<Session["status"], { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "grape" },
  completed: { label: "Completed", tone: "mint" },
  partial: { label: "Partly done", tone: "sun" },
  missed: { label: "Missed", tone: "coral" },
};
export const PRIORITY: Record<Session["priority"], { label: string; tone: Tone }> = {
  high: { label: "High priority", tone: "coral" },
  medium: { label: "Medium priority", tone: "sun" },
  low: { label: "Low priority", tone: "gray" },
};

export type SessionTarget = { session: Session } | { create: { date: string; start?: string } } | null;

interface Draft {
  subjectId: string;
  date: string;
  start: string;
  end: string;
  task: string;
  method: string;
  priority: Session["priority"];
  kind: Session["kind"];
  notes: string;
}

/** View, complete, miss, edit, move or delete a study session; also creates new ones. */
export function SessionDialog({ target, onClose }: { target: SessionTarget; onClose: () => void }) {
  const state = useApp();
  const { run, busy } = useStore();
  const { confirm, dialog } = useConfirm();
  const subjects = activeSubjects(state);
  const session = target && "session" in target ? (state.sessions.find((s) => s.id === target.session.id) ?? null) : null;
  const creating = target && "create" in target ? target.create : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    setEditing(!!creating);
    setMinutes("");
    if (creating) {
      const start = creating.start ?? "17:00";
      setDraft({ subjectId: subjects[0]?.id ?? "", date: creating.date, start, end: fromMin(Math.min(1439, toMin(start) + state.settings.sessionMinutes)), task: "", method: METHODS[0], priority: "medium", kind: "study", notes: "" });
    } else if (session) {
      setDraft({ subjectId: session.subjectId, date: session.date, start: session.start, end: session.end, task: session.task, method: session.method, priority: session.priority, kind: session.kind, notes: session.notes });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target || (!session && !creating)) return null;
  const subject = session ? subjectMap(state).get(session.subjectId) : null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const logged = session ? state.logs.filter((l) => l.sessionId === session.id).reduce((n, l) => n + l.minutes, 0) : 0;
  const exam = session?.examId ? state.exams.find((e) => e.id === session.examId) : null;
  const canFinish = session && session.status === "planned" && session.date <= state.today;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const res = await run("session.save", { ...draft, id: session?.id }, { success: session ? "Session updated." : "Session added." });
    if (res.ok) onClose();
  };
  const mark = async (status: "completed" | "missed" | "planned") => {
    const res = await run("session.status", { id: session!.id, status, minutes: status === "completed" && minutes ? Number(minutes) : undefined }, { success: status === "completed" ? "Nice work. Session logged." : status === "missed" ? "Marked as missed." : "Session reopened." });
    if (res.ok) onClose();
  };
  const remove = async () => {
    if (!(await confirm("Delete this session?", "It will be removed from your plan. Your study history is not affected."))) return;
    const res = await run("session.delete", { id: session!.id });
    if (res.ok) onClose();
  };

  return (
    <>
      <Modal open onClose={onClose} title={creating ? "Add a study session" : editing ? "Edit session" : "Study session"}>
        {editing && draft ? (
          <form onSubmit={save} className="space-y-4">
            <Field label="Subject">
              <Select value={draft.subjectId} onChange={(e) => set("subjectId", e.target.value)} required>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Date" className="col-span-2 sm:col-span-1"><Input type="date" min={state.today} value={draft.date} onChange={(e) => set("date", e.target.value)} required /></Field>
              <Field label="Start"><Input type="time" value={draft.start} onChange={(e) => set("start", e.target.value)} required /></Field>
              <Field label="End"><Input type="time" value={draft.end} onChange={(e) => set("end", e.target.value)} required /></Field>
            </div>
            <Field label="Task or topic"><Input value={draft.task} onChange={(e) => set("task", e.target.value)} placeholder="e.g. Exam-style questions on enzymes" maxLength={200} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Study method">
                <Select value={draft.method} onChange={(e) => set("method", e.target.value)}>
                  {[...new Set([...METHODS, draft.method].filter(Boolean))].map((m) => <option key={m}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={draft.priority} onChange={(e) => set("priority", e.target.value as Draft["priority"])}>
                  <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </Select>
              </Field>
            </div>
            <Field label="Notes"><Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} /></Field>
            <p className="text-xs text-ink-mute">Sessions you place yourself are kept where you put them; the planner works around them.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => (creating ? onClose() : setEditing(false))}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busy || !draft.subjectId}>{session ? "Save changes" : "Add session"}</Button>
            </div>
          </form>
        ) : session ? (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SubjectChip subject={subject} className="text-lg" />
                <Badge tone={STATUS[session.status].tone}>{STATUS[session.status].label}</Badge>
                <Badge tone={PRIORITY[session.priority].tone}>{PRIORITY[session.priority].label}</Badge>
              </div>
              <p className="mt-2 text-xl font-extrabold leading-snug">{session.task || "Study session"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="font-bold text-ink-mute">Date</dt><dd className="font-extrabold">{fmtDate(session.date, { year: true })}</dd></div>
              <div><dt className="font-bold text-ink-mute">Time</dt><dd className="font-extrabold">{session.start}–{session.end} · {fmtDuration(dur(session))}</dd></div>
              <div><dt className="font-bold text-ink-mute">Study method</dt><dd className="font-extrabold">{session.method || "Your choice"}</dd></div>
              <div><dt className="font-bold text-ink-mute">Placed by</dt><dd className="font-extrabold">{session.pinned ? "You (fixed)" : session.origin === "claude" ? "Claude" : "The planner"}</dd></div>
              {exam && <div className="col-span-2"><dt className="font-bold text-ink-mute">Preparing for</dt><dd className="font-extrabold">{exam.name}</dd></div>}
              {session.status !== "planned" && <div className="col-span-2"><dt className="font-bold text-ink-mute">Time logged</dt><dd className="font-extrabold">{logged ? `${fmtDuration(logged)} of ${fmtDuration(dur(session))}` : "None"}</dd></div>}
              {session.notes && <div className="col-span-2"><dt className="font-bold text-ink-mute">Notes</dt><dd className="whitespace-pre-wrap">{session.notes}</dd></div>}
            </dl>

            {canFinish && (
              <div className="clay-inset p-4">
                <p className="text-sm font-extrabold">Did you do it?</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Minutes studied" className="w-36">
                    <Input type="number" inputMode="numeric" min={1} max={600} placeholder={String(dur(session))} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  </Field>
                  <Button variant="primary" onClick={() => mark("completed")} disabled={busy}><Check size={18} strokeWidth={3} /> Mark completed</Button>
                  <Button variant="danger" onClick={() => mark("missed")} disabled={busy}><X size={18} strokeWidth={3} /> Missed</Button>
                </div>
                <p className="mt-2 text-xs text-ink-mute">Leave minutes empty to log the full planned time. Studied less? Enter the real number and the planner will make up the rest later in the week.</p>
              </div>
            )}
            {session.status === "planned" && session.date > state.today && <p className="text-sm text-ink-mute">This session is in the future. You can mark it completed or missed on the day.</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {session.status === "planned" ? (
                <>
                  <Button variant="danger" onClick={remove} disabled={busy}><Trash2 size={16} strokeWidth={2.6} /> Delete</Button>
                  <Button onClick={() => setEditing(true)}><Pencil size={16} strokeWidth={2.6} /> Edit or move</Button>
                </>
              ) : session.date >= state.today ? (
                <Button onClick={() => mark("planned")} disabled={busy}><RotateCcw size={16} strokeWidth={2.6} /> Reopen</Button>
              ) : session.status === "missed" ? (
                <Button variant="primary" onClick={() => mark("completed")} disabled={busy}><Check size={18} strokeWidth={3} /> Actually, I did it</Button>
              ) : (
                <Button variant="danger" onClick={() => mark("missed")} disabled={busy}><X size={16} strokeWidth={3} /> Mark as missed instead</Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
      {dialog}
    </>
  );
}
