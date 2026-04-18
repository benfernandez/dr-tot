import type { MessageProvider, OutboundMessage, SendResult, InboundMessage } from './provider';

// Scaffold only. Wire up during Phase B when TELNYX_API_KEY + messaging profile are provisioned.
export class TelnyxProvider implements MessageProvider {
  readonly name = 'telnyx' as const;

  constructor(
    private readonly apiKey: string,
    private readonly messagingProfileId: string,
    private readonly fromNumber: string,
  ) {}

  async send(_msg: OutboundMessage): Promise<SendResult> {
    throw new Error('TelnyxProvider.send not implemented (Phase B)');
  }

  verifyWebhookSignature(_rawBody: string, _headers: Record<string, string>): boolean {
    throw new Error('TelnyxProvider.verifyWebhookSignature not implemented (Phase B)');
  }

  parseInbound(_payload: unknown): InboundMessage | null {
    throw new Error('TelnyxProvider.parseInbound not implemented (Phase B)');
  }
}
