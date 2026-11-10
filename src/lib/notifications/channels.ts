import type { NotificationChannel } from "./dispatch";

function notConfigured(id: NotificationChannel["id"]): NotificationChannel {
  return {
    id,
    isConfigured: () => false,
    send: () => Promise.resolve("failed"),
  };
}

// Neither provider is connected yet. Each reports "not configured", and the SOS
// screen tells the person plainly that nobody was notified.
export const channels: NotificationChannel[] = [notConfigured("web_push"), notConfigured("sms")];
