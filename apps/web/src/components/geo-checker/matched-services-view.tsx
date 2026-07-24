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
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full max-w-4xl mx-auto"
      >
        <h2
          id="matched-services-heading"
          className="text-xl font-semibold text-slate-900 font-display mb-1"
        >
          Önerilen Servisler
        </h2>
        <p className="text-sm text-slate-500">
          Bu analiz sonucunda öncelikli bir servis eşleşmesi bulunamadı.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="matched-services-heading"
      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full max-w-4xl mx-auto"
    >
      <h2
        id="matched-services-heading"
        className="text-xl font-semibold text-slate-900 font-display mb-4"
      >
        Önerilen Servisler
      </h2>
      <ul className="space-y-4">
        {services.map((service) => (
          <li
            key={service.service_id}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="font-semibold text-slate-900 mb-2">
              {service.name}
            </h3>
            <p className="text-sm text-slate-700">
              {service.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
