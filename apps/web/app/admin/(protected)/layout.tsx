import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "../../../src/lib/admin/session";
import { AdminShell } from "../../../src/components/admin/admin-shell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin | SeoVista",
  description: "Private SeoVista operations console.",
  robots: { index: false, follow: false },
};

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const user = await getCurrentAdminUser();
  
  if (!user) {
    redirect("/admin/login/");
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
