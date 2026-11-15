"use client";

import { useState } from "react";
import { fmtDate, fmtDuration, fmtHours, weekday, DAY_SHORT } from "@/lib/time";
import type { Subject } from "@/lib/types";
import { cx } from "./ui";

/** Small, purpose-built charts. Text stays in ink colours; marks carry the colour. */

const ACTUAL = "#2a78d6";
const PLANNED = "#d9d4ea";

export function Ring({ pct, size = 132, label, sub }: { pct: number; size?: number; label: string; sub?: string }) {
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${sub ?? ""}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece7fb" strokeWidth={14} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-grape-500)" strokeWidth={14} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="text-3xl font-black">{label}</div>
        {sub && <div className="mt-1 text-xs font-bold text-ink-mute">{sub}</div>}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-soft">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Study time per day: a pale bar for what was planned, a solid bar for what was done. */
export function DailyBars({ data, today }: { data: { date: string; planned: number; actual: number }[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(60, ...data.map((d) => Math.max(d.planned, d.actual)));
  const top = Math.ceil(max / 60) * 60;
  const ticks = [top, top / 2, 0];
  const H = 150;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Legend items={[{ color: ACTUAL, label: "Studied" }, { color: PLANNED, label: "Planned" }]} />
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] font-bold text-ink-mute" style={{ height: H + 24 }}>
          {ticks.map((t) => <span key={t}>{fmtHours(t)}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            {ticks.map((t) => <div key={t} className="border-t border-line" />)}
          </div>
          <div className="relative flex items-end gap-1 sm:gap-2" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${fmtDate(d.date)}: studied ${fmtDuration(d.actual)}, planned ${fmtDuration(d.planned)}`}
                className={cx("relative flex h-full flex-1 items-end justify-center rounded-lg outline-none", hover === i && "bg-grape-50")}
              >
                <span className="absolute bottom-0 w-[78%] max-w-9 rounded-t-[4px]" style={{ height: `${(d.planned / top) * 100}%`, background: PLANNED }} />
                <span className="absolute bottom-0 w-[42%] max-w-5 rounded-t-[4px]" style={{ height: `${(d.actual / top) * 100}%`, background: ACTUAL }} />
                {hover === i && (
                  <span className="clay-sm pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-xl bg-white px-3 py-2 text-left text-xs font-bold text-ink" style={i > data.length / 2 ? { right: 0 } : { left: 0 }}>
                    <span className="block text-ink-mute">{fmtDate(d.date)}</span>
                    <span className="block">Studied {fmtDuration(d.actual)}</span>
                    <span className="block text-ink-soft">Planned {fmtDuration(d.planned)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1 sm:gap-2">
            {data.map((d) => (
              <span key={d.date} className={cx("flex-1 text-center text-[11px] font-bold", d.date === today ? "text-grape-600" : "text-ink-mute")}>
                {DAY_SHORT[weekday(d.date)][0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One row per subject: a track for planned time, filled with time actually studied. */
export function SubjectBars({ rows }: { rows: { subject: Subject; planned: number; actual: number }[] }) {
  const max = Math.max(60, ...rows.map((r) => Math.max(r.planned, r.actual)));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.subject.id} title={`${r.subject.name}: studied ${fmtDuration(r.actual)} of ${fmtDuration(r.planned)} planned`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-extrabold">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.subject.color }} />
              <span className="truncate">{r.subject.name}</span>
            </span>
            <span className="shrink-0 font-bold text-ink-soft">
              {fmtDuration(r.actual)} <span className="text-ink-mute">of {fmtDuration(r.planned)}</span>
            </span>
          </div>
          <div className="relative h-3">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#ece7fb]" style={{ width: `${Math.max(2, (r.planned / max) * 100)}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${(r.actual / max) * 100}%`, background: r.subject.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
