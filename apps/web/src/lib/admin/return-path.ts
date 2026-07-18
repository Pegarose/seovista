export function safeAdminReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//") || value.includes("\\")) return "/admin/";
  return value;
}
