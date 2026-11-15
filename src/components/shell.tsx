"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, CalendarDays, CalendarRange, CircleAlert, CircleCheck, GraduationCap, LayoutDashboard, Menu, NotebookPen, Settings, Sparkles, Table2, X } from "lucide-react";
import { StoreProvider, useStore } from "./store";
import { Button, cx } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tint: "bg-grape-100 text-grape-600" },
  { href: "/timetable", label: "My Timetable", icon: Table2, tint: "bg-sky-soft text-[#1f5fa8]" },
  { href: "/planner", label: "Study Planner", icon: Sparkles, tint: "bg-sun-soft text-[#7a5600]" },
  { href: "/log", label: "Study Log", icon: NotebookPen, tint: "bg-mint-soft text-good" },
  { href: "/exams", label: "Exams & Assessments", icon: GraduationCap, tint: "bg-coral-soft text-[#a83a1c]" },
  { href: "/calendar", label: "Calendar", icon: CalendarRange, tint: "bg-pink-soft text-[#a8346a]" },
  { href: "/assistant", label: "AI Study Assistant", icon: Bot, tint: "bg-grape-100 text-grape-600" },
  { href: "/settings", label: "Settings", icon: Settings, tint: "bg-[#eeebf7] text-ink-soft" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 text-xl font-black tracking-tight", className)}>
      <span className="clay-sm grid size-10 place-items-center rounded-2xl bg-grape-500 text-white">
        <CalendarDays size={22} strokeWidth={2.6} />
      </span>
      Studyclay
    </span>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Main">
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx("group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-extrabold transition", active ? "clay-sm bg-white text-ink" : "text-ink-soft hover:bg-white/60 hover:text-ink")}
          >
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl transition group-hover:scale-105", item.tint)}>
              <item.icon size={19} strokeWidth={2.5} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="clay animate-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl p-4">
          <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl", t.kind === "error" ? "bg-coral-soft text-bad" : t.kind === "plan" ? "bg-sun-soft text-[#7a5600]" : "bg-mint-soft text-good")}>
            {t.kind === "error" ? <CircleAlert size={18} strokeWidth={2.6} /> : t.kind === "plan" ? <Sparkles size={18} strokeWidth={2.6} /> : <CircleCheck size={18} strokeWidth={2.6} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">{t.title}</p>
            {t.lines?.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                {t.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            ) : null}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-mute hover:text-ink">
            <X size={16} strokeWidth={3} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { state, loadError, refresh, busy } = useStore();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-6 overflow-y-auto p-5 lg:flex">
        <Link href="/" className="px-2 pt-1"><Logo /></Link>
        <Nav />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-canvas/85 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/"><Logo /></Link>
        <Button size="sm" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} strokeWidth={3} /> Menu</Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-ink/35" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[19rem] max-w-[88vw] flex-col gap-5 overflow-y-auto bg-canvas p-5">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-full hover:bg-white"><X size={20} strokeWidth={3} /></button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className={cx("pointer-events-none fixed top-0 right-0 left-0 z-50 h-1 origin-left bg-grape-400 transition-opacity lg:left-72", busy ? "animate-pulse opacity-100" : "opacity-0")} />

      <main className="mx-auto w-full max-w-6xl px-4 pt-2 pb-24 sm:px-6 lg:px-8 lg:pt-8">
        {loadError ? (
          <div className="clay mx-auto mt-16 max-w-md p-8 text-center">
            <h1 className="text-2xl">Could not load your planner</h1>
            <p className="mt-2 text-ink-soft">{loadError}</p>
            <Button variant="primary" className="mt-5" onClick={() => refresh()}>Try again</Button>
          </div>
        ) : !state ? (
          <div className="grid gap-5 pt-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="clay h-40 animate-pulse opacity-60" />)}
          </div>
        ) : (
          <>
            {state.storage === "memory" && (
              <div className="clay-sm mb-5 flex items-start gap-3 bg-coral-soft p-4 text-sm font-bold text-[#8a2f17]">
                <CircleAlert size={18} className="mt-0.5 shrink-0" strokeWidth={2.6} />
                <span>Your data is only being kept in memory and will be lost when the server restarts. Set DATABASE_URL to a Postgres database to keep it. See Settings for the steps.</span>
              </div>
            )}
            <div key={path} className="animate-rise">{children}</div>
          </>
        )}
      </main>
      <Toasts />
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <Frame>{children}</Frame>
    </StoreProvider>
  );
}
