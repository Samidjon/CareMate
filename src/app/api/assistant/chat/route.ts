import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { assistantModelConfig } from "@/lib/ai/config";
import { loadProfile, type ToolContext } from "@/lib/ai/data";
import { asksToChangeTreatment, looksLikeEmergency, matchIntent } from "@/lib/ai/intents";
import { AnthropicAssistantModel, systemPrompt } from "@/lib/ai/model";
import { answerQuick, emergencyReply, treatmentReply } from "@/lib/ai/quick";
import { assistantTools, runTool } from "@/lib/ai/tools";
import { quickQuestions, type AssistantAction, type AssistantReply } from "@/lib/ai/types";
import { emergencyNumber } from "@/lib/config";
import { tashkentDate, tashkentTime } from "@/lib/routine/schedule";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { createClient, getUser } from "@/lib/supabase/server";

const body = z.object({
  locale: z.enum(["uz", "ru"]),
  quick: z.enum(quickQuestions).nullable().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(20)
    .refine((turns) => turns.at(-1)?.role === "user"),
  origin: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
});

type AiStatus = "ready" | "not_configured" | "unavailable";

const respond = (reply: AssistantReply, ai: AiStatus) => NextResponse.json({ reply, ai });

const offline = (locale: "uz" | "ru"): AssistantReply => ({
  source: "offline",
  actions: [],
  text:
    locale === "ru"
      ? "Сейчас я могу ответить только на быстрые вопросы ниже: о лекарствах, помощниках, местоположении близких и ближайших местах. Все остальные разделы приложения работают как обычно."
      : "Hozir men faqat quyidagi tezkor savollarga javob bera olaman: dorilar, yordamchilar, yaqinlar joylashuvi va eng yaqin joylar haqida. Ilovaning boshqa bo‘limlari odatdagidek ishlaydi.",
});

function uniqueActions(actions: AssistantAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.kind === "call" ? `call:${action.number}` : action.kind === "open" ? `open:${action.path}` : `place:${action.facilityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

/**
 * The CareMate assistant. Personal data is read with the person's own session, so
 * Row Level Security decides what can be seen, exactly as on the screens. Messages
 * are not stored or logged on the server.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await isWithinRateLimit("assistant", user.id, 30, 600))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const input = parsed.data;
  const config = assistantModelConfig();
  const aiStatus: AiStatus = config ? "ready" : "not_configured";
  const ctx: ToolContext = { supabase, userId: user.id, locale: input.locale, origin: input.origin ?? null, now: new Date() };
  const question = input.messages.at(-1)!.text;

  if (input.quick) return respond(await answerQuick(ctx, input.quick), aiStatus);
  if (looksLikeEmergency(question)) return respond(emergencyReply(input.locale), aiStatus);
  if (asksToChangeTreatment(question)) return respond(treatmentReply(input.locale), aiStatus);

  if (!config) {
    const intent = matchIntent(question);
    return respond(intent ? await answerQuick(ctx, intent) : offline(input.locale), aiStatus);
  }

  const actions: AssistantAction[] = [];
  try {
    const profile = await loadProfile(ctx);
    const model = new AnthropicAssistantModel(config);
    const answer = await model.reply({
      system: systemPrompt({
        locale: input.locale,
        name: profile.status === "ok" ? profile.name : "",
        role: profile.status === "ok" ? String(profile.role) : "unknown",
        now: `${tashkentDate(ctx.now)} ${tashkentTime(ctx.now)}`,
        emergencyNumber,
      }),
      turns: input.messages,
      tools: assistantTools,
      runTool: async (name, toolInput) => {
        const outcome = await runTool(ctx, name, toolInput);
        actions.push(...outcome.actions);
        return { content: JSON.stringify(outcome.result), isError: outcome.isError };
      },
      signal: request.signal,
    });
    if (answer.refused || !answer.text) {
      const intent = matchIntent(question);
      return respond(intent ? await answerQuick(ctx, intent) : offline(input.locale), "ready");
    }
    return respond({ text: answer.text, actions: uniqueActions(actions), source: "ai" }, "ready");
  } catch (error) {
    // The status or error type only: never the question or the key.
    console.error("Assistant model failed:", error instanceof Anthropic.APIError && error.status ? error.status : error instanceof Error ? error.name : "unknown");
    const intent = matchIntent(question);
    return respond(intent ? await answerQuick(ctx, intent) : offline(input.locale), "unavailable");
  }
}
