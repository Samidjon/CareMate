import "server-only";
import { z } from "zod";
import { facilityCategories } from "@/lib/facilities/types";
import {
  loadCareCircle,
  loadFacility,
  loadMedicines,
  loadMySharing,
  loadPersonMedicines,
  loadProfile,
  loadSharedLocations,
  searchFacilities,
  type ToolContext,
} from "./data";
import { assistantPageKeys, assistantPages, type AssistantAction, type AssistantPage } from "./types";

export type ToolOutcome = { result: unknown; actions: AssistantAction[] };

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type AssistantTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /** Checks the input again on the server: a model's arguments are never trusted. */
  input: z.ZodType;
  run: (ctx: ToolContext, input: never) => Promise<ToolOutcome>;
};

const noInput: JsonSchema = { type: "object", properties: {}, required: [], additionalProperties: false };
const open = (page: AssistantPage): AssistantAction => ({ kind: "open", page, path: assistantPages[page] });

function tool<Schema extends z.ZodType>(definition: {
  name: string;
  description: string;
  input_schema: JsonSchema;
  input: Schema;
  run: (ctx: ToolContext, input: z.infer<Schema>) => Promise<ToolOutcome>;
}): AssistantTool {
  return definition as unknown as AssistantTool;
}

export const assistantTools: AssistantTool[] = [
  tool({
    name: "get_my_medicines",
    description:
      "The signed-in person's own medicine schedule: today's doses with their state (upcoming, due, snoozed, taken, skipped, missed) and the next dose. Times are Fergana local time (Asia/Tashkent).",
    input_schema: noInput,
    input: z.object({}).strict(),
    run: async (ctx) => ({ result: await loadMedicines(ctx, ctx.userId), actions: [open("medicines")] }),
  }),
  tool({
    name: "get_care_circle",
    description:
      "The person's active helpers (and what each helper may see), and the people this person helps (with their patient_id and what they shared). Use it to find a patient_id before asking about someone else.",
    input_schema: noInput,
    input: z.object({}).strict(),
    run: async (ctx) => ({ result: await loadCareCircle(ctx), actions: [open("circle")] }),
  }),
  tool({
    name: "get_person_medicines",
    description:
      "Medicine schedule of someone this person helps. Works only if that person shared medicines with them; otherwise returns not_shared or not_connected. Get patient_id from get_care_circle first.",
    input_schema: {
      type: "object",
      properties: { patient_id: { type: "string", description: "patient_id from get_care_circle" } },
      required: ["patient_id"],
      additionalProperties: false,
    },
    input: z.object({ patient_id: z.uuid() }).strict(),
    run: async (ctx, input) => ({
      result: await loadPersonMedicines(ctx, input.patient_id),
      actions: [{ kind: "open", page: "people_i_help", path: `/caregiver/${input.patient_id}` }],
    }),
  }),
  tool({
    name: "get_family_locations",
    description:
      "Last known locations shared with this person by the people they help. Only people who are actively sharing have a position; paused or stopped sharing returns no position. This is never live tracking.",
    input_schema: noInput,
    input: z.object({}).strict(),
    run: async (ctx) => ({ result: await loadSharedLocations(ctx), actions: [open("family_locations")] }),
  }),
  tool({
    name: "get_my_location_sharing",
    description: "Whom the signed-in person is sharing their own location with, and whether each share is active or paused.",
    input_schema: noInput,
    input: z.object({}).strict(),
    run: async (ctx) => ({ result: await loadMySharing(ctx), actions: [open("my_location_sharing")] }),
  }),
  tool({
    name: "search_facilities",
    description:
      "Search the CareMate directory of medical places in Fergana. near_me sorts by distance from the person's position and returns needs_location if they have not shared it for this question. wheelchair_only keeps only places with confirmed wheelchair access.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words from the name or address; empty string for none" },
        category: { type: "string", enum: ["all", ...facilityCategories] },
        wheelchair_only: { type: "boolean" },
        near_me: { type: "boolean" },
        limit: { type: "integer", enum: [1, 3, 5, 8] },
      },
      required: ["query", "category", "wheelchair_only", "near_me", "limit"],
      additionalProperties: false,
    },
    input: z
      .object({
        query: z.string().max(100),
        category: z.enum(["all", ...facilityCategories]),
        wheelchair_only: z.boolean(),
        near_me: z.boolean(),
        limit: z.number().int().min(1).max(8),
      })
      .strict(),
    run: async (ctx, input) => {
      const result = await searchFacilities(ctx, {
        query: input.query,
        category: input.category,
        wheelchairOnly: input.wheelchair_only,
        nearMe: input.near_me,
        limit: input.limit,
      });
      const actions: AssistantAction[] =
        result.status === "ok" ? result.facilities.slice(0, 3).map((place) => ({ kind: "open_facility", facilityId: place.id, label: place.name })) : [open("map")];
      return { result, actions };
    },
  }),
  tool({
    name: "get_facility",
    description:
      "Full details of one medical place: address, opening hours, phone numbers with their verification, and accessibility features (yes, no or unknown). Unknown means nobody has checked, not that it is missing.",
    input_schema: {
      type: "object",
      properties: { facility_id: { type: "string" } },
      required: ["facility_id"],
      additionalProperties: false,
    },
    input: z.object({ facility_id: z.string().max(64) }).strict(),
    run: async (ctx, input) => {
      const result = await loadFacility(ctx, input.facility_id);
      const actions: AssistantAction[] = [];
      if (result.status === "ok") {
        actions.push({ kind: "open_facility", facilityId: result.id, label: result.name });
        const callable = result.phones.find((phone) => phone.e164);
        if (callable?.e164) actions.push({ kind: "call", number: callable.e164, label: callable.number });
      }
      return { result, actions };
    },
  }),
  tool({
    name: "get_my_profile",
    description: "The signed-in person's name, role (patient, caregiver or admin), city and preferred language.",
    input_schema: noInput,
    input: z.object({}).strict(),
    run: async (ctx) => ({ result: await loadProfile(ctx), actions: [] }),
  }),
  tool({
    name: "offer_page",
    description:
      "Offer the person a button that opens a CareMate screen. Nothing opens until they tap it. Use invite_helper to help someone invite a helper, sos for emergencies.",
    input_schema: {
      type: "object",
      properties: { page: { type: "string", enum: assistantPageKeys } },
      required: ["page"],
      additionalProperties: false,
    },
    input: z.object({ page: z.enum(assistantPageKeys as [AssistantPage, ...AssistantPage[]]) }).strict(),
    run: async (_ctx, input) => ({ result: { status: "offered", page: input.page }, actions: [open(input.page)] }),
  }),
];

/** Runs one tool call. Unknown tools, bad input and failures become a plain error result. */
export async function runTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<ToolOutcome & { isError: boolean }> {
  const definition = assistantTools.find((item) => item.name === name);
  if (!definition) return { result: { error: "unknown_tool" }, actions: [], isError: true };
  const parsed = definition.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { result: { error: "invalid_input" }, actions: [], isError: true };
  try {
    const outcome = await definition.run(ctx, parsed.data as never);
    return { ...outcome, isError: false };
  } catch (error) {
    console.error("Assistant tool failed:", name, error instanceof Error ? error.name : "unknown");
    return { result: { error: "failed" }, actions: [], isError: true };
  }
}
