"use client";

import { useState, type ReactElement } from "react";
import {
  analyzeSerpSnippet,
  SERP_CHAR_GUIDANCE,
  type SerpGuidance,
  type SerpVariantMetrics,
} from "@seovista/seo-core";
import { SerpSnippetCard } from "./serp-snippet-card";

interface SerpPreviewToolProps {
  initialTitle: string;
  initialDescription: string;
  initialUrl: string;
}

const GUIDANCE_STATE_TEXT: Record<SerpGuidance, string> = {
  "too-short": "Kısa",
  ok: "Uygun",
  "too-long": "Uzun",
};

function GuidanceChip({ count, min, max, state }: { count: number; min: number; max: number; state: SerpGuidance }): ReactElement {
  const isOk = state === "ok";
  return (
    <p
      className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        isOk ? "border-signal/40 text-signal" : "border-ember/40 text-ember"
      }`}
    >
      <span aria-hidden="true">{isOk ? "✓" : "⚠"}</span>
      <span>
        {count} karakter · hedef {min}-{max} · {GUIDANCE_STATE_TEXT[state]}
      </span>
    </p>
  );
}

function PixelMeter({ label, metrics }: { label: string; metrics: SerpVariantMetrics }): ReactElement {
  const roundedWidth = Math.round(metrics.pixelWidth);
  const ratio = metrics.maxPixelWidth > 0 ? Math.min(100, (metrics.pixelWidth / metrics.maxPixelWidth) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between text-xs text-muted-ink">
        <span>{label}</span>
        <span className="tabular-nums">
          {roundedWidth} / {metrics.maxPixelWidth}px (tahmini)
        </span>
      </div>
      <div
        className="relative mt-1 h-2 rounded-full bg-mineral"
        role="img"
        aria-label={`${label}: ${roundedWidth} / ${metrics.maxPixelWidth}px (tahmini)`}
      >
        <div
          className={`h-2 rounded-full ${metrics.truncated ? "bg-ember" : ratio > 90 ? "bg-ember" : "bg-signal"}`}
          style={{ width: `${ratio}%` }}
        />
        <span aria-hidden="true" className="absolute right-0 -top-0.5 h-3 w-px bg-muted-ink" />
      </div>
      {metrics.truncated ? (
        <p className="mt-1 text-xs font-medium text-ember">
          ⚠ Google bu alanı kısaltacak — önizleme kısaltılmış hâliyle gösteriliyor.
        </p>
      ) : null}
    </div>
  );
}

type CopyState = "idle" | "copied" | "error";

async function copyTextToClipboard(text: string): Promise<boolean> {
  // navigator.clipboard is undefined in non-secure (http) contexts and
  // writeText can reject on permission denial — fall back to execCommand.
  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy fallback below.
    }
  }
  return legacyCopyToClipboard(text);
}

function legacyCopyToClipboard(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function SerpPreviewTool({ initialTitle, initialDescription, initialUrl }: SerpPreviewToolProps): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [siteUrl, setSiteUrl] = useState(initialUrl);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const analysis = analyzeSerpSnippet(title, description);

  async function copyShareLink(): Promise<void> {
    const shareUrl = `${window.location.origin}/tools/serp-preview/?title=${encodeURIComponent(title)}&desc=${encodeURIComponent(description)}&url=${encodeURIComponent(siteUrl)}`;
    const succeeded = await copyTextToClipboard(shareUrl);
    setCopyState(succeeded ? "copied" : "error");
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <section className="mt-8 rounded-xl border border-hairline bg-paper p-6">
      <div className="grid gap-4">
        <div>
          <label htmlFor="serp-title" className="block text-sm font-medium text-muted-ink">
            Sayfa Başlığı
          </label>
          <input
            id="serp-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Örn: SeoVista — GEO ve SEO görünürlük rehberi"
            className="mt-1 block w-full rounded-md border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20"
          />
          <GuidanceChip
            count={title.length}
            min={SERP_CHAR_GUIDANCE.title.min}
            max={SERP_CHAR_GUIDANCE.title.max}
            state={analysis.titleGuidance}
          />
        </div>
        <div>
          <label htmlFor="serp-description" className="block text-sm font-medium text-muted-ink">
            Meta Açıklama
          </label>
          <textarea
            id="serp-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Örn: Sayfanızın arama sonuçlarında görünecek kısa özeti."
            className="mt-1 block w-full rounded-md border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20"
          />
          <GuidanceChip
            count={description.length}
            min={SERP_CHAR_GUIDANCE.description.min}
            max={SERP_CHAR_GUIDANCE.description.max}
            state={analysis.descriptionGuidance}
          />
        </div>
        <div>
          <label htmlFor="serp-url" className="block text-sm font-medium text-muted-ink">
            Görüntülenecek URL
          </label>
          <input
            id="serp-url"
            type="text"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder="https://example.com/sayfa"
            className="mt-1 block w-full rounded-md border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20"
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-ink">Masaüstü Önizleme</h2>
        <div className="mt-3">
          <SerpSnippetCard
            variant="desktop"
            title={analysis.desktop.title.previewText}
            description={analysis.desktop.description.previewText}
            displayUrl={siteUrl}
          />
        </div>
        <PixelMeter label="Başlık genişliği" metrics={analysis.desktop.title} />
        <PixelMeter label="Açıklama genişliği" metrics={analysis.desktop.description} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-ink">Mobil Önizleme</h2>
        <div className="mt-3">
          <SerpSnippetCard
            variant="mobile"
            title={analysis.mobile.title.previewText}
            description={analysis.mobile.description.previewText}
            displayUrl={siteUrl}
          />
        </div>
        <PixelMeter label="Başlık genişliği" metrics={analysis.mobile.title} />
        <PixelMeter label="Açıklama genişliği" metrics={analysis.mobile.description} />
      </div>

      <p className="mt-6 text-xs text-muted-ink">
        Pixel ölçümleri tahminidir; Google'ın gerçek render'ı cihaza göre değişebilir.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void copyShareLink()}
          aria-label="Bağlantıyı Kopyala"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-mineral focus:outline-none focus:ring-2 focus:ring-spectral/20 focus:ring-offset-2"
        >
          {copyState === "copied" ? "Kopyalandı ✓" : "Bağlantıyı Kopyala"}
        </button>
        {copyState === "error" ? (
          <p role="alert" className="mt-2 text-sm text-ember">
            Kopyalama başarısız — metni seçip kopyalayın
          </p>
        ) : null}
      </div>
    </section>
  );
}
