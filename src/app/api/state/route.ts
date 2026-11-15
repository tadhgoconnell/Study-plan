import { explain } from "@/lib/service";
import { loadState } from "@/lib/store";
import { tzOf } from "@/lib/http";

export async function GET(request: Request) {
  try {
    return Response.json({ ok: true, state: await loadState(tzOf(request)) });
  } catch (err) {
    const e = explain(err);
    return Response.json({ ok: false, error: "The database could not be opened. Check DATABASE_URL, or see the server log." }, { status: e.status });
  }
}
