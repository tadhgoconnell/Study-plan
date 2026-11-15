"use client";

import { useRef, useState } from "react";
import { CalendarOff, FileUp, MapPin, Pencil, Plus, Sparkles, Table2, Trash2 } from "lucide-react";
import { tzHeader, useApp, useStore } from "@/components/store";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, Segmented, Select, SubjectChip, cx, useConfirm, type Tone } from "@/components/ui";
import { activeSubjects, subjectMap } from "@/lib/stats";
import { DAY_NAMES, DAY_SHORT, addDays, fmtDate, weekday } from "@/lib/time";
import type { EntryType, Override, Subject, TimetableEntry } from "@/lib/types";

const TYPES: Record<EntryType, { label: string; tone: Tone; hint: string }> = {
  class: { label: "Class", tone: "grape", hint: "A lesson. No study is planned during it." },
  break: { label: "Break", tone: "gray", hint: "Break or lunch. Kept free." },
  free: { label: "Free period", tone: "mint", hint: "Time at school you could study in." },
  commitment: { label: "Commitment", tone: "pink", hint: "Sport, work, dinner, anything fixed." },
};

interface Draft {
  id?: string;
  day: number;
  type: EntryType;
  title: string;
  subjectId: string;
  start: string;
  end: string;
  location: string;
  keep?: boolean;
}
const blank = (day = 0): Draft => ({ day, type: "class", title: "", subjectId: "", start: "09:00", end: "10:00", location: "" });

function EntryForm({ draft, onChange, subjects }: { draft: Draft; onChange: (d: Draft) => void; subjects: Subject[] }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="space-y-4">
      <div>
        <Segmented label="Type" value={draft.type} onChange={(v) => set("type", v)} options={(Object.keys(TYPES) as EntryType[]).map((t) => ({ value: t, label: TYPES[t].label }))} />
        <p className="mt-1.5 text-xs text-ink-mute">{TYPES[draft.type].hint}</p>
      </div>
      {draft.type === "class" ? (
        <Field label="Subject" hint="Pick an existing subject or type a new one.">
          <Input list="subject-names" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value, subjectId: subjects.find((s) => s.name.toLowerCase() === e.target.value.trim().toLowerCase())?.id ?? "" })} placeholder="e.g. Maths" required maxLength={60} />
          <datalist id="subject-names">{subjects.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
      ) : (
        <Field label="Name"><Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={draft.type === "commitment" ? "e.g. Football training" : TYPES[draft.type].label} maxLength={80} /></Field>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Day" className="col-span-2 sm:col-span-1">
          <Select value={draft.day} onChange={(e) => set("day", Number(e.target.value))}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
        </Field>
        <Field label="Start"><Input type="time" value={draft.start} onChange={(e) => set("start", e.target.value)} required /></Field>
        <Field label="End"><Input type="time" value={draft.end} onChange={(e) => set("end", e.target.value)} required /></Field>
      </div>
      <Field label="Location (optional)"><Input value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Room 12" maxLength={80} /></Field>
    </div>
  );
}

const toPayload = (d: Draft) => ({ id: d.id, day: d.day, type: d.type, title: d.type === "class" && d.subjectId ? "" : d.title, subject: d.type === "class" ? d.title : undefined, subjectId: d.type === "class" ? d.subjectId || null : null, start: d.start, end: d.end, location: d.location });

