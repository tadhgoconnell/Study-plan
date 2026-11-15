import "server-only";

/** The student's time zone, sent by the browser with every request. */
export function tzOf(request: Request): string | null {
  const tz = request.headers.get("x-tz");
  return tz && tz.length < 64 && /^[A-Za-z0-9_+\-/]+$/.test(tz) ? tz : null;
}
