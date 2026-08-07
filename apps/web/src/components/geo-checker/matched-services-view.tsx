import type { ReactElement } from "react";
import type { MatchedService } from "@seovista/geo-engine";

interface MatchedServicesViewProps {
  services: MatchedService[];
}

/**
 * Renders the matched Crew Agency services ranked by relevance (VAL-B-UI-003, VAL-B-UI-005, VAL-B-CROSS-*).
 *
 * Requirements:
 * - Renders matchedServices in the SAME persisted order.
 * - Shows service name and description.
 * - Graceful empty-state when array is empty.
 * - All text is Turkish.
 */
export function MatchedServicesView({ services }: MatchedServicesViewProps): ReactElement | null {
  if (!services || services.length === 0) {
    return (
      <section
        aria-labelledby="matched-services-heading"
        className="bg-paper p-6 rounded-xl border border-hairline w-full max-w-4xl mx-auto"
      >
        <h2
          id="matched-services-heading"
          className="text-xl font-semibold text-ink font-serif mb-1"
        >
          Önerilen Servisler
        </h2>
        <p className="text-sm text-muted-ink">
          Bu analiz sonucunda öncelikli bir servis eşleşmesi bulunamadı.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="matched-services-heading"
      className="bg-paper p-6 rounded-xl border border-hairline w-full max-w-4xl mx-auto"
    >
      <h2
        id="matched-services-heading"
        className="text-xl font-semibold text-ink font-serif mb-4"
      >
        Önerilen Servisler
      </h2>
      <ul className="space-y-4">
        {services.map((service) => (
          <li
            key={service.service_id}
            className="rounded-lg border border-hairline bg-mineral p-4"
          >
            <h3 className="font-semibold text-ink mb-2">
              {service.name}
            </h3>
            <p className="text-sm text-muted-ink">
              {service.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
