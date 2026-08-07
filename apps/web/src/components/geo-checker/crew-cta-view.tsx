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
 * - English copy (editorial lab spec, Crew CTA heading).
 */
export function CrewCtaView({ scoreBand }: CrewCtaViewProps): ReactElement {
  const isLowScore = scoreBand === "critical" || scoreBand === "poor";
  
  const ctaText = isLowScore 
    ? "Get expert help" 
    : "Fine-tune";
    
  const ctaDescription = isLowScore
    ? "Contact our agency to fix critical issues and lift your site's visibility in AI search."
    : "Get optimization tips to take your current standing to the next level.";
    
  const href = "/contact/";

  return (
    <section
      aria-labelledby="crew-cta-heading"
      className="bg-mineral p-6 rounded-xl border border-hairline w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div className="flex-1">
        <h3 id="crew-cta-heading" className="text-lg font-semibold text-ink mb-1">
          Need a hand with the next step?
        </h3>
        <p className="text-sm text-muted-ink">
          {ctaDescription}
        </p>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-mineral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spectral focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2"
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
