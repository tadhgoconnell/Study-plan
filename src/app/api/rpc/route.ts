import { getDb } from "@/lib/db";
import { actions, explain, type ActionResult } from "@/lib/service";
import { SCHEMA_NAME, loadState } from "@/lib/store";
import { refreshInsights, replan } from "@/lib/ai/assistant";
import { aiProblem } from "@/lib/ai/client";
import { tzOf } from "@/lib/http";

export const maxDuration = 300;

type Handler = (tz: string | null, payload: unknown) => Promise<ActionResult>;

/** Actions that involve Claude live here so the core service has no AI dependency. */
const aiActions: Record<string, Handler> = {
  "plan.regenerate": async (tz, payload) => {
    const guidance = typeof (payload as { guidance?: unknown })?.guidance === "string" ? String((payload as { guidance: string }).guidance).slice(0, 500) : undefined;
    return { change: await replan(tz, "regenerate", guidance, "You asked for a fresh plan") };
  },
  "insights.refresh": async (tz) => {
    try {
      return await refreshInsights(tz);
    } catch (err) {
      return { message: aiProblem(err) };
    }
  },
  "chat.clear": async () => {
    await (await getDb()).query(`DELETE FROM ${SCHEMA_NAME}.chat_messages`);
    return { message: "Conversation cleared." };
  },
};

export async function POST(request: Request) {
  const tz = tzOf(request);
  try {
    const body = (await request.json()) as { action?: string; payload?: unknown };
    const handler = actions[body.action ?? ""] ?? aiActions[body.action ?? ""];
    if (!handler) return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
    await loadState(tz); // makes sure the database exists and is seeded
    const result = await handler(tz, body.payload ?? {});
    return Response.json({ ok: true, ...result, state: await loadState(tz) });
  } catch (err) {
    const e = explain(err);
    return Response.json({ ok: false, error: e.message }, { status: e.status });
  }
}
