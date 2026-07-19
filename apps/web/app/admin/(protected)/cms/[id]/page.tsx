import { requireAdminPermission } from "../../../../../src/lib/admin/authorization";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { requireAdminUser } from "../../../../../src/lib/admin/session";
import { createCmsRepository } from "@seovista/worker";
import { EditorForm } from "../../../../../src/components/admin/cms-editor-form";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function AdminCmsEditorPage({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  const user = await requireAdminUser();
  await requireAdminPermission(user, "admin:overview:read");

  const db = getAdminDb();
  const repo = createCmsRepository(db);
  const insight = await repo.getInsightEntryById(params.id);

  if (!insight) {
    notFound();
  }

  return (
    <main id="admin-main" className="mx-auto max-w-5xl" aria-labelledby="admin-editor-title">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
             <Link href="/admin/cms" className="text-sm font-medium text-slate-500 hover:text-slate-950 transition-colors">
               &larr; Back to CMS
             </Link>
          </div>
          <h1 id="admin-editor-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Editing: {insight.title}</h1>
        </div>
      </div>

      <EditorForm id={params.id} initialData={insight} />
    </main>
  );
}

