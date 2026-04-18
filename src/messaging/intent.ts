/**
 * Destructive-intent detection for inbound text. The product rule: destructive
 * actions (delete, cancel, wipe history, export) never execute from text —
 * they're redirected to the web account portal. This keeps text forward-only
 * and prevents accidental data loss.
 *
 * `STOP` is a separate legal path handled upstream — carriers require instant
 * opt-out and it's not gated through the web portal.
 */

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\b(delete|remove|wipe|erase|purge)\b.*\b(account|data|history|everything|me)\b/i,
  /\b(cancel|end|close|terminate)\b.*\b(subscription|account|plan|membership)\b/i,
  /\b(reset|clear)\b.*\b(history|conversation|chat|data)\b/i,
  /\bexport\b.*\b(data|messages|everything)\b/i,
  /^\s*(delete|cancel|reset|close|remove|unsubscribe)\s*(me|account|my.*)?\s*\.?\s*$/i,
];

export function detectDestructiveIntent(text: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(text));
}

export function buildRedirectMessage(portalUrl: string): string {
  return `Anything like that I keep on the web so nothing happens by accident. Head to ${portalUrl}/account — your phone confirms you, takes 30 seconds.`;
}

const STOP_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'revoke',
  'optout',
  'opt-out',
]);

export function isStopKeyword(text: string): boolean {
  return STOP_KEYWORDS.has(text.trim().toLowerCase());
}

const HELP_KEYWORDS = new Set(['help', 'info']);

export function isHelpKeyword(text: string): boolean {
  return HELP_KEYWORDS.has(text.trim().toLowerCase());
}

const START_KEYWORDS = new Set(['start', 'unstop', 'yes']);

export function isStartKeyword(text: string): boolean {
  return START_KEYWORDS.has(text.trim().toLowerCase());
}
