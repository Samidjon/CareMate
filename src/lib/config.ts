// Only digits and a leading + reach a tel: link, whatever the environment holds.
export function normalizeEmergencyNumber(value: string | undefined): string {
  const cleaned = (value ?? "").trim();
  return /^\+?\d{2,15}$/.test(cleaned) ? cleaned : "103";
}

export const emergencyNumber = normalizeEmergencyNumber(process.env.NEXT_PUBLIC_EMERGENCY_NUMBER);
