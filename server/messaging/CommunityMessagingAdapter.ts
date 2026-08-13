export type IncomingCommunityMessage = { id: string; sender: string; text: string; receivedAt: string };
export interface CommunityMessagingAdapter {
  receive(payload: unknown): IncomingCommunityMessage[];
  send(recipient: string, text: string): Promise<void>;
}
