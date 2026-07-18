import Link from "next/link";
import type { SessionUser } from "../../lib/admin/session";

const navigation = [
  { label: "Overview", href: "/admin/", available: true },
  { label: "Audit activity", href: "#audit", available: false },
  { label: "Jobs", href: "#jobs", available: false },
  { label: "Cost ledger", href: "#costs", available: false },
] as const;

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="admin-shell flex min-h-screen flex-col md:flex-row">
      <aside className="w-full border-b border-slate-200 bg-slate-950 text-slate-100 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-5 md:block">
          <Link href="/admin/" className="text-lg font-semibold tracking-tight text-white">
            SeoVista <span className="text-emerald-300">/ Admin</span>
          </Link>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">Operator</span>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-2 overflow-x-auto px-3 pb-4 md:block md:space-y-1 md:px-3">
          {navigation.map((item) =>
            item.available ? (
              <Link
                key={item.label}
                href={item.href}
                className="block whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-500" aria-disabled="true">
                {item.label} <span className="text-xs">Soon</span>
              </span>
            ),
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Private operations</p>
            <p className="mt-1 text-sm text-slate-600">{user.email}</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
              Sign out
            </button>
          </form>
        </header>
        <div className="flex-1 px-5 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}
