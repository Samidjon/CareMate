export type EmergencyMessage = {
  eventId: string;
  patientId: string;
  latitude: number | null;
  longitude: number | null;
  manualAddress: string | null;
  createdAt: string;
};

export type DeliveryStatus = "sent" | "failed" | "not_configured";

/**
 * A way to reach someone. A channel reports only what really happened. Web Push
 * and SMS plug in here, and neither pretends: "sent" means the provider accepted
 * the message, not that the person received it.
 */
export interface NotificationChannel {
  readonly id: "web_push" | "sms";
  isConfigured(): boolean;
  send(recipientId: string, message: EmergencyMessage): Promise<"sent" | "failed">;
}

export type DispatchSummary = {
  status: "no_recipients" | "not_configured" | "sent" | "partial" | "failed";
  recipients: number;
  reached: number;
};

export type DeliveryRecord = { recipientId: string; channel: NotificationChannel["id"]; status: DeliveryStatus };

export async function dispatchEmergency(
  recipients: string[],
  channels: NotificationChannel[],
  message: EmergencyMessage,
  record: (entries: DeliveryRecord[]) => Promise<void>,
): Promise<DispatchSummary> {
  if (recipients.length === 0) return { status: "no_recipients", recipients: 0, reached: 0 };

  const entries: DeliveryRecord[] = [];
  const reached = new Set<string>();
  let attempted = false;

  await Promise.all(
    recipients.flatMap((recipientId) =>
      channels.map(async (channel) => {
        if (!channel.isConfigured()) {
          entries.push({ recipientId, channel: channel.id, status: "not_configured" });
          return;
        }
        attempted = true;
        let status: DeliveryStatus = "failed";
        try {
          status = await channel.send(recipientId, message);
        } catch {
          status = "failed";
        }
        if (status === "sent") reached.add(recipientId);
        entries.push({ recipientId, channel: channel.id, status });
      }),
    ),
  );
  await record(entries);

  const summary = { recipients: recipients.length, reached: reached.size };
  if (!attempted) return { status: "not_configured", ...summary };
  if (reached.size === 0) return { status: "failed", ...summary };
  return { status: reached.size === recipients.length ? "sent" : "partial", ...summary };
}
