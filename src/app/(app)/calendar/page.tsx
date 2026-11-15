"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, GraduationCap, Plus, X } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, PageHeader, Segmented, cx } from "@/components/ui";
import { SessionDialog, type SessionTarget } from "@/components/session-dialog";
import { dur, subjectMap } from "@/lib/stats";
import { DAY_SHORT, addDays, addMonths, fmtDate, fmtDuration, fmtMonth, fromMin, monthStart, toMin, weekStart, weekday } from "@/lib/time";
import type { AppState, Session } from "@/lib/types";

type View = "day" | "week" | "month";
const HOUR = 56;

function tint(color: string | undefined, pct: number) {
  return `color-mix(in srgb, ${color ?? "#8a84a8"} ${pct}%, white)`;
}

function DayColumn({ state, date, from, to, onOpen, onCreate, onDropSession }: {
  state: AppState; date: string; from: number; to: number;
  onOpen: (s: Session) => void; onCreate: (start: string) => void; onDropSession: (id: string, start: string) => void;
}) {
  const subjects = subjectMap(state);
  const [over, setOver] = useState<number | null>(null);
  const top = (t: string | number) => (((typeof t === "number" ? t : toMin(t)) - from) / 60) * HOUR;
  const height = (a: string, b: string) => Math.max(18, ((toMin(b) - toMin(a)) / 60) * HOUR - 2);
  const minuteAt = (e: React.MouseEvent | React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(from, Math.min(to - 15, from + Math.round((((e.clientY - rect.top) / HOUR) * 60) / 15) * 15));
  };
  const day = weekday(date);
  const off = state.overrides.some((o) => o.date === date && o.type === "off");
  const entries = state.timetable.filter((e) => e.day === day);
  const overrides = state.overrides.filter((o) => o.date === date && o.type !== "off" && o.start && o.end);
  const sessions = state.sessions.filter((s) => s.date === date);
  const exams = state.exams.flatMap((e) => e.dates.filter((d) => d.date === date && d.time).map((d) => ({ e, d })));
  const isToday = date === state.today;

  return (
    <div
      className={cx("relative border-l border-line", isToday && "bg-grape-50/60", off && "hatch")}
      style={{ height: ((to - from) / 60) * HOUR }}
      onClick={(e) => { if (e.target === e.currentTarget && date >= state.today) onCreate(fromMin(minuteAt(e))); }}
      onDragOver={(e) => { e.preventDefault(); setOver(minuteAt(e)); }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/session"); setOver(null); if (id) onDropSession(id, fromMin(minuteAt(e))); }}
    >
      {Array.from({ length: (to - from) / 60 }, (_, i) => <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />)}
      {off && <div className="pointer-events-none absolute inset-x-1 top-2 rounded-xl bg-coral-soft px-2 py-1 text-center text-xs font-extrabold text-[#a83a1c]">Day off</div>}

      {entries.map((e) => {
        const s = subjects.get(e.subjectId ?? "");
        return (
          <div key={e.id} title={`${e.title} ${e.start}–${e.end}${e.location ? ` · ${e.location}` : ""}`}
            className={cx("pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] leading-tight", e.type === "class" ? "bg-[#efecf8] text-ink-soft" : e.type === "break" ? "hatch bg-[#f6f4fb] text-ink-mute" : e.type === "free" ? "border-2 border-dashed border-mint/60 text-good" : "bg-pink-soft text-[#a8346a]")}
            style={{ top: top(e.start), height: height(e.start, e.end), ...(s ? { borderLeft: `3px solid ${tint(s.color, 60)}` } : {}) }}>
            <span className="block truncate font-extrabold">{e.title}</span>
            {toMin(e.end) - toMin(e.start) >= 40 && <span className="block truncate opacity-80">{e.start}–{e.end}</span>}
          </div>
        );
      })}
      {overrides.map((o) => (
        <div key={o.id} className={cx("pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold", o.type === "busy" ? "hatch bg-pink-soft text-[#a8346a]" : "border-2 border-dashed border-mint bg-mint-soft/50 text-good")}
          style={{ top: top(o.start!), height: height(o.start!, o.end!) }}>
          {o.type === "busy" ? o.note || "Busy" : o.note || "Free to study"}
        </div>
      ))}
      {exams.map(({ e, d }) => (
        <div key={d.id} className="pointer-events-none absolute inset-x-1 z-10 flex items-center gap-1 overflow-hidden rounded-lg bg-coral px-1.5 text-[11px] font-black text-white" style={{ top: top(d.time!), height: 22 }}>
          <GraduationCap size={12} strokeWidth={3} className="shrink-0" /><span className="truncate">{e.name}</span>
        </div>
      ))}
      {sessions.map((s) => {
        const subject = subjects.get(s.subjectId);
        const movable = s.status === "planned";
        return (
          <button key={s.id} type="button" draggable={movable}
            onDragStart={(e) => { e.dataTransfer.setData("text/session", s.id); e.dataTransfer.effectAllowed = "move"; }}
            onClick={(e) => { e.stopPropagation(); onOpen(s); }}
            title={`${subject?.name ?? ""}: ${s.task} (${s.start}–${s.end})`}
            className={cx("clay-press absolute inset-x-1 z-20 overflow-hidden rounded-xl px-2 py-1 text-left text-[11px] leading-tight text-ink shadow-[0_6px_12px_-6px_rgb(43_35_80/0.35)]", movable && "cursor-grab active:cursor-grabbing", s.status === "missed" && "opacity-60")}
            style={{ top: top(s.start), height: height(s.start, s.end), background: tint(subject?.color, s.status === "missed" ? 10 : 24), borderLeft: `4px solid ${subject?.color ?? "#8a84a8"}`, ...(s.status === "missed" ? { outline: `1.5px dashed ${subject?.color ?? "#8a84a8"}`, outlineOffset: -2 } : {}) }}>
            <span className="flex items-center gap-1 font-black">
              {s.status === "completed" || s.status === "partial" ? <Check size={11} strokeWidth={4} className="shrink-0" /> : s.status === "missed" ? <X size={11} strokeWidth={4} className="shrink-0" /> : null}
              <span className={cx("truncate", s.status === "missed" && "line-through")}>{subject?.name ?? "Study"}</span>
            </span>
            {dur(s) >= 40 && <span className="block truncate font-semibold opacity-80">{s.task}</span>}
          </button>
        );
      })}
      {over !== null && <div className="pointer-events-none absolute inset-x-0 z-30 border-t-[3px] border-grape-500" style={{ top: top(over) }}><span className="absolute -top-5 left-1 rounded bg-grape-500 px-1 text-[10px] font-black text-white">{fromMin(over)}</span></div>}
      {isToday && toMin(state.nowTime) > from && toMin(state.nowTime) < to && (
        <div className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-coral" style={{ top: top(state.nowTime) }}><span className="absolute -top-1 -left-1 size-2 rounded-full bg-coral" /></div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const state = useApp();
  const { run } = useStore();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(state.today);
  const [target, setTarget] = useState<SessionTarget>(null);
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current && window.innerWidth < 768) setView("day");
    picked.current = true;
  }, []);

  const subjects = subjectMap(state);
  const days = view === "day" ? [cursor] : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)) : [];
  const step = (dir: number) => setCursor(view === "day" ? addDays(cursor, dir) : view === "week" ? addDays(cursor, dir * 7) : addMonths(cursor, dir));
  const title = view === "day" ? fmtDate(cursor, { year: true }) : view === "week" ? `${fmtDate(days[0], { weekday: false })} – ${fmtDate(days[6], { weekday: false, year: true })}` : fmtMonth(cursor);

  // Fit the grid to the hours that are actually used.
  const marks = [...state.timetable.flatMap((e) => [toMin(e.start), toMin(e.end)]), ...state.sessions.filter((s) => days.includes(s.date)).flatMap((s) => [toMin(s.start), toMin(s.end)]), toMin(state.settings.weekdayEnd), toMin(state.settings.weekendEnd)];
  const from = Math.min(8 * 60, Math.floor(Math.min(...marks, 8 * 60) / 60) * 60);
  const to = Math.max(21 * 60, Math.ceil(Math.max(...marks, 21 * 60) / 60) * 60);

  const move = (id: string, date: string, start: string) => {
    const s = state.sessions.find((x) => x.id === id);
    if (!s || (s.date === date && s.start === start)) return;
    run("session.move", { id, date, start }, { success: `Moved to ${fmtDate(date)} ${start}.` });
  };

  const monthCells = () => {
    const first = monthStart(cursor);
    const gridStart = weekStart(first);
    const next = addMonths(first, 1);
    const cells: string[] = [];
    for (let d = gridStart; d < next || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
    return { cells, month: first.slice(0, 7) };
  };

  return (
    <>
      <PageHeader title="Calendar" subtitle="Classes, study sessions, exams and commitments in one place. Drag a session to move it.">
        <Button variant="primary" onClick={() => setTarget({ create: { date: cursor < state.today ? state.today : cursor } })}><Plus size={18} strokeWidth={3} /> Add session</Button>
      </PageHeader>

      <Card className="p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={18} strokeWidth={3} /></Button>
            <Button size="sm" onClick={() => step(1)} aria-label="Next"><ChevronRight size={18} strokeWidth={3} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setCursor(state.today)}>Today</Button>
            <h2 className="ml-1 text-lg sm:text-xl">{title}</h2>
          </div>
          <Segmented label="Calendar view" value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        </div>

        {view !== "month" ? (
          <div className="overflow-x-auto">
            <div className={view === "week" ? "min-w-[760px]" : ""}>
              <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
                <div />
                {days.map((d) => {
                  const untimed = state.exams.flatMap((e) => e.dates.filter((x) => x.date === d && !x.time).map((x) => ({ e, x })));
                  return (
                    <div key={d} className="border-l border-line px-1 pb-2 text-center">
                      <button type="button" onClick={() => { setCursor(d); setView("day"); }} className={cx("mx-auto flex flex-col items-center rounded-2xl px-3 py-1 leading-tight hover:bg-grape-50", d === state.today && "clay-sm bg-grape-500 text-white hover:bg-grape-500")}>
                        <span className="text-[11px] font-extrabold uppercase opacity-80">{DAY_SHORT[weekday(d)]}</span>
                        <span className="text-lg font-black">{Number(d.slice(8))}</span>
                      </button>
                      {untimed.map(({ e, x }) => <div key={x.id} className="mt-1 flex items-center justify-center gap-1 truncate rounded-lg bg-coral px-1.5 py-0.5 text-[11px] font-black text-white"><GraduationCap size={12} strokeWidth={3} className="shrink-0" /><span className="truncate">{e.name}</span></div>)}
                    </div>
                  );
                })}
              </div>
              <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
                <div className="relative" style={{ height: ((to - from) / 60) * HOUR }}>
                  {Array.from({ length: (to - from) / 60 }, (_, i) => <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] font-bold text-ink-mute" style={{ top: i * HOUR }}>{i === 0 ? "" : fromMin(from + i * 60)}</span>)}
                </div>
                {days.map((d) => (
                  <DayColumn key={d} state={state} date={d} from={from} to={to}
                    onOpen={(session) => setTarget({ session })}
                    onCreate={(start) => setTarget({ create: { date: d, start } })}
                    onDropSession={(id, start) => move(id, d, start)} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          (() => {
            const { cells, month } = monthCells();
            return (
              <div>
                <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-extrabold uppercase text-ink-mute">{DAY_SHORT.map((d) => <div key={d}>{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {cells.map((d) => {
                    const sessions = state.sessions.filter((s) => s.date === d).sort((a, b) => a.start.localeCompare(b.start));
                    const exams = state.exams.filter((e) => e.dates.some((x) => x.date === d));
                    const off = state.overrides.some((o) => o.date === d && o.type === "off");
                    const mins = sessions.reduce((n, s) => n + dur(s), 0);
                    return (
                      <button key={d} type="button" onClick={() => { setCursor(d); setView("day"); }}
                        className={cx("clay-press flex min-h-20 flex-col rounded-2xl p-1.5 text-left ring-1 ring-line sm:min-h-28 sm:p-2", d.slice(0, 7) === month ? "bg-white" : "bg-white/40 text-ink-mute", d === state.today && "ring-2 ring-grape-500", off && "hatch")}>
                        <span className="flex items-center justify-between">
                          <span className={cx("grid size-6 place-items-center rounded-full text-xs font-black", d === state.today && "bg-grape-500 text-white")}>{Number(d.slice(8))}</span>
                          {mins > 0 && <span className="hidden text-[10px] font-bold text-ink-mute sm:inline">{fmtDuration(mins)}</span>}
                        </span>
                        {exams.map((e) => <span key={e.id} className="mt-1 flex items-center gap-0.5 truncate rounded-md bg-coral px-1 text-[10px] font-black text-white"><GraduationCap size={10} strokeWidth={3} className="shrink-0" /><span className="hidden truncate sm:inline">{e.name}</span></span>)}
                        <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                          {sessions.slice(0, 3).map((s) => (
                            <span key={s.id} className={cx("truncate rounded-md px-1 text-[10px] font-bold text-ink", s.status === "missed" && "line-through opacity-60")} style={{ background: tint(subjects.get(s.subjectId)?.color, 22), borderLeft: `3px solid ${subjects.get(s.subjectId)?.color ?? "#8a84a8"}` }}>
                              {s.start} {subjects.get(s.subjectId)?.name}
                            </span>
                          ))}
                          {sessions.length > 3 && <span className="text-[10px] font-bold text-ink-mute">+{sessions.length - 3} more</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">{sessions.slice(0, 6).map((s) => <span key={s.id} className="size-2 rounded-full" style={{ background: subjects.get(s.subjectId)?.color ?? "#8a84a8" }} />)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded border-l-4 border-grape-500 bg-grape-100" /> Study session</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-[#e4e0f1]" /> Class</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-pink-soft" /> Commitment</span>
          <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded bg-[#f6f4fb] ring-1 ring-line" /> Break</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded border-2 border-dashed border-mint" /> Free period</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-coral" /> Exam</span>
          <Badge tone="gray"><Check size={11} strokeWidth={3.5} /> done</Badge>
          <Badge tone="gray"><X size={11} strokeWidth={3.5} /> missed</Badge>
        </div>
      </Card>
      <SessionDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
