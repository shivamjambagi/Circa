import type { CommunityMessagingAdapter, IncomingCommunityMessage } from "./CommunityMessagingAdapter";

export class WhatsAppOneToOneAdapter implements CommunityMessagingAdapter {
  receive(payload: unknown): IncomingCommunityMessage[] {
    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ id?: string; from?: string; timestamp?: string; text?: { body?: string } }> } }> }> })?.entry || [];
    return entries.flatMap((entry) => entry.changes || []).flatMap((change) => change.value?.messages || []).flatMap((message) => message.id && message.from && message.text?.body ? [{ id: message.id, sender: message.from, text: message.text.body, receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString() }] : []);
  }

  async send(recipient: string, text: string) {
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN; const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID; const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    if (!accessToken || !phoneNumberId) throw new Error("WhatsApp sending is not configured.");
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body: text.slice(0, 3500) } }) });
    if (!response.ok) throw new Error(`Meta rejected a WhatsApp message (${response.status}).`);
  }
}
