"use client";

import { useState } from "react";
import { NotebookPen, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, CardTitle, Empty, PageHeader, SubjectChip, cx, useConfirm } from "@/components/ui";
import { LogDialog, type LogTarget } from "@/components/log-dialog";
import { SessionDialog, type SessionTarget } from "@/components/session-dialog";
import { SessionRow } from "@/components/session-row";
import { activeSubjects, dur, subjectMap, weekStats } from "@/lib/stats";
import { addDays, fmtDate, fmtDuration, fmtHours } from "@/lib/time";

export default function LogPage() {
  const state = useApp();
  const { run } = useStore();
  const { confirm, dialog } = useConfirm();
  const [log, setLog] = useState<LogTarget>(null);
  const [target, setTarget] = useState<SessionTarget>(null);
  const [shown, setShown] = useState(40);
  const subjects = subjectMap(state);
  const week = weekStats(state, state.today);

  // Planned so far this week (up to now) against what was actually done.
  const rows = activeSubjects(state).map((subject) => {
    const due = state.sessions.filter((s) => s.subjectId === subject.id && s.date >= week.start && (s.date < state.today || (s.date === state.today && s.end <= state.nowTime)));
    const logs = state.logs.filter((l) => l.subjectId === subject.id && l.date >= week.start && l.date <= week.end);
    const planned = due.reduce((n, s) => n + dur(s), 0);
    const done = logs.reduce((n, l) => n + l.minutes, 0);
    return { subject, planned, done, extra: logs.filter((l) => !l.sessionId).reduce((n, l) => n + l.minutes, 0), missed: due.filter((s) => s.status === "missed").length };
  });
  const plannedSoFar = rows.reduce((n, r) => n + r.planned, 0);
  const extra = rows.reduce((n, r) => n + r.extra, 0);
  const diff = week.actual - plannedSoFar;

  const attention = state.sessions
    .filter((s) => (s.status === "planned" && s.date === state.today && s.end <= state.nowTime) || ((s.status === "missed" || s.status === "partial") && s.date >= addDays(state.today, -6)))
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));

  const logs = [...state.logs].sort((a, b) => (b.date + (b.start ?? "")).localeCompare(a.date + (a.start ?? "")));
  const groups = new Map<string, typeof logs>();
  for (const l of logs.slice(0, shown)) groups.set(l.date, [...(groups.get(l.date) ?? []), l]);

  return (
    <>
      <PageHeader title="Study Log" subtitle="Record what you actually studied. The planner compares it with the plan and adjusts.">
        <Button variant="primary" onClick={() => setLog({ create: true })}><Plus size={18} strokeWidth={3} /> Log study time</Button>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="bg-mint-soft"><p className="text-sm font-extrabold text-good/80">Studied this week</p><p className="text-3xl font-black text-good">{fmtHours(week.actual)}</p></Card>
        <Card className={diff < -15 ? "bg-coral-soft" : "bg-grape-100"}>
          <p className={cx("text-sm font-extrabold", diff < -15 ? "text-bad/80" : "text-grape-700/80")}>Against the plan so far</p>
          <p className={cx("text-3xl font-black", diff < -15 ? "text-bad" : "text-grape-700")}>{Math.abs(diff) <= 15 ? "On track" : `${fmtDuration(Math.abs(diff))} ${diff < 0 ? "behind" : "ahead"}`}</p>
        </Card>
        <Card className="bg-sun-soft"><p className="text-sm font-extrabold text-[#7a5600]/80">Extra, unplanned study</p><p className="text-3xl font-black text-[#7a5600]">{fmtDuration(extra)}</p></Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardTitle hint="Sessions due so far this week against time logged">Planned versus actual</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-extrabold text-ink-mute"><th className="pb-2 font-extrabold">Subject</th><th className="pb-2 text-right font-extrabold">Due</th><th className="pb-2 text-right font-extrabold">Done</th><th className="pb-2 text-right font-extrabold">Difference</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const d = r.done - r.planned;
                    return (
                      <tr key={r.subject.id}>
                        <td className="py-2"><SubjectChip subject={r.subject} /></td>
                        <td className="py-2 text-right font-bold text-ink-soft">{fmtDuration(r.planned)}</td>
                        <td className="py-2 text-right font-extrabold">{fmtDuration(r.done)}</td>
                        <td className="py-2 text-right">{Math.abs(d) < 10 ? <Badge tone="gray">Even</Badge> : d < 0 ? <Badge tone="coral">{fmtDuration(-d)} behind</Badge> : <Badge tone="mint">{fmtDuration(d)} ahead</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-mute">Time you are behind is spread over your remaining days, never dumped on tomorrow. Time you are ahead eases that subject off.</p>
          </Card>

          <Card>
            <CardTitle hint="Missed, unfinished or waiting for you to confirm">Needs a look</CardTitle>
            {attention.length ? (
              <div className="space-y-2">{attention.slice(0, 8).map((s) => <SessionRow key={s.id} session={s} showDate={fmtDate(s.date)} onOpen={(session) => setTarget({ session })} />)}</div>
            ) : <p className="text-sm text-ink-soft">Nothing missed in the last week. Lovely.</p>}
          </Card>
        </div>

        <Card className="lg:col-span-3">
          <CardTitle hint="Everything you have logged, newest first">History</CardTitle>
          {logs.length ? (
            <div className="space-y-5">
              {[...groups.entries()].map(([date, list]) => (
                <section key={date}>
                  <h3 className="mb-2 flex items-center justify-between text-sm font-black text-ink-soft">
                    <span>{date === state.today ? "Today" : fmtDate(date, { year: true })}</span>
                    <span className="text-ink-mute">{fmtDuration(list.reduce((n, l) => n + l.minutes, 0))}</span>
                  </h3>
                  <ul className="space-y-2">
                    {list.map((l) => {
                      const session = l.sessionId ? state.sessions.find((s) => s.id === l.sessionId) : null;
                      return (
                        <li key={l.id} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
                          <span className="mt-1 w-1.5 shrink-0 self-stretch rounded-full" style={{ background: subjects.get(l.subjectId)?.color ?? "#b9b4d0" }} />
                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold">{subjects.get(l.subjectId)?.name ?? "Removed subject"} · {fmtDuration(l.minutes)}{l.start ? <span className="font-bold text-ink-mute"> · {l.start}–{l.end}</span> : null}</p>
                            {l.description && <p className="text-sm text-ink-soft">{l.description}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {session ? <Badge tone="grape">Planned session{session ? ` (${fmtDuration(dur(session))})` : ""}</Badge> : <Badge tone="sun">Extra study</Badge>}
                              {l.completedTask === true && <Badge tone="mint">Task completed</Badge>}
                              {l.completedTask === false && <Badge tone="coral">Task not finished</Badge>}
                              {l.productivity && <Badge tone="gray"><Star size={11} strokeWidth={3} /> {l.productivity}/5</Badge>}
                            </div>
                            {l.notes && <p className="mt-1 text-sm italic text-ink-mute">{l.notes}</p>}
                          </div>
                          <div className="flex shrink-0 gap-0.5">
                            <button type="button" onClick={() => setLog({ log: l })} aria-label="Edit log" className="grid size-8 place-items-center rounded-full text-ink-mute hover:bg-grape-50 hover:text-ink"><Pencil size={15} strokeWidth={2.6} /></button>
                            <button
                              type="button"
                              aria-label="Delete log"
                              className="grid size-8 place-items-center rounded-full text-ink-mute hover:bg-coral-soft hover:text-bad"
                              onClick={async () => {
                                if (await confirm("Delete this log entry?", `${fmtDuration(l.minutes)} of ${subjects.get(l.subjectId)?.name ?? "study"} on ${fmtDate(l.date)} will be removed from your history.`)) run("log.delete", { id: l.id }, { success: "Log entry deleted." });
                              }}
                            ><Trash2 size={15} strokeWidth={2.6} /></button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {logs.length > shown && <Button className="w-full" onClick={() => setShown(shown + 40)}>Show older entries</Button>}
            </div>
          ) : <Empty icon={<NotebookPen size={28} />} title="No study logged yet">Log a session and it shows up here, counted against your plan.</Empty>}
        </Card>
      </div>

      <LogDialog target={log} onClose={() => setLog(null)} />
      <SessionDialog target={target} onClose={() => setTarget(null)} />
      {dialog}
    </>
  );
}
