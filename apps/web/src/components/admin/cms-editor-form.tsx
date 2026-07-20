"use client";

import { useActionState } from "react";
import { updateCmsEntryAction } from "../../lib/admin/cms-actions";
import type { AdminInsightDetail } from "@seovista/worker";
import { useState } from "react";

export function EditorForm({ id, initialData }: { id: string; initialData: AdminInsightDetail }) {
  const updateWithId = updateCmsEntryAction.bind(null, id);
  const [state, formAction, pending] = useActionState<any, FormData>(updateWithId, null);
  const [blocksJson, setBlocksJson] = useState(JSON.stringify(initialData.blocks, null, 2));

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-ink">Article Core Details</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-ink">Display Title</label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  defaultValue={initialData.title}
                  required
                  className="mt-1 block w-full rounded-md border-hairline shadow-sm focus:border-spectral focus:ring-spectral sm:text-sm p-2 border"
                  placeholder="Visibility is earned..."
                />
              </div>
              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-ink">URL Slug</label>
                <input
                  type="text"
                  id="slug"
                  name="slug"
                  defaultValue={initialData.slug}
                  required
                  className="mt-1 block w-full rounded-md border-hairline shadow-sm focus:border-spectral focus:ring-spectral sm:text-sm p-2 border"
                  placeholder="visibility-is-earned"
                />
              </div>
            </div>
          </div>

          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-ink">JSON Document Outline (Blocks)</h2>
            <p className="mt-1 text-sm text-muted-ink">Edit the paragraph and headings array format manually.</p>
            <div className="mt-4">
              <label htmlFor="blocks" className="sr-only">Blocks JSON</label>
              <textarea
                id="blocks"
                name="blocks"
                rows={16}
                value={blocksJson}
                onChange={(e) => setBlocksJson(e.target.value)}
                className="block w-full rounded-md border border-hairline font-mono text-sm shadow-sm focus:border-spectral focus:ring-spectral p-3"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-ink">Publishing</h2>
            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-ink">Status</label>
                <select
                  id="status"
                  name="status"
                  defaultValue={initialData.status}
                  className="mt-1 block w-full rounded-md border-hairline py-2 pl-3 pr-10 text-base focus:border-spectral focus:outline-none focus:ring-spectral sm:text-sm border"
                >
                  <option value="draft">Draft (Hidden)</option>
                  <option value="published">Published (Live)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {state?.error && (
              <div className="mt-4 rounded-md bg-destructive/10 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-destructive-foreground">Save Exception Blocked</h3>
                    <div className="mt-2 text-sm text-destructive">
                      <p>{state.error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-hairline pt-6">
              <button
                type="submit"
                disabled={pending}
                className="flex w-full justify-center rounded-md border border-transparent bg-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ink focus:outline-none focus:ring-2 focus:ring-spectral focus:ring-offset-2 disabled:bg-slate-400"
              >
                {pending ? "Saving constraints..." : "Save Article Content"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}



