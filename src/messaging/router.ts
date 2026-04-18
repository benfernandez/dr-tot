import type { MessageProvider, OutboundMessage, SendResult } from './provider';

type ProviderName = 'sendblue' | 'telnyx';

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 5 * 60_000;

/**
 * Routes outbound messages to the primary provider (SendBlue) and fails over
 * to the secondary (Telnyx) when the primary trips its circuit breaker.
 *
 * The breaker is for catastrophic outages (SendBlue unreachable, Apple patches
 * them out, auth revoked). Per-message iMessage→SMS downgrade for non-iMessage
 * contacts is handled inside SendBlue itself — not here.
 */
export class MessageRouter {
  private circuits: Record<ProviderName, CircuitState> = {
    sendblue: { failures: 0, openedAt: null },
    telnyx: { failures: 0, openedAt: null },
  };

  constructor(
    private readonly primary: MessageProvider,
    private readonly secondary: MessageProvider,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult & { via: ProviderName }> {
    const first = this.isOpen(this.primary.name) ? this.secondary : this.primary;
    const second = first === this.primary ? this.secondary : this.primary;

    try {
      const result = await first.send(msg);
      this.onSuccess(first.name);
      return { ...result, via: first.name };
    } catch (err) {
      this.onFailure(first.name);
      try {
        const result = await second.send(msg);
        this.onSuccess(second.name);
        return { ...result, via: second.name };
      } catch (fallbackErr) {
        this.onFailure(second.name);
        throw fallbackErr;
      }
    }
  }

  private isOpen(name: ProviderName): boolean {
    const c = this.circuits[name];
    if (c.openedAt === null) return false;
    if (Date.now() - c.openedAt > OPEN_DURATION_MS) {
      c.openedAt = null;
      c.failures = 0;
      return false;
    }
    return true;
  }

  private onSuccess(name: ProviderName): void {
    this.circuits[name].failures = 0;
    this.circuits[name].openedAt = null;
  }

  private onFailure(name: ProviderName): void {
    const c = this.circuits[name];
    c.failures += 1;
    if (c.failures >= FAILURE_THRESHOLD && c.openedAt === null) {
      c.openedAt = Date.now();
    }
  }
}
