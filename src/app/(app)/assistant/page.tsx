"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Check, KeyRound, Send, Sparkles, Trash2 } from "lucide-react";
import { tzHeader, useApp, useStore } from "@/components/store";
import { Button, Card, PageHeader, cx, useConfirm } from "@/components/ui";
import type { ChatMessage } from "@/lib/types";

const IDEAS = [
  "I didn't manage to study Maths today.",
  "I spent an extra two hours on Biology.",
  "I have a Chemistry test next Friday.",
  "I'm struggling with Physics and need more time for it.",
  "I have a free afternoon tomorrow.",
  "I want to take Sunday off.",
  "I've fallen behind on my revision. Help me catch up.",
  "How is my workload looking this week?",
];

type Msg = Pick<ChatMessage, "role" | "content" | "actions"> & { id: string; pending?: boolean; error?: string };

export default function AssistantPage() {
  const state = useApp();
  const { refresh, run, toast } = useStore();
  const { confirm, dialog } = useConfirm();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => b.ok && setMessages(b.messages))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || sending) return;
    setText("");
    setSending(true);
    const replyId = `r${Date.now()}`;
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message, actions: [] }, { id: replyId, role: "assistant", content: "", actions: [], pending: true }]);
    const patch = (fn: (m: Msg) => Msg) => setMessages((list) => list.map((m) => (m.id === replyId ? fn(m) : m)));
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", ...tzHeader() }, body: JSON.stringify({ message }) });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        patch((m) => ({ ...m, pending: false, error: body.error ?? "The assistant could not be reached." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; v?: string };
          if (ev.t === "text") patch((m) => ({ ...m, content: m.content + ev.v }));
          else if (ev.t === "action") {
            patch((m) => ({ ...m, actions: [...m.actions, ev.v!] }));
            refresh();
          } else if (ev.t === "error") patch((m) => ({ ...m, error: ev.v }));
        }
      }
    } catch {
      patch((m) => ({ ...m, error: "The connection dropped. Any changes already confirmed above were saved." }));
    } finally {
      patch((m) => ({ ...m, pending: false }));
      setSending(false);
      refresh();
      boxRef.current?.focus();
    }
  };

  const clear = async () => {
    if (!(await confirm("Clear this conversation?", "The messages are deleted. Your plan, log and exams are not affected.", "Clear"))) return;
    if ((await run("chat.clear", {}, { quiet: true })).ok) {
      setMessages([]);
      toast({ kind: "ok", title: "Conversation cleared." });
    }
  };

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      <PageHeader title="AI Study Assistant" subtitle="Tell it what happened or what is coming up. It updates your plan and explains what changed.">
        {messages.length > 0 && <Button size="sm" variant="ghost" onClick={clear}><Trash2 size={15} strokeWidth={2.6} /> Clear chat</Button>}
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col p-0 sm:p-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {!state.ai.configured && (
            <div className="clay-sm flex items-start gap-3 rounded-3xl bg-sun-soft p-4 text-[#7a5600]">
              <KeyRound size={20} strokeWidth={2.6} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-extrabold">The assistant needs a Claude API key</p>
                <p className="mt-0.5">Add <code className="rounded bg-white/70 px-1 font-bold">ANTHROPIC_API_KEY</code> to your environment and restart the app. Step-by-step instructions are in <Link href="/settings" className="font-extrabold underline">Settings</Link>. Everything else, including automatic re-planning, works without it.</p>
              </div>
            </div>
          )}
          {loaded && messages.length === 0 && (
            <div className="flex flex-col items-center px-2 py-6 text-center">
              <div className="clay-sm animate-float grid size-20 place-items-center rounded-[28px] bg-grape-500 text-white"><Bot size={40} strokeWidth={2.2} /></div>
              <h2 className="mt-4 text-2xl">What is going on with your studies?</h2>
              <p className="mt-1 max-w-md text-ink-soft">I can see your timetable, plan, study log and exams. Tell me in your own words and I will update things for you.</p>
              <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" disabled={!state.ai.configured || sending} onClick={() => send(idea)} className="clay-sm clay-press rounded-full bg-white px-4 py-2 text-sm font-bold text-ink-soft disabled:opacity-50">{idea}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cx("animate-rise flex gap-3", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && <div className="clay-sm grid size-9 shrink-0 place-items-center rounded-2xl bg-grape-500 text-white"><Bot size={19} strokeWidth={2.4} /></div>}
              <div className={cx("max-w-[85%] sm:max-w-[75%]", m.role === "user" ? "clay-sm rounded-3xl rounded-br-lg bg-grape-500 px-4 py-2.5 text-white" : "min-w-0")}>
                {m.actions.length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-1.5">
                    {m.actions.map((a, i) => <li key={i} className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2.5 py-1 text-xs font-extrabold text-good"><Check size={12} strokeWidth={3.5} />{a}</li>)}
                  </ul>
                )}
                {m.content && <p className={cx("whitespace-pre-wrap leading-relaxed", m.role === "assistant" && "clay-inset rounded-3xl rounded-tl-lg px-4 py-3")}>{m.content}</p>}
                {m.pending && !m.content && <p className="clay-inset inline-flex items-center gap-2 rounded-3xl rounded-tl-lg px-4 py-3 text-ink-mute"><Sparkles size={16} className="animate-pulse" strokeWidth={2.6} /> Thinking…</p>}
                {m.error && <p className="mt-2 rounded-2xl bg-coral-soft px-3 py-2 text-sm font-bold text-bad">{m.error}</p>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="flex items-end gap-2 border-t border-line p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            rows={1}
            maxLength={4000}
            disabled={!state.ai.configured}
            aria-label="Message the assistant"
            placeholder={state.ai.configured ? "e.g. I only managed half of my Biology session today" : "Connect Claude to start chatting"}
            className="clay-inset max-h-36 min-h-12 flex-1 resize-none border-0 px-4 py-3 font-semibold outline-none placeholder:text-ink-mute/70 focus:ring-3 focus:ring-grape-200 disabled:opacity-60"
          />
          <Button variant="primary" type="submit" className="h-12" disabled={!text.trim() || sending || !state.ai.configured} aria-label="Send"><Send size={18} strokeWidth={2.6} /> <span className="hidden sm:inline">Send</span></Button>
        </form>
      </Card>
      {dialog}
    </div>
  );
}
