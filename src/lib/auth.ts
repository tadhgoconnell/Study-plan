import { createHmac, timingSafeEqual } from "node:crypto";

/** Optional single-password gate, switched on by setting APP_PASSWORD. */
export const SESSION_COOKIE = "sp_session";

export function passwordRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

export function sessionToken(): string {
  return createHmac("sha256", process.env.APP_PASSWORD ?? "").update("study-planner-session-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
