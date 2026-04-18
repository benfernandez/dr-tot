/**
 * Destructive-intent detection for inbound text. The product rule: destructive
 * actions (delete, cancel, wipe history, export) never execute from text —
 * they're redirected to the web account portal. This keeps text forward-only
 * and prevents accidental data loss.
 *
 * `STOP` is a legal exception: carriers require instant opt-out, so it's
 * handled separately upstream before this check runs.
 */

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\b(delete|remove|wipe|erase|purge)\b.*\b(account|data|history|everything|me)\b/i,
  /\b(cancel|end|close|terminate)\b.*\b(subscription|account|plan|membership)\b/i,
  /\b(reset|clear)\b.*\b(history|conversation|chat|data)\b/i,
  /\bexport\b.*\b(data|messages|everything)\b/i,
  /\bunsubscribe\b/i,
  /^\s*(delete|cancel|reset|close|remove)\s*(me|account|my.*)?\s*\.?\s*$/i,
];

export function detectDestructiveIntent(text: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(text));
}

export function buildRedirectMessage(portalUrl: string): string {
  return `Anything like that I keep on the web so we don't do it by accident. Head to ${portalUrl} — your phone confirms you, takes 30 seconds.`;
}
