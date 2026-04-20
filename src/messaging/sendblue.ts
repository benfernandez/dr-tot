import { createHash } from 'node:crypto';
import type {
  Channel,
  InboundMessage,
  MessageProvider,
  OutboundMessage,
  SendResult,
} from './provider';

interface SendBlueSendResponse {
  content?: string;
  status?: string;
  error_code?: number | null;
  error_message?: string | null;
  message_handle?: string;
  number?: string;
  service?: string;
  was_downgraded?: boolean;
}

interface SendBlueInboundPayload {
  from_number?: string;
  to_number?: string;
  content?: string;
  media_url?: string | null;
  media_urls?: string[];
  service?: string;
  group_id?: string | null;
  date_sent?: string;
  // Outbound confirmations reuse the webhook — skip anything that looks outbound.
  is_outbound?: boolean;
}

const BASE_URL = 'https://api.sendblue.co';

/**
 * SendBlue is the primary messaging backend. Messages are sent as iMessage
 * when the recipient is on iOS; when not, SendBlue cascades through RCS and
 * then SMS. The `service` field on the response tells us what actually
 * delivered — we mirror that into user.preferred_channel.
 */
export class SendBlueProvider implements MessageProvider {
  readonly name = 'sendblue' as const;

  constructor(
    private readonly apiKeyId: string,
    private readonly apiSecretKey: string,
    private readonly fromNumber: string,
    private readonly signingSecret: string | null,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const body: Record<string, unknown> = {
      number: msg.to,
      from_number: this.fromNumber,
      content: msg.text,
    };
    if (msg.mediaUrls && msg.mediaUrls.length > 0) {
      body.media_url = msg.mediaUrls[0];
    }

    const res = await fetch(`${BASE_URL}/api/send-message`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SendBlue send failed: ${res.status} ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as SendBlueSendResponse;
    const deliveredAs: Channel = isIMessageService(data.service) ? 'imessage' : 'sms';

    return {
      providerMessageId: data.message_handle ?? synthId(msg.to, Date.now().toString(), msg.text),
      deliveredAs,
    };
  }

  /**
   * Fire-and-forget typing indicator. Swallows errors — UX-only, never blocks
   * the main reply path. iMessage-only on SendBlue's side; SMS recipients
   * see nothing, which is the expected graceful degradation.
   */
  async sendTyping(to: string): Promise<void> {
    try {
      await fetch(`${BASE_URL}/api/send-typing-indicator`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ number: to, from_number: this.fromNumber }),
      });
    } catch {
      // Non-fatal, ignore.
    }
  }

  verifyWebhookSignature(_rawBody: string, headers: Record<string, string>): boolean {
    if (!this.signingSecret) return true;
    const header = headers['sb-signing-secret'] ?? headers['Sb-Signing-Secret'] ?? '';
    return constantTimeEqual(header, this.signingSecret);
  }

  parseInbound(payload: unknown): InboundMessage | null {
    if (!isObject(payload)) return null;
    const p = payload as SendBlueInboundPayload;

    if (p.is_outbound) return null;
    if (!p.from_number) return null;

    const mediaUrls = Array.isArray(p.media_urls)
      ? p.media_urls
      : p.media_url
        ? [p.media_url]
        : [];

    if (!p.content && mediaUrls.length === 0) return null;

    const channel: Channel = isIMessageService(p.service) ? 'imessage' : 'sms';
    const dateSent = p.date_sent ?? new Date().toISOString();

    return {
      from: p.from_number,
      text: p.content ?? '',
      mediaUrls,
      providerMessageId: synthId(p.from_number, dateSent, p.content ?? mediaUrls[0] ?? ''),
      receivedAt: new Date(dateSent),
      channel,
    };
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'sb-api-key-id': this.apiKeyId,
      'sb-api-secret-key': this.apiSecretKey,
    };
  }
}

function isIMessageService(service: string | undefined): boolean {
  return (service ?? '').toLowerCase() === 'imessage';
}

/**
 * Sendblue's inbound webhook payload doesn't include a stable message ID.
 * Derive a dedupe key from (from, timestamp, first 200 chars of content).
 * Webhook retries replay the exact same payload, so hash matches — good.
 */
function synthId(from: string, dateSent: string, content: string): string {
  return createHash('sha256')
    .update(from)
    .update('|')
    .update(dateSent)
    .update('|')
    .update(content.slice(0, 200))
    .digest('hex');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
