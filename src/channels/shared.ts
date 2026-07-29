import type { Env } from "../env";

export type ChannelId = "manychat" | "telegram" | "twilio" | "messenger" | "instagram" | "whatsapp";

export interface IncomingMessage {
  channel: ChannelId;
  channelUserId: string;
  displayName?: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  isOwnerMessage?: boolean;
  receivedAt: number;
  rawPayload: unknown;
}

export interface OutgoingReply {
  channel: ChannelId;
  channelUserId: string;
  chunks: string[];
  interChunkDelayMs?: number;
}

export interface ChannelAdapter {
  parseIncoming(request: Request, env: Env): Promise<IncomingMessage>;
  sendReply(reply: OutgoingReply, env: Env): Promise<void>;
  showTyping?(channelUserId: string, env: Env): Promise<void>;
}
