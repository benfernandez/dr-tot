import { config } from '../config';
import type { MessageProvider, OutboundMessage, SendResult } from './provider';
import { SendBlueProvider } from './sendblue';

type ProviderName = MessageProvider['name'];

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 5 * 60_000;

/**
 * Routes outbound to the primary provider (SendBlue) with a circuit breaker
 * that trips after N failures. When tripped, all sends throw until the
 * cooldown expires — the catastrophic Telnyx fallback will slot in here
 * once the secondary provider is wired up (Phase B).
 */
export class MessageRouter {
  private circuit: Record<ProviderName, CircuitState> = {
    sendblue: { failures: 0, openedAt: null },
    telnyx: { failures: 0, openedAt: null },
  };

  constructor(
    private readonly primary: MessageProvider,
    private readonly secondary: MessageProvider | null = null,
  ) {}

  get inbound(): MessageProvider {
    return this.primary;
  }

  async send(msg: OutboundMessage): Promise<SendResult & { via: ProviderName }> {
    if (!this.isOpen(this.primary.name)) {
      try {
        const res = await this.primary.send(msg);
        this.onSuccess(this.primary.name);
        return { ...res, via: this.primary.name };
      } catch (err) {
        this.onFailure(this.primary.name);
        if (!this.secondary) throw err;
      }
    }

    if (!this.secondary) throw new Error('Primary provider down and no fallback configured');

    if (this.isOpen(this.secondary.name)) {
      throw new Error('Both providers have open circuits');
    }

    try {
      const res = await this.secondary.send(msg);
      this.onSuccess(this.secondary.name);
      return { ...res, via: this.secondary.name };
    } catch (err) {
      this.onFailure(this.secondary.name);
      throw err;
    }
  }

  private isOpen(name: ProviderName): boolean {
    const c = this.circuit[name];
    if (c.openedAt === null) return false;
    if (Date.now() - c.openedAt > OPEN_DURATION_MS) {
      c.openedAt = null;
      c.failures = 0;
      return false;
    }
    return true;
  }

  private onSuccess(name: ProviderName): void {
    this.circuit[name].failures = 0;
    this.circuit[name].openedAt = null;
  }

  private onFailure(name: ProviderName): void {
    const c = this.circuit[name];
    c.failures += 1;
    if (c.failures >= FAILURE_THRESHOLD && c.openedAt === null) {
      c.openedAt = Date.now();
      console.warn(`[circuit] ${name} opened after ${FAILURE_THRESHOLD} failures`);
    }
  }
}

export function buildMessageRouter(): MessageRouter {
  const sendblue = new SendBlueProvider(
    config.sendblueApiKey,
    config.sendblueApiSecret,
    config.sendblueSigningSecret,
  );
  return new MessageRouter(sendblue, null);
}
