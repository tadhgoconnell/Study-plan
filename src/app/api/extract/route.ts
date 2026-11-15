import { extractTimetable } from "@/lib/ai/extract";
import { aiProblem } from "@/lib/ai/client";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
    return Response.json({ ok: true, ...(await extractTimetable(file)) });
  } catch (err) {
    return Response.json({ ok: false, error: aiProblem(err) }, { status: 400 });
  }
}
