import { readAdminOverview } from "@seovista/worker";
import { requireAdminPermission } from "../../../src/lib/admin/authorization";
import { getAdminDb } from "../../../src/lib/admin/db";
import { requireAdminUser } from "../../../src/lib/admin/session";

export default async function AdminOverviewPage(): Promise<React.ReactElement> {
  const user = await requireAdminUser();
  await requireAdminPermission(user, "admin:overview:read");
  const overview = await readAdminOverview(getAdminDb());
  const completedJobs = overview.jobCounts.completed ?? 0;
  const activeJobs = (overview.jobCounts.queued ?? 0) + (overview.jobCounts.running ?? 0);

  return (
    <main id="admin-main" className="mx-auto max-w-7xl" aria-labelledby="admin-overview-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</p>
          <h1 id="admin-overview-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Overview</h1>
          <p className="mt-2 max-w-2xl text-slate-600">A read-only view of the SeoVista platform foundations and current operational evidence.</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">Global operator</span>
      </div>

      <section aria-label="Key metrics" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active admins" value={String(overview.activeAdminUsers)} detail="Identity records" />
        <MetricCard label="Completed jobs" value={String(completedJobs)} detail={`${activeJobs} queued or running`} />
        <MetricCard label="Audit events today" value={String(overview.auditEventsToday)} detail="Append-only activity" />
        <MetricCard label="API cost today" value={overview.apiCostToday} detail="Ledger total" />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="admin-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Dependency health</h2>
              <p className="mt-1 text-sm text-slate-500">Availability reported by the current server boundary.</p>
            </div>
          </div>
          <ul className="mt-5 divide-y divide-slate-100">
            {overview.dependencies.map((dependency) => (
              <li key={dependency.name} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-700">{dependency.name}</span>
                <span className={dependency.status === "available" ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-amber-700"}>
                  {dependency.status === "available" ? "Available" : "Not connected"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-card p-6">
          <h2 className="text-lg font-semibold text-slate-950">Job status</h2>
          <ul className="mt-5 space-y-3">
            {Object.entries(overview.jobCounts).length === 0 ? (
              <li className="text-sm text-slate-500">No jobs have been recorded yet.</li>
            ) : (
              Object.entries(overview.jobCounts).map(([status, count]) => (
                <li key={status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm capitalize text-slate-700">{status}</span>
                  <span className="text-sm font-semibold text-slate-950">{count}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="admin-card mt-6 p-6" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="recent-activity-title" className="text-lg font-semibold text-slate-950">Recent activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest bounded audit records. Secrets are excluded at write time.</p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          {overview.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">No audit activity has been recorded yet.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="pb-3 pr-4 font-medium">Action</th><th className="pb-3 pr-4 font-medium">Actor</th><th className="pb-3 pr-4 font-medium">Outcome</th><th className="pb-3 font-medium">Time</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.recentActivity.map((activity, index) => (
                  <tr key={`${activity.recordedAt.toISOString()}-${index}`}>
                    <td className="py-3 pr-4 font-medium text-slate-700">{activity.action}</td>
                    <td className="py-3 pr-4 text-slate-600">{activity.actorIdentity}</td>
                    <td className="py-3 pr-4 text-slate-600">{activity.outcome}</td>
                    <td className="py-3 text-slate-500">{activity.recordedAt.toISOString()}</td>
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

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }): React.ReactElement {
  return <div className="admin-card p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}
