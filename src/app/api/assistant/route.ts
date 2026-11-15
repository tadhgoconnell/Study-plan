import { getDb } from "@/lib/db";
import { chat, type ChatEvent } from "@/lib/ai/assistant";
import { aiProblem } from "@/lib/ai/client";
import { aiStatus, loadChat, loadState } from "@/lib/store";
import { tzOf } from "@/lib/http";

export const maxDuration = 300;

export async function GET() {
  try {
    return Response.json({ ok: true, messages: await loadChat(await getDb()) });
  } catch {
    return Response.json({ ok: false, error: "Could not load the conversation." }, { status: 500 });
  }
}

/** Streams one assistant turn as newline-delimited JSON events. */
export async function POST(request: Request) {
  const tz = tzOf(request);
  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) return Response.json({ ok: false, error: "Type a message first." }, { status: 400 });
  if (!aiStatus().configured) {
    return Response.json({ ok: false, error: "The assistant needs a Claude API key. Add ANTHROPIC_API_KEY to your environment and restart (see Settings)." }, { status: 400 });
  }
  await loadState(tz);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* the browser went away; keep working so changes still save */
        }
      };
      try {
        await chat(tz, message, emit);
      } catch (err) {
        emit({ t: "error", v: aiProblem(err) });
        emit({ t: "done" });
      }
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
