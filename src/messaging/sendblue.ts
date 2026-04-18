import type { MessageProvider, OutboundMessage, SendResult, InboundMessage } from './provider';

// Scaffold only. Wire up during Phase B when SENDBLUE_API_KEY is provisioned.
export class SendBlueProvider implements MessageProvider {
  readonly name = 'sendblue' as const;

  constructor(private readonly apiKey: string) {}

  async send(_msg: OutboundMessage): Promise<SendResult> {
    throw new Error('SendBlueProvider.send not implemented (Phase B)');
  }

  verifyWebhookSignature(_rawBody: string, _headers: Record<string, string>): boolean {
    throw new Error('SendBlueProvider.verifyWebhookSignature not implemented (Phase B)');
  }

  parseInbound(_payload: unknown): InboundMessage | null {
    throw new Error('SendBlueProvider.parseInbound not implemented (Phase B)');
  }
}
