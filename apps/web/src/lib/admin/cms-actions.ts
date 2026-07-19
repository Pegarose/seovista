"use server";

import { getAdminDb } from "./db";
import { requireAdminUser } from "./session";
import { createCmsRepository } from "@seovista/worker";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateCmsEntryAction(
  id: string,
  _prevState: any,
  formData: FormData
) {
  try {
    const user = await requireAdminUser();
    const title = formData.get("title")?.toString() || "";
    const slug = formData.get("slug")?.toString() || "";
    const status = formData.get("status")?.toString() || "draft";
    const rawBlocks = formData.get("blocks")?.toString() || "[]";

    if (!title || !slug) {
      return { error: "Title and slug are required." };
    }

    let parsedBlocks = [];
    try {
      parsedBlocks = JSON.parse(rawBlocks);
    } catch {
      return { error: "Invalid content structure format (JSON parse error)." };
    }

    const payload = {
      title,
      slug,
      status,
      blocks: parsedBlocks
    };

    const repo = createCmsRepository(getAdminDb());
    await repo.updateInsightEntryById(id, payload, user.email);

    revalidatePath(`/insights/${slug}`);
    revalidatePath(`/admin/cms`);
    
  } catch (error: any) {
    return { error: error.message || "An unexpected error occurred." };
  }

  // Next.js redirection gracefully away from save if success
  redirect("/admin/cms");
}

