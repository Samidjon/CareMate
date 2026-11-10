import Image from "next/image";
import { getMessages } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getMessages();
  return (
    <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Image src="/brand/caremate-icon.svg" alt="" width={96} height={96} priority />
      <p className="text-[1.2rem] font-bold">{t.header.loading}</p>
    </div>
  );
}
