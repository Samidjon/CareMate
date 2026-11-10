import type { Metadata } from "next";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { AssistantChat } from "@/components/assistant-chat";
import { requireSession } from "@/lib/account/guard";
import { assistantModelConfig } from "@/lib/ai/config";
import { getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "CareMate yordamchisi — CareMate" };

/** The assistant answers from the person's own data, so it needs a signed-in session. */
export default async function AssistantPage() {
  const t = await getMessages();
  const a = t.assistant;
  const session = await requireSession("/assistant");
  if (!session) return <AccountsNotConfigured t={t} title={a.title} />;
  return (
    <div className="flex flex-col gap-4">
      <h1>{a.title}</h1>
      <p>{a.intro}</p>
      <AssistantChat aiReady={assistantModelConfig() !== null} />
      <p className="secondary-text text-[0.9rem] text-muted">{a.disclaimer}</p>
      <p className="secondary-text text-[0.9rem] text-muted">{a.privacy}</p>
    </div>
  );
}
