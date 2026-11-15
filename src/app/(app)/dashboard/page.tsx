"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CalendarCheck, CircleAlert, CircleCheck, GraduationCap, Info, NotebookPen, RefreshCw, Sparkles } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, CardTitle, Empty, PageHeader, Progress, SubjectChip, cx } from "@/components/ui";
import { DailyBars, Ring, SubjectBars } from "@/components/charts";
import { SessionDialog, type SessionTarget } from "@/components/session-dialog";
import { SessionRow } from "@/components/session-row";
import { LogDialog, type LogTarget } from "@/components/log-dialog";
import { dailySeries, dayStats, examRows, insights, subjectMap, weekStats } from "@/lib/stats";
import { fmtDate, fmtDuration, fmtHours } from "@/lib/time";

function Tile({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className={cx("clay-sm rounded-2xl px-4 py-3", tint)}>
      <div className="text-2xl font-black leading-tight">{value}</div>
      <div className="text-xs font-extrabold opacity-75">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const state = useApp();
  const { run, busy } = useStore();
  const [target, setTarget] = useState<SessionTarget>(null);
  const [log, setLog] = useState<LogTarget>(null);
  const today = dayStats(state, state.today);
  const week = weekStats(state, state.today);
  const exams = examRows(state).slice(0, 5);
  const notes = insights(state);
  const subjects = subjectMap(state);
  const dueSubjects = [...new Set(today.remaining.map((s) => s.subjectId))].map((id) => subjects.get(id)).filter(Boolean);
  const hour = Number(state.nowTime.slice(0, 2));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}!`} subtitle={`${fmtDate(state.today, { year: true })} · here is where things stand.`}>
        <Button variant="primary" onClick={() => setLog({ create: true })}><NotebookPen size={18} strokeWidth={2.6} /> Log study</Button>
        <Link href="/assistant"><Button variant="sun"><Bot size={18} strokeWidth={2.6} /> Ask the assistant</Button></Link>
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle hint={dueSubjects.length ? "Tap a session to mark it done, missed, or to move it." : undefined}>Today</CardTitle>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Tile label="Planned" value={fmtDuration(today.planned)} tint="bg-grape-100 text-grape-700" />
            <Tile label="Completed" value={fmtDuration(today.actual)} tint="bg-mint-soft text-good" />
            <Tile label={today.remaining.length === 1 ? "Task left" : "Tasks left"} value={String(today.remaining.length)} tint="bg-sun-soft text-[#7a5600]" />
          </div>
          {dueSubjects.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-extrabold text-ink-mute">Still to study:</span>
              {dueSubjects.map((s) => <SubjectChip key={s!.id} subject={s} />)}
            </div>
          )}
          {today.sessions.length ? (
            <div className="space-y-2.5">
              {today.sessions.map((s) => <SessionRow key={s.id} session={s} onOpen={(session) => setTarget({ session })} />)}
            </div>
          ) : (
            <Empty icon={<CalendarCheck size={28} />} title="Nothing planned for today">Enjoy the breather, or add a session from the Study Planner.</Empty>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle hint={`${fmtDate(week.start, { weekday: false })} – ${fmtDate(week.end, { weekday: false })}`}>This week</CardTitle>
          <div className="flex items-center gap-5">
            <Ring pct={week.pct} label={`${week.pct}%`} sub="of plan done" />
            <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
              <div><dt className="font-bold text-ink-mute">Planned</dt><dd className="text-xl font-black">{fmtHours(week.planned)}</dd></div>
              <div><dt className="font-bold text-ink-mute">Studied</dt><dd className="text-xl font-black">{fmtHours(week.actual)}</dd></div>
              <div><dt className="font-bold text-ink-mute">Completed</dt><dd className="text-xl font-black">{week.completed + week.partial}</dd></div>
              <div><dt className="font-bold text-ink-mute">Missed</dt><dd className="text-xl font-black">{week.missed}</dd></div>
            </dl>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="mint">{week.completed} completed</Badge>
            {week.partial > 0 && <Badge tone="sun">{week.partial} partly done</Badge>}
            <Badge tone="coral">{week.missed} missed</Badge>
            <Badge tone="grape">{week.upcoming} still to come</Badge>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle hint="Planned versus actually studied, last 14 days">Study hours over time</CardTitle>
          <DailyBars data={dailySeries(state, 14)} today={state.today} />
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle hint="This week, studied of planned">By subject</CardTitle>
          {week.bySubject.length ? <SubjectBars rows={week.bySubject} /> : <p className="text-sm text-ink-soft">Add subjects in My Timetable to see them here.</p>}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle action={<Link href="/exams" className="text-sm font-extrabold text-grape-600 hover:underline">Manage</Link>}>Upcoming exams</CardTitle>
          {exams.length ? (
            <ul className="space-y-3.5">
              {exams.map((e) => (
                <li key={e.exam.id + e.date}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-extrabold">{e.exam.name}{e.label ? ` · ${e.label}` : ""}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft"><SubjectChip subject={e.subject} /> · {fmtDate(e.date)}</p>
                    </div>
                    <div className="clay-sm shrink-0 rounded-2xl bg-coral-soft px-3 py-1.5 text-center leading-none text-[#a83a1c]">
                      <div className="text-xl font-black">{e.days}</div>
                      <div className="text-[10px] font-extrabold uppercase">{e.days === 1 ? "day" : "days"}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={e.readiness} className="flex-1" color={e.status === "On track" ? "var(--color-mint)" : e.status === "At risk" ? "var(--color-coral)" : "var(--color-sun)"} />
                    <Badge tone={e.status === "On track" ? "mint" : e.status === "At risk" ? "coral" : "sun"}>{e.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<GraduationCap size={28} />} title="No exams coming up"><Link href="/exams" className="font-extrabold text-grape-600 hover:underline">Add an exam</Link> and the plan will build towards it.</Empty>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle
            hint="Worked out from your plan, your log and your exam dates"
            action={state.ai.configured ? <Button size="sm" onClick={() => run("insights.refresh")} disabled={busy}><RefreshCw size={14} strokeWidth={3} /> Ask Claude</Button> : undefined}
          >
            Progress and insights
          </CardTitle>
          <ul className="space-y-2.5">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-3 text-[15px]">
                <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-xl", n.tone === "good" ? "bg-mint-soft text-good" : n.tone === "warn" ? "bg-coral-soft text-bad" : "bg-sky-soft text-[#1f5fa8]")}>
                  {n.tone === "good" ? <CircleCheck size={16} strokeWidth={2.6} /> : n.tone === "warn" ? <CircleAlert size={16} strokeWidth={2.6} /> : <Info size={16} strokeWidth={2.6} />}
                </span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
          {state.insights?.text.length ? (
            <div className="clay-inset mt-4 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-grape-600"><Sparkles size={15} strokeWidth={2.8} /> Recommendations from Claude</p>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] marker:text-grape-400">
                {state.insights.text.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ) : !state.ai.configured ? (
            <p className="mt-4 text-sm text-ink-mute">Connect Claude in <Link href="/settings" className="font-extrabold text-grape-600 hover:underline">Settings</Link> for personalised written recommendations.</p>
          ) : null}
        </Card>
      </div>

      <SessionDialog target={target} onClose={() => setTarget(null)} />
      <LogDialog target={log} onClose={() => setLog(null)} />
    </>
  );
}
