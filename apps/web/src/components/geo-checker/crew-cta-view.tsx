import type { ReactElement } from "react";
import type { ScoreBreakdown } from "@seovista/geo-engine";

interface CrewCtaViewProps {
  scoreBand: ScoreBreakdown["band"];
}

/**
 * Renders the score-band personalized Crew Agency CTA (VAL-B-UI-002, VAL-B-UI-005, VAL-B-CROSS-*).
 *
 * Requirements:
 * - Copy varies by score band (critical/poor -> strong, good/excellent/needs_improvement -> soft).
 * - Native <a> tag pointing to actual destination.
 * - Icon+text indication (accessibility requirement).
 * - Turkish copy.
 */
export function CrewCtaView({ scoreBand }: CrewCtaViewProps): ReactElement {
  const isLowScore = scoreBand === "critical" || scoreBand === "poor";
  
  const ctaText = isLowScore 
    ? "Uzman desteği al" 
    : "İnce ayar";
    
  const ctaDescription = isLowScore
    ? "Kritik sorunları çözmek ve sitenizin sıralamasını yükseltmek için Ajansımızla iletişime geçin."
    : "Mevcut başarılı durumunuzu bir sonraki seviyeye taşımak için optimizasyon ipuçları alın.";
    
  const href = "/contact/";

  return (
    <section
      aria-labelledby="crew-cta-heading"
      className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div className="flex-1">
        <h3 id="crew-cta-heading" className="text-lg font-semibold text-slate-900 mb-1">
          Performansınızı Artırın
        </h3>
        <p className="text-sm text-slate-700">
          {ctaDescription}
        </p>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        aria-label={`${ctaText} - Crew Agency`}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {isLowScore ? "🚀" : "✨"}
        </span>
        <span>{ctaText}</span>
      </a>
    </section>
  );
}
