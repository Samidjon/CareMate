import type { Coordinates } from "@/lib/geo";

/** Screens the assistant may offer to open. Paths are fixed here, never taken from a model. */
export const assistantPages = {
  home: "/",
  map: "/map",
  medicines: "/routine",
  appointments: "/appointments",
  circle: "/circle",
  invite_helper: "/circle#invites-title",
  my_location_sharing: "/location",
  family_locations: "/caregiver/locations",
  people_i_help: "/caregiver",
  sos: "/sos",
  profile: "/profile",
  settings: "/settings",
} as const;

export type AssistantPage = keyof typeof assistantPages;
export const assistantPageKeys = Object.keys(assistantPages) as AssistantPage[];

/**
 * Something the person can do next. Nothing happens until they tap it, which is
 * the confirmation step for anything that changes data or calls someone.
 */
export type AssistantAction =
  | { kind: "open"; page: AssistantPage; path: string; label?: string }
  | { kind: "open_facility"; facilityId: string; label: string }
  | { kind: "call"; number: string; label: string };

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type ReplySource = "quick" | "ai" | "safety" | "offline";

export type AssistantReply = {
  text: string;
  actions: AssistantAction[];
  source: ReplySource;
};

export const quickQuestions = [
  "next_medicine",
  "today_medicines",
  "my_helpers",
  "family_locations",
  "my_sharing",
  "nearest_accessible",
  "nearest_pharmacy",
  "how_sos",
  "invite_helper",
] as const;
export type QuickQuestion = (typeof quickQuestions)[number];

export type AssistantLocale = "uz" | "ru";

export type ToolContextBase = {
  userId: string;
  locale: AssistantLocale;
  /** Only when the person agreed to use their position for this question. */
  origin: Coordinates | null;
  now: Date;
};
