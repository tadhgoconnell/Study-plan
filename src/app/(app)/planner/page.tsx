"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, History, Plus, RefreshCw, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, CardTitle, Empty, Field, Modal, PageHeader, SubjectChip, Textarea, cx } from "@/components/ui";
import { SessionDialog, type SessionTarget } from "@/components/session-dialog";
import { SessionRow } from "@/components/session-row";
import { dur, weekStats } from "@/lib/stats";
import { DAY_NAMES, addDays, fmtDate, fmtDuration, fmtHours, weekStart, weekday } from "@/lib/time";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function PlannerPage() {
  const state = useApp();
  const { run, busy } = useStore();
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<SessionTarget>(null);
  const [asking, setAsking] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [working, setWorking] = useState(false);

  const start = addDays(weekStart(state.today), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const week = weekStats(state, start);
  const hasPlan = state.sessions.some((s) => s.status === "planned");
  const latestUndoable = state.changes.find((c) => c.undoable && !c.undone);

  const regenerate = async () => {
    setAsking(false);
    setWorking(true);
    await run("plan.regenerate", { guidance: guidance.trim() || undefined });
    setWorking(false);
    setGuidance("");
  };

  return (
    <>
      <PageHeader title="Study Planner" subtitle="A realistic week built around your timetable. It adapts whenever something changes.">
        <Button onClick={() => run("plan.rebalance")} disabled={busy}><RefreshCw size={17} strokeWidth={2.8} /> Rebalance</Button>
        <Button variant="sun" onClick={() => setAsking(true)} disabled={busy}><Wand2 size={18} strokeWidth={2.6} /> {hasPlan ? "Regenerate plan" : "Generate my plan"}</Button>
        <Button variant="primary" onClick={() => setTarget({ create: { date: state.today } })}><Plus size={18} strokeWidth={3} /> Add session</Button>
      </PageHeader>

      {working && (
        <div className="clay mb-5 flex items-center gap-3 bg-sun-soft p-4 font-extrabold text-[#7a5600]">
          <Sparkles size={20} className="animate-pulse" strokeWidth={2.6} />
          {state.ai.configured ? "Claude is designing your sessions. This can take up to a minute…" : "Building your plan…"}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setOffset(offset - 1)} aria-label="Previous week"><ChevronLeft size={18} strokeWidth={3} /></Button>
              <div className="min-w-44 text-center">
                <p className="text-lg font-black leading-tight">{offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${fmtDate(start, { weekday: false })}`}</p>
                <p className="text-xs font-bold text-ink-mute">{fmtDate(start, { weekday: false })} – {fmtDate(days[6], { weekday: false })}</p>
              </div>
              <Button size="sm" onClick={() => setOffset(offset + 1)} aria-label="Next week"><ChevronRight size={18} strokeWidth={3} /></Button>
              {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Today</Button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="grape">{fmtHours(week.planned)} planned</Badge>
              <Badge tone="mint">{fmtHours(week.actual)} studied</Badge>
              {week.missed > 0 && <Badge tone="coral">{week.missed} missed</Badge>}
            </div>
          </Card>

          {days.map((date) => {
            const sessions = state.sessions.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));
            const off = state.overrides.some((o) => o.date === date && o.type === "off");
            const rest = state.settings.restDays.includes(weekday(date));
            const exams = state.exams.flatMap((e) => e.dates.filter((d) => d.date === date).map((d) => ({ e, d })));
            const total = sessions.reduce((n, s) => n + dur(s), 0);
            return (
              <Card key={date} className={cx("p-4 sm:p-5", date < state.today && "opacity-80")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg">
                    {DAY_NAMES[weekday(date)]} <span className="text-sm font-bold text-ink-mute">{fmtDate(date, { weekday: false })}</span>
                    {date === state.today && <Badge tone="grape">Today</Badge>}
                    {off && <Badge tone="coral">Day off</Badge>}
                    {!off && rest && <Badge tone="gray">Rest day</Badge>}
                  </h2>
                  <div className="flex items-center gap-2">
                    {total > 0 && <span className="text-sm font-extrabold text-ink-soft">{fmtDuration(total)}</span>}
                    {date >= state.today && <Button size="sm" variant="ghost" onClick={() => setTarget({ create: { date } })} aria-label={`Add a session on ${fmtDate(date)}`}><Plus size={15} strokeWidth={3} /></Button>}
                  </div>
                </div>
                {exams.map(({ e, d }) => (
                  <div key={d.id} className="clay-sm mb-2.5 flex items-center gap-2 rounded-2xl bg-coral-soft px-3 py-2 text-sm font-extrabold text-[#a83a1c]">
                    <Sparkles size={15} strokeWidth={2.8} /> Exam: {e.name}{d.label ? ` (${d.label})` : ""}{d.time ? ` at ${d.time}` : ""}
                  </div>
                ))}
                {sessions.length ? (
                  <div className="space-y-2">{sessions.map((s) => <SessionRow key={s.id} session={s} onOpen={(session) => setTarget({ session })} />)}</div>
                ) : (
                  <p className="text-sm text-ink-mute">{off || rest ? "Nothing planned. Enjoy the time off." : date < state.today ? "Nothing was planned." : "No study planned."}</p>
                )}
              </Card>
            );
          })}
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <Card>
            <CardTitle hint="Planned time this week">Subject balance</CardTitle>
            {week.bySubject.some((r) => r.planned) ? (
              <ul className="space-y-2.5">
                {[...week.bySubject].sort((a, b) => b.planned - a.planned).map((r) => (
                  <li key={r.subject.id} className="flex items-center justify-between gap-3 text-sm">
                    <SubjectChip subject={r.subject} />
                    <span className="font-extrabold text-ink-soft">{fmtDuration(r.planned)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">No sessions this week yet.</p>}
            <p className="mt-4 text-xs text-ink-mute">Time is shared out by exam dates, your confidence, what you have already studied and what you missed. Weekly target: {state.settings.weeklyTargetHours}h.</p>
          </Card>

          <Card>
            <CardTitle hint="Every automatic change is recorded here, with the reason.">Plan changes</CardTitle>
            {state.changes.length ? (
              <ul className="space-y-4">
                {state.changes.slice(0, 8).map((c) => (
                  <li key={c.id} className={cx("text-sm", c.undone && "opacity-50")}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={c.source === "claude" ? "sun" : c.source === "assistant" ? "pink" : "grape"}>{c.source === "claude" ? "Claude" : c.source === "assistant" ? "Assistant" : "Planner"}</Badge>
                      <span className="text-xs font-bold text-ink-mute">{c.trigger} · {ago(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-extrabold">{c.summary}{c.undone ? " (undone)" : ""}</p>
                    {c.items.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-soft marker:text-grape-300">{c.items.slice(0, 6).map((it, i) => <li key={i}>{it}</li>)}</ul>}
                    {latestUndoable?.id === c.id && (
                      <Button size="sm" variant="ghost" className="mt-1.5 -ml-2" disabled={busy} onClick={() => run("plan.undo", { id: c.id })}><Undo2 size={14} strokeWidth={3} /> Undo this change</Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<History size={26} />} title="No changes yet">When the plan adapts, you will see what changed and why.</Empty>}
          </Card>
        </div>
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title={hasPlan ? "Regenerate your plan?" : "Generate your plan"}>
        <p className="text-ink-soft">
          {hasPlan ? "Every upcoming session that the planner placed will be rebuilt from scratch. " : ""}
          Completed and missed sessions, your study log, and sessions you placed by hand are never touched. You can undo this afterwards.
        </p>
        {state.ai.configured ? (
          <Field label="Anything Claude should take into account? (optional)" className="mt-4">
            <Textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={500} placeholder="e.g. Keep Friday evening light. I learn Maths best in the morning at weekends." />
          </Field>
        ) : (
          <p className="clay-inset mt-4 p-3 text-sm text-ink-soft">The built-in planner will create this plan. Connect Claude in Settings to have it choose topics and study methods session by session.</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
          <Button variant="primary" onClick={regenerate}><Wand2 size={17} strokeWidth={2.6} /> {state.ai.configured ? "Generate with Claude" : "Generate plan"}</Button>
        </div>
      </Modal>
      <SessionDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
