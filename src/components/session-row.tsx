"use client";

import { Check, Clock, Pin, X } from "lucide-react";
import type { Session } from "@/lib/types";
import { fmtDuration } from "@/lib/time";
import { dur, subjectMap } from "@/lib/stats";
import { useApp } from "./store";
import { Badge, cx } from "./ui";
import { PRIORITY, STATUS } from "./session-dialog";

/** One study session as a clickable row. */
export function SessionRow({ session, onOpen, showDate }: { session: Session; onOpen: (s: Session) => void; showDate?: string }) {
  const state = useApp();
  const subject = subjectMap(state).get(session.subjectId);
  const overdue = session.status === "planned" && session.date === state.today && session.end <= state.nowTime;
  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className={cx("clay-press flex w-full items-stretch gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-line hover:ring-grape-200", session.status === "missed" && "opacity-70")}
    >
      <span className="w-1.5 shrink-0 rounded-full" style={{ background: subject?.color ?? "#b9b4d0" }} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-ink-mute">
          <Clock size={12} strokeWidth={3} />
          {showDate ? `${showDate} · ` : ""}{session.start}–{session.end} · {fmtDuration(dur(session))}
          {session.pinned && <span className="inline-flex items-center gap-0.5" title="Placed by you"><Pin size={11} strokeWidth={3} /> fixed</span>}
        </span>
        <span className={cx("mt-0.5 block truncate font-extrabold", session.status === "missed" && "line-through decoration-2")}>{subject?.name ?? "Removed subject"} · <span className="font-bold text-ink-soft">{session.task}</span></span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {session.method && <Badge tone="sky">{session.method}</Badge>}
          <Badge tone={PRIORITY[session.priority].tone}>{PRIORITY[session.priority].label.replace(" priority", "")}</Badge>
          {session.status !== "planned" && (
            <Badge tone={STATUS[session.status].tone}>
              {session.status === "missed" ? <X size={11} strokeWidth={3.5} /> : <Check size={11} strokeWidth={3.5} />}
              {STATUS[session.status].label}
            </Badge>
          )}
          {overdue && <Badge tone="coral">Did you do this?</Badge>}
        </span>
      </span>
    </button>
  );
}
