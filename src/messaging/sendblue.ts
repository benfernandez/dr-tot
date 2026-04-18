import type {
  Channel,
  InboundMessage,
  MessageProvider,
  OutboundMessage,
  SendResult,
} from './provider';

interface SendBlueSendResponse {
  content: string;
  status: string;
  error_code?: number | null;
  error_message?: string | null;
  message_handle: string;
  number: string;
  service?: string;
  was_downgraded?: boolean;
}

interface SendBlueInboundPayload {
  accountEmail?: string;
  content?: string;
  is_outbound?: boolean;
  message_handle?: string;
  date_sent?: string;
  from_number?: string;
  number?: string;
  was_downgraded?: boolean;
  media_url?: string | null;
  media_urls?: string[];
}

const SEND_URL = 'https://api.sendblue.co/api/send-message';

/**
 * SendBlue is the primary messaging backend. Messages are sent as iMessage
 * when the recipient is on iOS; if not, SendBlue internally downgrades to
 * SMS and flags `was_downgraded: true` in the response. We record that in
 * user.preferred_channel so future sends know what to expect.
 */
export class SendBlueProvider implements MessageProvider {
  readonly name = 'sendblue' as const;

  constructor(
    private readonly apiKeyId: string,
    private readonly apiSecretKey: string,
    private readonly signingSecret: string,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const body: Record<string, unknown> = {
      number: msg.to,
      content: msg.text,
    };
    if (msg.mediaUrls && msg.mediaUrls.length > 0) {
      body.media_url = msg.mediaUrls[0];
    }

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': this.apiKeyId,
        'sb-api-secret-key': this.apiSecretKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SendBlue send failed: ${res.status} ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as SendBlueSendResponse;
    const deliveredAs: Channel = data.was_downgraded || data.service === 'sms' ? 'sms' : 'imessage';

    return {
      providerMessageId: data.message_handle,
      deliveredAs,
    };
  }

  /**
   * SendBlue's model is a shared-secret header. Configure the secret in the
   * SendBlue dashboard, match against the inbound `sb-signing-secret` header.
   * Constant-time compare to avoid timing side channels.
   */
  verifyWebhookSignature(_rawBody: string, headers: Record<string, string>): boolean {
    const header = headers['sb-signing-secret'] ?? headers['Sb-Signing-Secret'] ?? '';
    return constantTimeEqual(header, this.signingSecret);
  }

  parseInbound(payload: unknown): InboundMessage | null {
    if (!isObject(payload)) return null;
    const p = payload as SendBlueInboundPayload;

    if (p.is_outbound) return null;
    if (!p.content && !p.media_url && (!p.media_urls || p.media_urls.length === 0)) return null;
    if (!p.from_number || !p.message_handle) return null;

    const mediaUrls = Array.isArray(p.media_urls)
      ? p.media_urls
      : p.media_url
        ? [p.media_url]
        : [];

    const channel: Channel = p.was_downgraded ? 'sms' : 'imessage';

    return {
      from: p.from_number,
      text: p.content ?? '',
      mediaUrls,
      providerMessageId: p.message_handle,
      receivedAt: p.date_sent ? new Date(p.date_sent) : new Date(),
      channel,
    };
  }
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
