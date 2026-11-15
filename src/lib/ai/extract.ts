import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, model } from "./client";
import { UserError } from "../service";
import { TIME_RE } from "../time";

const Extracted = z.object({
  entries: z.array(
    z.object({
      day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
      type: z.enum(["class", "break", "free", "commitment"]),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      location: z.string(),
    }),
  ),
  notes: z.string(),
});

export interface ExtractedEntry {
  day: number;
  type: "class" | "break" | "free" | "commitment";
  title: string;
  start: string;
  end: string;
  location: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

/** Pull readable text out of a .docx file (a zip of XML), keeping table rows on one line. */
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new UserError("That Word document could not be read. Try exporting it as a PDF instead.");
  return strFromU8(xml)
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export async function extractTimetable(file: File): Promise<{ entries: ExtractedEntry[]; notes: string }> {
  if (file.size === 0) throw new UserError("That file is empty.");
  if (file.size > MAX_BYTES) throw new UserError("That file is larger than 8 MB. Try a smaller photo or a PDF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const type = file.type || "";
  let source: Anthropic.ContentBlockParam;
  const image = IMAGE_TYPES.find((t) => t === type);
  if (image) {
    source = { type: "image", source: { type: "base64", media_type: image, data: Buffer.from(bytes).toString("base64") } };
  } else if (type === "application/pdf" || name.endsWith(".pdf")) {
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } };
  } else if (name.endsWith(".docx")) {
    source = { type: "text", text: `Timetable document contents:\n\n${docxText(bytes)}` };
  } else if (type.startsWith("text/") || /\.(txt|csv|tsv|md|ics)$/.test(name)) {
    source = { type: "text", text: `Timetable file contents:\n\n${new TextDecoder().decode(bytes)}` };
  } else {
    throw new UserError("That file type is not supported. Upload a photo (PNG or JPEG), a PDF, a Word .docx file or a text/CSV file.");
  }

  const response = await claude().messages.parse({
    model: model(),
    max_tokens: 16000,
    system:
      "You read school timetables and turn them into structured data. Extract every recurring weekly entry you can see. Use 24-hour HH:MM times. \"class\" is a taught lesson (title = the subject name only, such as \"Maths\"); \"break\" covers breaks, lunch, registration and assembly; \"free\" is a free or study period; \"commitment\" is anything else such as clubs or sport. If a period's times are not printed, work them out from the period grid when it is shown. If the same lesson spans consecutive periods, return one entry covering both. Do not invent entries you cannot see. Put room names in location, or an empty string. Use \"notes\" for one short sentence about anything unclear or guessed, or an empty string.",
    messages: [{ role: "user", content: [source, { type: "text", text: "Extract the weekly timetable from this." }] }],
    output_config: { format: zodOutputFormat(Extracted) },
  });
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || !out) throw new UserError("Claude could not read a timetable from that file. Try a clearer image, or enter it by hand.");
  // Trust nothing: keep only entries with real times in the right order.
  const entries = out.entries
    .map((e) => ({ day: DAYS.indexOf(e.day), type: e.type, title: e.title.trim().slice(0, 80), start: e.start.padStart(5, "0"), end: e.end.padStart(5, "0"), location: e.location.trim().slice(0, 80) }))
    .filter((e) => e.day >= 0 && TIME_RE.test(e.start) && TIME_RE.test(e.end) && e.start < e.end)
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  if (!entries.length) throw new UserError("No timetable entries were found in that file. Try a clearer image, or enter it by hand.");
  return { entries, notes: out.notes.trim() };
}
