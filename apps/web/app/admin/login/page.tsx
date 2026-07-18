import { LoginForm } from "../../../src/components/admin/login-form";

export default function AdminLoginPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12" aria-labelledby="admin-login-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">SeoVista / Admin</p>
        <h1 id="admin-login-title" className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use your SeoVista operator credentials to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}
