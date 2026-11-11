// Product analytics events (brief section 10).
//
// PostHog is not connected yet: it needs an account and a project key, which
// is Erron's call. Until then events are only printed in the browser console
// during development, so the call sites are ready.

export type EventName =
  | "homepage_viewed"
  | "calculator_used"
  | "signup_started"
  | "report_signup";

export function track(event: EventName, properties: Record<string, unknown> = {}): void {
  if (import.meta.env.DEV) {
    console.info("[analytics]", event, properties);
  }
}
