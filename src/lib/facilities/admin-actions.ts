"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";

/** Records an administrator's decision. Row Level Security allows this to admins only. */
export async function reviewReportAction(formData: FormData) {
  const decision = formData.get("decision");
  if (decision !== "accepted" && decision !== "rejected") return;
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return;
  const { error } = await supabase
    .from("facility_reports")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", String(formData.get("id")));
  if (error) console.error("Report review failed:", error.code);
  revalidatePath("/admin/reports");
}
