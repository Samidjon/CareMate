"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keeps the page's data current while it stays open. */
export function RefreshPeriodically({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
