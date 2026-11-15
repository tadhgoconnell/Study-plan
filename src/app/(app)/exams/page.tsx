"use client";

import { useState } from "react";
import { CalendarClock, Check, GraduationCap, Pencil, Plus, Trash2, X } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Scale, Select, SubjectChip, Textarea, cx, useConfirm } from "@/components/ui";
import { activeSubjects, dur, examRows, subjectMap } from "@/lib/stats";
import { addDays, diffDays, fmtDate, fmtDuration } from "@/lib/time";
import type { Exam } from "@/lib/types";

interface Draft {
  id?: string;
  name: string;
  subjectId: string;
  format: string;
  confidence: number;
  preparedness: number;
  notes: string;
  dates: { date: string; time: string; label: string }[];
  topics: string;
}

/** The stages of revision, counted back from the exam date. */
function phases(today: string, examDate: string) {
  const all = [
    { name: "Build understanding", method: "Summarising, flashcards", from: 999, to: 22 },
    { name: "Active recall", method: "Recall from memory, flashcards", from: 21, to: 11 },
    { name: "Practice questions", method: "Exam-style questions by topic", from: 10, to: 6 },
    { name: "Past papers", method: "Timed papers, then mark them", from: 5, to: 2 },
    { name: "Final review", method: "Light recall of weak spots", from: 1, to: 1 },
  ];
  const left = diffDays(today, examDate);
  return all
    .filter((p) => p.to <= left)
    .map((p) => {
      const start = addDays(examDate, -Math.min(p.from, left));
      const end = addDays(examDate, -p.to);
      return { ...p, start, end, current: today >= start && today <= end };
    });
}

