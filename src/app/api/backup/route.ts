import { loadState } from "@/lib/store";
import { tzOf } from "@/lib/http";

/** Download everything as one JSON file that Settings can restore later. */
export async function GET(request: Request) {
  const s = await loadState(tzOf(request));
  const backup = { app: "study-planner", exportedAt: new Date().toISOString(), settings: s.settings, subjects: s.subjects, timetable: s.timetable, overrides: s.overrides, exams: s.exams, sessions: s.sessions, logs: s.logs };
  return new Response(JSON.stringify(backup, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="study-planner-backup-${s.today}.json"` },
  });
}
