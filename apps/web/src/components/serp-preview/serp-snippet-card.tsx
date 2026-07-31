import type { ReactElement } from "react";

interface SerpSnippetCardProps {
  variant: "desktop" | "mobile";
  title: string;
  description: string;
  displayUrl: string;
}

function breadcrumbFor(displayUrl: string): string {
  if (!displayUrl.trim()) return "example.com";
  try {
    const url = new URL(displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`);
    const path = url.pathname.replace(/\/$/, "");
    return path ? `${url.hostname} › ${path.slice(1).replace(/\//g, " › ")}` : url.hostname;
  } catch {
    return displayUrl;
  }
}

export function SerpSnippetCard({ variant, title, description, displayUrl }: SerpSnippetCardProps): ReactElement {
  const isDesktop = variant === "desktop";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-700">{breadcrumbFor(displayUrl)}</p>
      <p
        className={`mt-0.5 text-[#1a0dab] hover:underline cursor-pointer ${isDesktop ? "text-xl" : "text-lg"} leading-snug`}
        data-testid={`${variant}-title`}
      >
        {title || "Sayfa başlığınız burada görünecek"}
      </p>
      <p className="mt-0.5 text-sm text-gray-600 leading-normal" data-testid={`${variant}-description`}>
        {description || "Meta açıklamanız burada görünecek. Arama sonuçlarında kullanıcıların göreceği özet metindir."}
      </p>
    </div>
  );
}