export default function ExamsPage() {
  const state = useApp();
  const { run, busy } = useStore();
  const { confirm, dialog } = useConfirm();
  const subjects = activeSubjects(state);
  const byId = subjectMap(state);
  const [draft, setDraft] = useState<Draft | null>(null);
  const rows = examRows(state, true);

  const upcoming = state.exams
    .map((exam) => ({ exam, next: rows.find((r) => r.exam.id === exam.id && r.days >= 0) }))
    .filter((x) => x.next)
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date));
  const past = state.exams.filter((e) => !upcoming.some((u) => u.exam.id === e.id));

  const open = (exam?: Exam) =>
    setDraft(
      exam
        ? { id: exam.id, name: exam.name, subjectId: exam.subjectId, format: exam.format, confidence: exam.confidence, preparedness: exam.preparedness, notes: exam.notes, dates: exam.dates.map((d) => ({ date: d.date, time: d.time ?? "", label: d.label })), topics: exam.topics.map((t) => t.name).join("\n") }
        : { name: "", subjectId: subjects[0]?.id ?? "", format: "", confidence: 3, preparedness: 3, notes: "", dates: [{ date: addDays(state.today, 14), time: "", label: "" }], topics: "" },
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const existing = state.exams.find((x) => x.id === draft.id);
    const names = [...new Set(draft.topics.split("\n").map((t) => t.trim()).filter(Boolean))];
    const res = await run("exam.save", {
      id: draft.id, name: draft.name, subjectId: draft.subjectId, format: draft.format, confidence: draft.confidence, preparedness: draft.preparedness, notes: draft.notes,
      dates: draft.dates.filter((d) => d.date).map((d) => ({ date: d.date, time: d.time || null, label: d.label })),
      topics: names.map((name) => {
        const old = existing?.topics.find((t) => t.name.toLowerCase() === name.toLowerCase());
        return { id: old?.id, name, done: old?.done ?? false };
      }),
    }, { success: "Exam saved." });
    if (res.ok) setDraft(null);
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader title="Exams & Assessments" subtitle="Add what is coming up. Your plan shifts towards each exam as it gets closer, and eases off once it has passed.">
        <Button variant="primary" onClick={() => open()} disabled={!subjects.length}><Plus size={18} strokeWidth={3} /> Add exam</Button>
      </PageHeader>

      {!subjects.length && <Card className="mb-5 bg-sun-soft font-bold text-[#7a5600]">Add a subject in My Timetable first, then you can attach exams to it.</Card>}

      {upcoming.length === 0 ? (
        <Card><Empty icon={<GraduationCap size={28} />} title="No upcoming exams">Add a test or exam with its date and topics, and revision sessions will be planned in the run-up.</Empty></Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
          {upcoming.map(({ exam, next }) => {
            const row = next!;
            const subject = byId.get(exam.subjectId);
            const done = exam.topics.filter((t) => t.done).length;
            const plan = phases(state.today, row.date);
            return (
              <Card key={exam.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SubjectChip subject={subject} className="text-sm" />
                    <h2 className="mt-0.5 text-xl leading-tight">{exam.name}</h2>
                    {exam.format && <p className="mt-0.5 text-sm text-ink-soft">{exam.format}</p>}
                  </div>
                  <div className="clay-sm shrink-0 rounded-2xl bg-coral-soft px-3.5 py-2 text-center leading-none text-[#a83a1c]">
                    <div className="text-2xl font-black">{row.days}</div>
                    <div className="mt-0.5 text-[10px] font-extrabold uppercase">{row.days === 1 ? "day to go" : "days to go"}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {exam.dates.map((d) => (
                    <Badge key={d.id} tone={d.date < state.today ? "gray" : "coral"}><CalendarClock size={12} strokeWidth={3} /> {d.label ? `${d.label}: ` : ""}{fmtDate(d.date)}{d.time ? ` ${d.time}` : ""}</Badge>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-extrabold">Preparation</span>
                    <Badge tone={row.status === "On track" ? "mint" : row.status === "At risk" ? "coral" : "sun"}>{row.status}</Badge>
                  </div>
                  <Progress value={row.readiness} color={row.status === "On track" ? "var(--color-mint)" : row.status === "At risk" ? "var(--color-coral)" : "var(--color-sun)"} />
                  <p className="mt-1.5 text-xs text-ink-mute">Confidence {exam.confidence}/5 · Feeling prepared {exam.preparedness}/5{exam.topics.length ? ` · ${done} of ${exam.topics.length} topics revised` : ""}</p>
                </div>

                {exam.topics.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-sm font-extrabold">Topics <span className="font-bold text-ink-mute">(tick them off as you revise)</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {exam.topics.map((t) => (
                        <button key={t.id} type="button" disabled={busy} onClick={() => run("topic.toggle", { id: t.id, done: !t.done }, { quiet: true })} aria-pressed={t.done}
                          className={cx("clay-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ring-1", t.done ? "bg-mint-soft text-good ring-mint/40 line-through decoration-2" : "bg-white text-ink ring-line hover:ring-grape-200")}>
                          {t.done && <Check size={13} strokeWidth={3.5} />}{t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <p className="mb-2 text-sm font-extrabold">Revision timeline</p>
                  <ol className="space-y-1.5">
                    {plan.map((p) => (
                      <li key={p.name} className={cx("flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm", p.current ? "clay-sm bg-grape-100" : "")}>
                        <span className={cx("size-2.5 shrink-0 rounded-full", p.current ? "bg-grape-500" : p.end < state.today ? "bg-mint" : "bg-line")} />
                        <span className="min-w-0 flex-1"><span className="font-extrabold">{p.name}</span> <span className="text-ink-mute">· {p.method}</span></span>
                        <span className="shrink-0 text-xs font-bold text-ink-soft">{p.start === p.end ? fmtDate(p.start, { weekday: false }) : `${fmtDate(p.start, { weekday: false })} – ${fmtDate(p.end, { weekday: false })}`}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-ink-mute">
                    {row.scheduled.length
                      ? `${row.scheduled.length} revision session${row.scheduled.length > 1 ? "s" : ""} (${fmtDuration(row.scheduled.reduce((n, s) => n + dur(s), 0))}) scheduled so far. Next: ${fmtDate(row.scheduled[0].date)} ${row.scheduled[0].start}, ${row.scheduled[0].task}.`
                      : "No revision sessions are scheduled yet. They are added week by week as the exam approaches."}
                  </p>
                </div>

                {exam.notes && <p className="clay-inset mt-4 whitespace-pre-wrap p-3 text-sm text-ink-soft">{exam.notes}</p>}

                <div className="mt-4 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await confirm(`Delete ${exam.name}?`, "The exam and its topic list are removed and your plan rebalances. Study you have logged stays in your history.")) run("exam.delete", { id: exam.id }); }}><Trash2 size={15} strokeWidth={2.6} /> Delete</Button>
                  <Button size="sm" onClick={() => open(exam)}><Pencil size={15} strokeWidth={2.6} /> Edit</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <Card className="mt-5">
          <h2 className="mb-2 text-lg">Past exams</h2>
          <ul className="divide-y divide-line">
            {past.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-extrabold">{e.name}</p>
                  <p className="text-sm text-ink-soft"><SubjectChip subject={byId.get(e.subjectId)} /> · {e.dates.map((d) => fmtDate(d.date)).join(", ")}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(e)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (await confirm(`Delete ${e.name}?`, "This past exam will be removed.")) run("exam.delete", { id: e.id }); }} aria-label={`Delete ${e.name}`}><Trash2 size={15} strokeWidth={2.6} /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit exam" : "Add an exam or assessment"} wide>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} placeholder="e.g. Chemistry end-of-term exam" /></Field>
              <Field label="Subject">
                <Select value={draft.subjectId} onChange={(e) => set("subjectId", e.target.value)} required>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-extrabold text-ink-soft">Exam date(s)</span>
              <div className="space-y-2">
                {draft.dates.map((d, i) => {
                  const upd = (patch: Partial<Draft["dates"][number]>) => set("dates", draft.dates.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_7.5rem_1fr_auto]">
                      <Input type="date" aria-label="Date" value={d.date} onChange={(e) => upd({ date: e.target.value })} required />
                      <Input type="time" aria-label="Time (optional)" value={d.time} onChange={(e) => upd({ time: e.target.value })} className="col-start-1 sm:col-start-auto" />
                      <Input aria-label="Label (optional)" placeholder="Label, e.g. Paper 1" value={d.label} onChange={(e) => upd({ label: e.target.value })} maxLength={60} className="col-start-1 sm:col-start-auto" />
                      <button type="button" disabled={draft.dates.length === 1} onClick={() => set("dates", draft.dates.filter((_, j) => j !== i))} aria-label="Remove this date" className="col-start-2 row-start-1 grid size-11 place-items-center rounded-full text-ink-mute hover:bg-coral-soft hover:text-bad disabled:opacity-30 sm:col-start-auto"><X size={18} strokeWidth={3} /></button>
                    </div>
                  );
                })}
              </div>
              <Button size="sm" variant="ghost" className="mt-1.5 -ml-2" onClick={() => set("dates", [...draft.dates, { date: draft.dates.at(-1)?.date ?? state.today, time: "", label: `Paper ${draft.dates.length + 1}` }])}><Plus size={14} strokeWidth={3} /> Add another date</Button>
            </div>
            <Field label="Topics covered" hint="One per line. Each becomes its own manageable revision session.">
              <Textarea rows={5} value={draft.topics} onChange={(e) => set("topics", e.target.value)} placeholder={"Atomic structure\nBonding\nAcids and bases"} />
            </Field>
            <Field label="Format (optional)"><Input value={draft.format} onChange={(e) => set("format", e.target.value)} maxLength={200} placeholder="e.g. 90 minute written paper, multiple choice + essays" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Confidence in this subject"><Scale value={draft.confidence} onChange={(v) => set("confidence", v)} low="Shaky" high="Confident" /></Field>
              <Field label="How prepared do you feel right now?"><Scale value={draft.preparedness} onChange={(v) => set("preparedness", v)} low="Not at all" high="Ready" /></Field>
            </div>
            <Field label="Notes (optional)"><Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busy || !draft.subjectId}>Save and update plan</Button>
            </div>
          </form>
        )}
      </Modal>
      {dialog}
    </>
  );
}
