"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Subject } from "@/lib/types";

/** The small set of building blocks every page shares. */

export const cx = clsx;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger" | "sun"; size?: "sm" | "md" | "lg" };

export function Button({ variant = "soft", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "clay-press inline-flex items-center justify-center gap-2 font-extrabold whitespace-nowrap select-none",
        size === "sm" && "h-9 px-3.5 text-sm rounded-[14px]",
        size === "md" && "h-11 px-5 text-[15px] rounded-[16px]",
        size === "lg" && "h-14 px-7 text-lg rounded-[20px]",
        variant === "primary" && "clay-sm bg-grape-500 text-white",
        variant === "sun" && "clay-sm bg-sun text-ink",
        variant === "soft" && "clay-sm bg-white text-ink",
        variant === "danger" && "clay-sm bg-coral-soft text-bad",
        variant === "ghost" && "text-ink-soft hover:bg-grape-50",
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("clay p-5 sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ children, hint, action }: { children: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg leading-tight">{children}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-mute">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const TONES = {
  grape: "bg-grape-100 text-grape-700",
  sun: "bg-sun-soft text-[#7a5600]",
  coral: "bg-coral-soft text-[#a83a1c]",
  mint: "bg-mint-soft text-good",
  sky: "bg-sky-soft text-[#1f5fa8]",
  pink: "bg-pink-soft text-[#a8346a]",
  gray: "bg-[#eeebf7] text-ink-soft",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function SubjectChip({ subject, className }: { subject?: Subject | null; className?: string }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5 font-bold", className)}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: subject?.color ?? "#b9b4d0" }} />
      <span className="truncate">{subject?.name ?? "Removed subject"}</span>
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-extrabold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

const control = "clay-inset h-11 w-full px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink-mute/70 border-0 outline-none focus:ring-3 focus:ring-grape-200";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", props.className)} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235d5682' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(control, "h-auto py-2.5 leading-snug", props.className)} />;
}

/** A row of pill options, used for small either/or choices. */
export function Segmented<T extends string | number>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("clay-inset inline-flex flex-wrap gap-1 p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("rounded-xl px-3 py-1.5 text-sm font-extrabold transition", value === o.value ? "clay-sm bg-white text-grape-600" : "text-ink-soft hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1 to 5 picker with end labels. */
export function Scale({ value, onChange, low, high }: { value: number; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div>
      <Segmented label={`${low} to ${high}`} value={value} onChange={onChange} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: <span className="px-1.5">{n}</span> }))} />
      <div className="mt-1 flex max-w-[15.5rem] justify-between text-xs text-ink-mute">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cx("clay animate-pop relative flex max-h-[92dvh] w-full flex-col rounded-b-none p-0 outline-none sm:rounded-b-[28px]", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 id={id} className="text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="clay-press grid size-9 place-items-center rounded-full text-ink-soft hover:bg-grape-50">
            <X size={20} strokeWidth={3} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}

/** Ask before anything destructive. */
export function useConfirm() {
  const [ask, setAsk] = useState<{ title: string; body: string; action: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = (title: string, body: string, action = "Delete") => new Promise<boolean>((resolve) => setAsk({ title, body, action, resolve }));
  const close = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };
  const dialog = (
    <Modal open={!!ask} onClose={() => close(false)} title={ask?.title ?? ""}>
      <p className="text-ink-soft">{ask?.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
        <Button variant="danger" onClick={() => close(true)}>{ask?.action}</Button>
      </div>
    </Modal>
  );
  return { confirm, dialog };
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="clay-sm mb-4 grid size-16 place-items-center rounded-3xl bg-grape-100 text-grape-600">{icon}</div>
      <h3 className="text-lg">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function Progress({ value, color = "var(--color-grape-500)", className }: { value: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("clay-inset h-3 overflow-hidden rounded-full", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
