"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Ring } from "./charts";
import { cx } from "./ui";

const TASKS = [
  { id: 1, subject: "Biology", task: "Exam-style questions on enzymes", mins: 45, color: "#1baf7a" },
  { id: 2, subject: "Maths", task: "Revise differentiation from memory", mins: 45, color: "#2a78d6" },
  { id: 3, subject: "Chemistry", task: "Flashcards: acids and bases", mins: 30, color: "#eb6834" },
  { id: 4, subject: "English", task: "Essay plan for the set text", mins: 40, color: "#eda100" },
];

/** A tiny working taste of the tracker: tick sessions and watch the week fill up. */
export function ProgressDemo() {
  const [done, setDone] = useState<number[]>([1]);
  const total = TASKS.reduce((n, t) => n + t.mins, 0);
  const mins = TASKS.filter((t) => done.includes(t.id)).reduce((n, t) => n + t.mins, 0);
  const pct = Math.round((mins / total) * 100);
  return (
    <div className="clay grid gap-6 p-5 sm:p-7 md:grid-cols-[auto_1fr] md:items-center">
      <div className="flex flex-col items-center gap-2">
        <Ring pct={pct} size={168} label={`${pct}%`} sub="of today done" />
        <p className="text-sm font-extrabold text-ink-soft">{mins} of {total} minutes</p>
        <button type="button" onClick={() => setDone([])} className="inline-flex items-center gap-1 text-xs font-extrabold text-ink-mute hover:text-ink"><RotateCcw size={12} strokeWidth={3} /> Reset</button>
      </div>
      <ul className="space-y-2.5">
        {TASKS.map((t) => {
          const on = done.includes(t.id);
          return (
            <li key={t.id}>
              <button type="button" aria-pressed={on} onClick={() => setDone(on ? done.filter((d) => d !== t.id) : [...done, t.id])}
                className={cx("clay-sm clay-press flex w-full items-center gap-3 rounded-2xl p-3 text-left", on ? "bg-mint-soft" : "bg-white")}>
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-xl border-[3px] transition", on ? "border-mint bg-mint text-white" : "border-line bg-white text-transparent")}><Check size={18} strokeWidth={4} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-black"><span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.subject}<span className="font-bold text-ink-mute">· {t.mins} min</span></span>
                  <span className={cx("block truncate text-sm text-ink-soft", on && "line-through")}>{t.task}</span>
                </span>
              </button>
            </li>
          );
        })}
        <li className="pt-1 text-sm font-bold text-ink-mute">{pct === 100 ? "All done. The planner would ease tomorrow off a little." : pct === 0 ? "Miss a day and the planner spreads the work over the rest of your week." : "Tap a session to tick it off, like in the real app."}</li>
      </ul>
    </div>
  );
}