export default function TimetablePage() {
  const state = useApp();
  const { run, busy, toast } = useStore();
  const { confirm, dialog } = useConfirm();
  const subjects = activeSubjects(state);
  const byId = subjectMap(state);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState<{ id?: string; name: string; priority: number; confidence: number; color: string } | null>(null);
  const [override, setOverride] = useState<{ date: string; type: Override["type"]; start: string; end: string; note: string } | null>(null);
  const [extracted, setExtracted] = useState<{ rows: Draft[]; notes: string; replace: boolean } | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileDay, setMobileDay] = useState(Math.min(weekday(state.today), 6));

  const edit = (e: TimetableEntry) => setDraft({ id: e.id, day: e.day, type: e.type, title: e.type === "class" ? (byId.get(e.subjectId ?? "")?.name ?? e.title) : e.title, subjectId: e.subjectId ?? "", start: e.start, end: e.end, location: e.location });
  const saveEntry = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    if ((await run("timetable.save", toPayload(draft), { success: "Timetable saved." })).ok) setDraft(null);
  };
  const removeEntry = async () => {
    if (!draft?.id || !(await confirm("Delete this entry?", "It will be removed from every week. Your plan will adjust to the freed time."))) return;
    if ((await run("timetable.delete", { id: draft.id }, { success: "Entry deleted." })).ok) setDraft(null);
  };

  const upload = async (file: File) => {
    setReading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form, headers: tzHeader() });
      const body = await res.json();
      if (!body.ok) toast({ kind: "error", title: body.error });
      else setExtracted({ rows: body.entries.map((e: Omit<Draft, "subjectId">) => ({ ...e, subjectId: subjects.find((s) => s.name.toLowerCase() === e.title.toLowerCase())?.id ?? "", keep: true })), notes: body.notes, replace: state.timetable.length === 0 || state.sample });
    } catch {
      toast({ kind: "error", title: "The upload failed. Check your connection and try again." });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const importRows = async () => {
    if (!extracted) return;
    const rows = extracted.rows.filter((r) => r.keep);
    if (!rows.length) return toast({ kind: "error", title: "Tick at least one entry to import." });
    if (extracted.replace && state.timetable.length && !(await confirm("Replace your timetable?", `Your ${state.timetable.length} existing entries will be removed and replaced with these ${rows.length}.`, "Replace"))) return;
    if ((await run("timetable.import", { entries: rows.map(toPayload), replace: extracted.replace })).ok) setExtracted(null);
  };

  const upcomingOverrides = state.overrides.filter((o) => o.date >= state.today);

  const column = (day: number) => {
    const entries = state.timetable.filter((e) => e.day === day).sort((a, b) => a.start.localeCompare(b.start));
    return (
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-black uppercase tracking-wide text-ink-soft">{DAY_SHORT[day]}</h3>
          <button type="button" onClick={() => setDraft(blank(day))} aria-label={`Add to ${DAY_NAMES[day]}`} className="grid size-6 place-items-center rounded-full text-ink-mute hover:bg-grape-100 hover:text-grape-600"><Plus size={15} strokeWidth={3.5} /></button>
        </div>
        <div className="space-y-1.5">
          {entries.map((e) => {
            const s = byId.get(e.subjectId ?? "");
            return (
              <button key={e.id} type="button" onClick={() => edit(e)} className={cx("clay-press block w-full rounded-xl p-2 text-left ring-1 ring-line", e.type === "class" ? "bg-white" : e.type === "free" ? "bg-mint-soft/60" : e.type === "commitment" ? "bg-pink-soft/60" : "hatch bg-[#f6f4fb]")} style={s ? { borderLeft: `5px solid ${s.color}` } : undefined}>
                <span className="block text-[11px] font-bold text-ink-mute">{e.start}–{e.end}</span>
                <span className="block truncate text-sm font-extrabold">{e.title}</span>
                {e.location && <span className="flex items-center gap-0.5 truncate text-[11px] text-ink-mute"><MapPin size={10} strokeWidth={3} />{e.location}</span>}
              </button>
            );
          })}
          {!entries.length && <p className="rounded-xl border-2 border-dashed border-line px-2 py-4 text-center text-xs font-bold text-ink-mute">Free day</p>}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="My Timetable" subtitle="Your school week. The planner only ever schedules study around it.">
        <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.docx,.txt,.csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button onClick={() => (state.ai.configured ? fileRef.current?.click() : toast({ kind: "error", title: "Timetable upload needs Claude. Add ANTHROPIC_API_KEY (see Settings), or add entries by hand." }))} disabled={reading}>
          <FileUp size={18} strokeWidth={2.6} /> {reading ? "Reading your timetable…" : "Upload timetable"}
        </Button>
        <Button variant="primary" onClick={() => setDraft(blank(mobileDay))}><Plus size={18} strokeWidth={3} /> Add entry</Button>
      </PageHeader>

      <Card className="mb-5">
        <CardTitle hint="Tap any entry to edit or delete it. Upload a photo, PDF or document and Claude will fill this in for you.">Weekly timetable</CardTitle>
        {state.timetable.length === 0 ? (
          <Empty icon={<Table2 size={28} />} title="Your timetable is empty">Add your classes one by one, or upload a picture of your timetable.</Empty>
        ) : (
          <>
            <div className="hidden gap-3 md:grid md:grid-cols-7">{DAY_NAMES.map((_, d) => <div key={d}>{column(d)}</div>)}</div>
            <div className="md:hidden">
              <Segmented label="Day" className="mb-3 w-full justify-between" value={mobileDay} onChange={setMobileDay} options={DAY_SHORT.map((d, i) => ({ value: i, label: d }))} />
              {column(mobileDay)}
            </div>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">{(Object.keys(TYPES) as EntryType[]).map((t) => <Badge key={t} tone={TYPES[t].tone}>{TYPES[t].label}</Badge>)}</div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Confidence and attention steer how much time each subject gets." action={<Button size="sm" onClick={() => setSubject({ name: "", priority: 2, confidence: 3, color: "" })}><Plus size={15} strokeWidth={3} /> Add</Button>}>Subjects</CardTitle>
          {subjects.length ? (
            <ul className="divide-y divide-line">
              {subjects.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <SubjectChip subject={s} />
                    <p className="text-xs text-ink-mute">Confidence {s.confidence}/5 · {["Light touch", "Normal attention", "Extra attention"][s.priority - 1]}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSubject({ id: s.id, name: s.name, priority: s.priority, confidence: s.confidence, color: s.color })} aria-label={`Edit ${s.name}`}><Pencil size={15} strokeWidth={2.6} /> Edit</Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">No subjects yet. Add one, or add a class and its subject is created for you.</p>}
        </Card>

        <Card>
          <CardTitle hint="A day off, an appointment, or a free afternoon when school is closed." action={<Button size="sm" onClick={() => setOverride({ date: addDays(state.today, 1), type: "off", start: "13:00", end: "17:00", note: "" })}><Plus size={15} strokeWidth={3} /> Add</Button>}>Changes to specific days</CardTitle>
          {upcomingOverrides.length ? (
            <ul className="divide-y divide-line">
              {upcomingOverrides.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-extrabold">{fmtDate(o.date)} <Badge tone={o.type === "off" ? "coral" : o.type === "busy" ? "pink" : "mint"} className="ml-1">{o.type === "off" ? "Day off" : o.type === "busy" ? "Busy" : "Free to study"}</Badge></p>
                    <p className="truncate text-xs text-ink-mute">{o.type === "off" ? "No study planned" : `${o.start}–${o.end}`}{o.note ? ` · ${o.note}` : ""}</p>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => run("override.delete", { id: o.id }, { success: "Removed." })}><Trash2 size={15} strokeWidth={2.6} /></Button>
                </li>
              ))}
            </ul>
          ) : <Empty icon={<CalendarOff size={26} />} title="No one-off changes">Planning a day off or have an appointment? Add it and the plan moves around it.</Empty>}
        </Card>
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit timetable entry" : "Add to timetable"}>
        {draft && (
          <form onSubmit={saveEntry}>
            <EntryForm draft={draft} onChange={setDraft} subjects={subjects} />
            <div className="mt-6 flex justify-between gap-2">
              {draft.id ? <Button variant="danger" onClick={removeEntry} disabled={busy}><Trash2 size={16} strokeWidth={2.6} /> Delete</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={busy}>Save</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!subject} onClose={() => setSubject(null)} title={subject?.id ? "Edit subject" : "Add a subject"}>
        {subject && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await run("subject.save", { id: subject.id, name: subject.name, priority: subject.priority, confidence: subject.confidence, color: subject.color || undefined }, { success: "Subject saved." })).ok) setSubject(null);
            }}
          >
            <Field label="Name"><Input value={subject.name} onChange={(e) => setSubject({ ...subject, name: e.target.value })} required maxLength={60} placeholder="e.g. Geography" /></Field>
            <Field label="How confident do you feel?">
              <Segmented label="Confidence" value={subject.confidence} onChange={(v) => setSubject({ ...subject, confidence: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: <span className="px-1.5">{n}</span> }))} />
              <span className="mt-1 block text-xs text-ink-mute">1 = struggling, 5 = very confident. Lower confidence gets more study time.</span>
            </Field>
            <Field label="How much attention does it need?">
              <Segmented label="Attention" value={subject.priority} onChange={(v) => setSubject({ ...subject, priority: v })} options={[{ value: 1, label: "Light" }, { value: 2, label: "Normal" }, { value: 3, label: "Extra" }]} />
            </Field>
            {subject.id && <Field label="Colour"><input type="color" value={subject.color} onChange={(e) => setSubject({ ...subject, color: e.target.value })} className="clay-inset h-11 w-20 cursor-pointer p-1.5" /></Field>}
            <div className="flex justify-between gap-2 pt-2">
              {subject.id ? (
                <Button variant="danger" disabled={busy} onClick={async () => {
                  if (!(await confirm(`Delete ${subject.name}?`, "Its upcoming sessions and exams are removed. Study you have already logged for it is kept, and the subject is archived instead of erased."))) return;
                  if ((await run("subject.delete", { id: subject.id })).ok) setSubject(null);
                }}><Trash2 size={16} strokeWidth={2.6} /> Delete</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSubject(null)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={busy}>Save</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!override} onClose={() => setOverride(null)} title="Change a specific day">
        {override && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await run("override.save", { date: override.date, type: override.type, start: override.type === "off" ? null : override.start, end: override.type === "off" ? null : override.end, note: override.note })).ok) setOverride(null);
            }}
          >
            <Segmented label="Kind of change" value={override.type} onChange={(v) => setOverride({ ...override, type: v })} options={[{ value: "off", label: "Day off" }, { value: "busy", label: "Busy time" }, { value: "free", label: "Free time" }]} />
            <p className="text-xs text-ink-mute">{override.type === "off" ? "No study will be planned on this date." : override.type === "busy" ? "You are unavailable between these times." : "You can study between these times, even if your timetable normally has classes then."}</p>
            <Field label="Date"><Input type="date" min={state.today} value={override.date} onChange={(e) => setOverride({ ...override, date: e.target.value })} required /></Field>
            {override.type !== "off" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><Input type="time" value={override.start} onChange={(e) => setOverride({ ...override, start: e.target.value })} required /></Field>
                <Field label="Until"><Input type="time" value={override.end} onChange={(e) => setOverride({ ...override, end: e.target.value })} required /></Field>
              </div>
            )}
            <Field label="Note (optional)"><Input value={override.note} onChange={(e) => setOverride({ ...override, note: e.target.value })} maxLength={120} placeholder="e.g. Dentist, family trip" /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOverride(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busy}>Save and update plan</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!extracted} onClose={() => setExtracted(null)} title="Check what Claude found" wide>
        {extracted && (
          <div>
            <p className="flex items-start gap-2 text-sm text-ink-soft"><Sparkles size={16} className="mt-0.5 shrink-0 text-grape-500" strokeWidth={2.6} /> {extracted.rows.length} entries were read from your file. Fix anything that looks wrong and untick anything you do not want. Nothing is saved until you import.</p>
            {extracted.notes && <p className="clay-inset mt-3 p-3 text-sm font-bold text-ink-soft">{extracted.notes}</p>}
            <div className="mt-4 space-y-2">
              {extracted.rows.map((r, i) => {
                const set = (patch: Partial<Draft>) => setExtracted({ ...extracted, rows: extracted.rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className={cx("grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-2xl p-2 ring-1 ring-line sm:grid-cols-[auto_5.5rem_7rem_1fr_6.5rem_6.5rem]", !r.keep && "opacity-45")}>
                    <input type="checkbox" checked={!!r.keep} onChange={(e) => set({ keep: e.target.checked })} aria-label="Include this entry" className="size-5 accent-grape-500" />
                    <Select aria-label="Day" value={r.day} onChange={(e) => set({ day: Number(e.target.value) })} className="h-9 text-sm">{DAY_SHORT.map((d, di) => <option key={d} value={di}>{d}</option>)}</Select>
                    <Select aria-label="Type" value={r.type} onChange={(e) => set({ type: e.target.value as EntryType })} className="h-9 text-sm">{(Object.keys(TYPES) as EntryType[]).map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}</Select>
                    <Input aria-label="Name" value={r.title} onChange={(e) => set({ title: e.target.value, subjectId: subjects.find((s) => s.name.toLowerCase() === e.target.value.trim().toLowerCase())?.id ?? "" })} className="col-span-3 h-9 text-sm sm:col-span-1" />
                    <Input aria-label="Start" type="time" value={r.start} onChange={(e) => set({ start: e.target.value })} className="col-start-2 h-9 text-sm sm:col-start-auto" />
                    <Input aria-label="End" type="time" value={r.end} onChange={(e) => set({ end: e.target.value })} className="h-9 text-sm" />
                  </div>
                );
              })}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={extracted.replace} onChange={(e) => setExtracted({ ...extracted, replace: e.target.checked })} className="size-5 accent-grape-500" />
              Replace my current timetable (otherwise these are added to it)
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExtracted(null)}>Cancel</Button>
              <Button variant="primary" onClick={importRows} disabled={busy}>Import {extracted.rows.filter((r) => r.keep).length} entries</Button>
            </div>
          </div>
        )}
      </Modal>
      {dialog}
    </>
  );
}
