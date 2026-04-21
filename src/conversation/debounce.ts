import type { MessageProvider } from '../messaging/provider';
import { SendBlueProvider } from '../messaging/sendblue';
import { logger } from '../logger';
import { logError } from '../db/error-log';

const log = logger.child({ module: 'debounce' });

/**
 * In-memory debouncer. When a user texts multiple messages in quick succession
 * (the "train of thought" pattern), we collect them into a single turn and
 * process once. This prevents multi-Claude-calls on what is really one logical
 * message, and prevents out-of-order replies racing back to the user.
 *
 * Not crash-safe — if the process dies mid-window the pending text is lost
 * (user will just resend). Acceptable tradeoff at our scale. If we ever move
 * to multi-instance workers, this needs to move to Redis or similar.
 *
 * The typing indicator is re-fired on every inbound so the iMessage "..."
 * stays visible throughout the debounce window — users don't perceive lag.
 */

interface Pending {
  texts: string[];
  mediaUrls: string[];
  timer: NodeJS.Timeout;
  firstInboundAt: number;
}

export interface DebouncedTurn {
  text: string;
  mediaUrls: string[];
}

const WINDOW_MS = 3000;
const MAX_CONCAT_CHARS = 2000;

const pending = new Map<string, Pending>();

export function scheduleTurn(
  userId: string,
  incoming: { text: string; mediaUrls: string[] },
  process: (turn: DebouncedTurn) => Promise<void>,
): void {
  const existing = pending.get(userId);

  if (existing) {
    clearTimeout(existing.timer);
    existing.texts.push(incoming.text);
    existing.mediaUrls.push(...incoming.mediaUrls);
  }

  const entry: Pending = existing ?? {
    texts: [incoming.text],
    mediaUrls: [...incoming.mediaUrls],
    timer: null as unknown as NodeJS.Timeout,
    firstInboundAt: Date.now(),
  };

  entry.timer = setTimeout(() => {
    pending.delete(userId);
    const combined: DebouncedTurn = {
      text: entry.texts
        .map((t) => t.trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_CONCAT_CHARS),
      mediaUrls: entry.mediaUrls,
    };
    process(combined).catch((err) => {
      log.error({ err, userId }, 'turn processing failed');
      void logError('debounce_turn_failed', err, { userId });
    });
  }, WINDOW_MS);

  if (!existing) pending.set(userId, entry);
}

export function cancelPendingTurn(userId: string): boolean {
  const entry = pending.get(userId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(userId);
  return true;
}

/**
 * Fire the iMessage typing indicator immediately on inbound. Non-blocking —
 * if it fails (SMS recipient, API hiccup), we don't care. The visual "..."
 * masks the debounce window so users don't perceive latency.
 */
export function fireTypingIndicator(provider: MessageProvider, to: string): void {
  if (provider instanceof SendBlueProvider) {
    void provider.sendTyping(to);
  }
}
