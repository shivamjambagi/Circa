import { json } from "./_shared/http";

export default async function handler() {
  const available = Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.CIRCA_WHATSAPP_NUMBER && process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  return json({ available, number: available ? process.env.CIRCA_WHATSAPP_NUMBER : undefined });
}
