"use client";

import { useRef, useState } from "react";
import { CircleAlert, CircleCheck, Database, Download, KeyRound, RotateCcw, Trash2, Upload } from "lucide-react";
import { useApp, useStore } from "@/components/store";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, cx, useConfirm } from "@/components/ui";
import { DAY_SHORT } from "@/lib/time";
import type { Settings } from "@/lib/types";

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-grape-50 px-1.5 py-0.5 text-[0.9em] font-bold text-grape-700">{children}</code>;
}

export default function SettingsPage() {
  const state = useApp();
  const { run, busy, toast } = useStore();
  const { confirm, dialog } = useConfirm();
  const [s, setS] = useState<Settings>(state.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(state.settings);
  const num = (k: keyof Settings) => ({ value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value === "" ? 0 : Number(e.target.value) }) });
  const time = (k: keyof Settings) => ({ type: "time", value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value }), required: true });

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirm("Restore this backup?", "Everything currently in the app will be replaced by the contents of the backup file. Download a backup of your current data first if you might want it back.", "Replace my data"))) return;
      const res = await run("data.import", data);
      if (res.ok) window.location.reload();
    } catch {
      toast({ kind: "error", title: "That file could not be read as a backup. Nothing was changed." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const reset = async (mode: "sample" | "empty") => {
    const ok = await confirm(
      mode === "empty" ? "Clear everything and start fresh?" : "Replace everything with sample data?",
      mode === "empty" ? "Your timetable, subjects, plan, study log, exams and chat are permanently deleted. Download a backup first if you might want them back." : "Your current data is permanently deleted and replaced with the example student. Download a backup first if you might want it back.",
      mode === "empty" ? "Delete everything" : "Replace my data",
    );
    if (!ok) return;
    const res = await run("data.reset", { mode });
    if (res.ok) window.location.href = mode === "empty" ? "/timetable" : "/dashboard";
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="How much you study, when, and where your data lives." />

      {state.sample && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-sun-soft">
          <p className="max-w-xl font-bold text-[#7a5600]">You are looking at sample data for an example student. When you are ready, clear it and enter your own subjects and timetable.</p>
          <Button variant="primary" onClick={() => reset("empty")} disabled={busy}><Trash2 size={16} strokeWidth={2.6} /> Clear sample data and start fresh</Button>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle hint="The planner never books more than these limits, however much time is free.">Study preferences</CardTitle>
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await run("settings.save", s, { success: "Preferences saved." }); }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weekly target (hours)" hint="Total study the plan aims for."><Input type="number" min={1} max={60} step={0.5} {...num("weeklyTargetHours")} /></Field>
              <Field label="Usual session (min)"><Input type="number" min={20} max={120} step={5} {...num("sessionMinutes")} /></Field>
              <Field label="Most on a school day (min)"><Input type="number" min={0} max={600} step={5} {...num("maxWeekdayMinutes")} /></Field>
              <Field label="Most on a weekend day (min)"><Input type="number" min={0} max={720} step={5} {...num("maxWeekendMinutes")} /></Field>
              <Field label="Longest session (min)"><Input type="number" min={25} max={180} step={5} {...num("maxSessionMinutes")} /></Field>
              <Field label="Break between sessions (min)"><Input type="number" min={0} max={60} step={5} {...num("breakMinutes")} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="School days: earliest"><Input {...time("weekdayStart")} /></Field>
              <Field label="School days: latest"><Input {...time("weekdayEnd")} /></Field>
              <Field label="Weekends: earliest"><Input {...time("weekendStart")} /></Field>
              <Field label="Weekends: latest"><Input {...time("weekendEnd")} /></Field>
              <Field label="Rest after school (min)" hint="Gap after your last class before study starts."><Input type="number" min={0} max={180} step={5} {...num("afterSchoolBuffer")} /></Field>
            </div>
            <label className="flex items-center gap-2.5 font-bold">
              <input type="checkbox" checked={s.useFreePeriods} onChange={(e) => setS({ ...s, useFreePeriods: e.target.checked })} className="size-5 accent-grape-500" />
              Use free periods at school for study
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-extrabold text-ink-soft">Weekly rest days (never planned)</span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_SHORT.map((d, i) => {
                  const on = s.restDays.includes(i);
                  return <button key={d} type="button" aria-pressed={on} onClick={() => setS({ ...s, restDays: on ? s.restDays.filter((x) => x !== i) : [...s.restDays, i].sort() })} className={cx("clay-press rounded-full px-3.5 py-1.5 text-sm font-extrabold ring-1", on ? "clay-sm bg-grape-500 text-white ring-transparent" : "bg-white text-ink-soft ring-line")}>{d}</button>;
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {dirty && <Button variant="ghost" onClick={() => setS(state.settings)}>Discard</Button>}
              <Button variant="primary" type="submit" disabled={busy || !dirty}>Save and update plan</Button>
            </div>
          </form>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardTitle action={<Badge tone={state.ai.configured ? "mint" : "coral"}>{state.ai.configured ? <CircleCheck size={12} strokeWidth={3} /> : <CircleAlert size={12} strokeWidth={3} />}{state.ai.configured ? "Connected" : "Not connected"}</Badge>}>
              <span className="inline-flex items-center gap-2"><KeyRound size={19} strokeWidth={2.6} /> Claude connection</span>
            </CardTitle>
            {state.ai.configured ? (
              <p className="text-sm text-ink-soft">Claude is connected using model <Code>{state.ai.model}</Code>. It powers the chat assistant, Claude-designed plans, written recommendations and timetable upload. Your key stays on the server and is never sent to the browser.</p>
            ) : (
              <div className="space-y-2 text-sm text-ink-soft">
                <p>The planner already schedules and adapts your week on its own. Connecting Claude adds the chat assistant, topic-by-topic plan design, written recommendations and timetable upload.</p>
                <ol className="list-decimal space-y-1 pl-5 marker:font-extrabold">
                  <li>Create an API key at <a className="font-extrabold text-grape-600 underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.</li>
                  <li>Running on your computer: copy <Code>.env.example</Code> to <Code>.env.local</Code> and set <Code>ANTHROPIC_API_KEY=your-key</Code>.</li>
                  <li>Hosted (e.g. Vercel): add <Code>ANTHROPIC_API_KEY</Code> under the project&apos;s Environment Variables.</li>
                  <li>Restart or redeploy the app.</li>
                </ol>
                <p>The key is only ever read on the server. It is never placed in this page or any browser code.</p>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle action={<Badge tone={state.storage === "memory" ? "coral" : "mint"}>{state.storage === "postgres" ? "Postgres" : state.storage === "local" ? "Local database" : "Memory only"}</Badge>}>
              <span className="inline-flex items-center gap-2"><Database size={19} strokeWidth={2.6} /> Data storage</span>
            </CardTitle>
            <p className="text-sm text-ink-soft">
              {state.storage === "postgres" && "Your data is saved in the Postgres database set in DATABASE_URL."}
              {state.storage === "local" && <>Your data is saved in a local database on this computer (the <Code>.studyclay</Code> folder in your home directory). To host the app online, set <Code>DATABASE_URL</Code> to a Postgres database (for example a free Supabase project) so the data lives there instead.</>}
              {state.storage === "memory" && <>This server cannot write files, so data is being held in memory and will be lost on restart. Set <Code>DATABASE_URL</Code> to a Postgres connection string (for example from Supabase: Project Settings, Database, Connection string) and redeploy.</>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/api/backup" download><Button><Download size={16} strokeWidth={2.6} /> Download backup</Button></a>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
              <Button onClick={() => fileRef.current?.click()}><Upload size={16} strokeWidth={2.6} /> Restore from backup</Button>
            </div>
          </Card>

          <Card>
            <CardTitle hint="These cannot be undone. Download a backup first.">Start over</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => reset("empty")} disabled={busy}><Trash2 size={16} strokeWidth={2.6} /> Clear all data</Button>
              <Button onClick={() => reset("sample")} disabled={busy}><RotateCcw size={16} strokeWidth={2.6} /> Load sample data</Button>
            </div>
          </Card>
        </div>
      </div>
      {dialog}
    </>
  );
}
