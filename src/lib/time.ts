/** Date and time helpers. Dates are "YYYY-MM-DD", times are "HH:MM" wall clock. */

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMin(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export function fromMin(m: number): string {
  const c = Math.max(0, Math.min(1439, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = utc(date);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(date: string): number {
  return (utc(date).getUTCDay() + 6) % 7;
}

export function weekStart(date: string): string {
  return addDays(date, -weekday(date));
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, n: number): string {
  const d = utc(monthStart(date));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(date: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = utc(date);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${opts.weekday === false ? "" : `${DAY_SHORT[weekday(date)]} `}${base}${opts.year ? ` ${d.getUTCFullYear()}` : ""}`;
}

export function fmtMonth(date: string): string {
  const d = utc(date);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(today: string, date: string): string {
  const d = diffDays(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** Current date and time in a named time zone. Falls back to UTC. */
export function nowIn(timeZone: string | null | undefined, at: Date = new Date()): { date: string; time: string } {
  const read = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  };
  try {
    return read(timeZone || "UTC");
  } catch {
    return read("UTC");
  }
}

export interface Interval {
  start: number;
  end: number;
}

/** Remove every `cut` interval from `base`. Both in minutes of the day. */
export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  let out = base.filter((i) => i.end > i.start);
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const i of out) {
      if (c.end <= i.start || c.start >= i.end) {
        next.push(i);
        continue;
      }
      if (c.start > i.start) next.push({ start: i.start, end: c.start });
      if (c.end < i.end) next.push({ start: c.end, end: i.end });
    }
    out = next;
  }
  return out;
}

export function merge(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
