import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiStatus } from "../store";
import { UserError } from "../service";

/**
 * The only place the Claude API client is created. It runs on the server and
 * reads its key from the environment, so the key never reaches the browser.
 */
let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!aiStatus().configured) {
    throw new UserError("Claude is not connected yet. Add ANTHROPIC_API_KEY to your environment (see Settings) to switch this on.");
  }
  client ??= new Anthropic();
  return client;
}

export const model = () => aiStatus().model;

/** Convert an API failure into something the student can act on. */
export function aiProblem(err: unknown): string {
  if (err instanceof UserError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "Claude rejected the API key. Check ANTHROPIC_API_KEY and restart the app.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key is not allowed to use the selected Claude model.";
  if (err instanceof Anthropic.NotFoundError) return `Claude does not recognise the model "${model()}". Check ANTHROPIC_MODEL.`;
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limited right now. Wait a minute and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach Claude. Check your internet connection and try again.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status ?? "unknown"}). Try again in a moment.`;
  console.error("[study-planner] AI error", err);
  return "The AI request failed unexpectedly. Your data is unchanged.";
}
