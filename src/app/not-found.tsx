import Link from "next/link";
import { getMessages } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getMessages();
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.notFound.title}</h1>
      <Link href="/" className="btn btn-primary">
        {t.common.backHome}
      </Link>
    </div>
  );
}
