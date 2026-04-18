export type Channel = 'imessage' | 'sms';

export interface OutboundMessage {
  to: string;
  text: string;
  mediaUrls?: string[];
}

export interface InboundMessage {
  from: string;
  text: string;
  mediaUrls: string[];
  providerMessageId: string;
  receivedAt: Date;
  channel: Channel;
}

export interface SendResult {
  providerMessageId: string;
  deliveredAs: Channel;
}

export interface MessageProvider {
  readonly name: 'sendblue' | 'telnyx';
  send(msg: OutboundMessage): Promise<SendResult>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;
  parseInbound(payload: unknown): InboundMessage | null;
}
