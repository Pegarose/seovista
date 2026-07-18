import { createCmsRepository, type AdminInsightListRow } from "@seovista/worker";
import { getAdminDb } from "../../../../src/lib/admin/db";
import { requireAdminUser } from "../../../../src/lib/admin/session";
import { requireAdminPermission } from "../../../../src/lib/admin/authorization";
import Link from "next/link";
import React from "react";

export default async function AdminCmsListPage(): Promise<React.ReactElement> {
  const user = await requireAdminUser();
  await requireAdminPermission(user, "admin:cms:read");

  const repo = createCmsRepository(getAdminDb());
  const items: AdminInsightListRow[] = await repo.getAllInsightsForAdmin();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">Published</span>;
      case "draft":
        return <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Draft</span>;
      default:
        return <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">{status}</span>;
    }
  };

  return (
    <main id="admin-main" className="mx-auto max-w-7xl" aria-labelledby="admin-cms-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Content Management</p>
          <h1 id="admin-cms-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Content Directory</h1>
          <p className="mt-2 text-sm text-slate-600">Manage and publish content.</p>
        </div>
        <Link href="/admin/cms/new" className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          New Entry
        </Link>
      </div>

      <section className="admin-card mt-8 p-6" aria-labelledby="cms-list-title">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="cms-list-title" className="text-lg font-semibold text-slate-950">Insights & Articles</h2>
            <p className="mt-1 text-sm text-slate-500">All content entries currently tracked by the system.</p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No content entries found.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Title</th>
                  <th className="pb-3 pr-4 font-medium">Slug</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Author</th>
                  <th className="pb-3 pr-4 font-medium">Started At</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{item.title || "Untitled"}</td>
                    <td className="py-3 pr-4 text-slate-500">{item.slug || "-"}</td>
                    <td className="py-3 pr-4">{getStatusBadge(item.status)}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.author_identity || "Unknown"}</td>
                    <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">{new Date(item.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      <Link href={`/admin/cms/${item.id}`} className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
