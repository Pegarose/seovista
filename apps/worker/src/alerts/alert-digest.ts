import type { EmailProvider, EmailPayload } from "@seovista/reports";
import type { Logger } from "../utils/logger.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

export interface AlertDigestRepo {
  listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>;
  markAlertsEmailed(alertIds: string[]): Promise<void>;
}

export interface AlertDigestDeps {
  repo: AlertDigestRepo;
  email: EmailProvider;
  logger: Logger;
  /** Trusted public origin, e.g. NEXT_PUBLIC_SITE_URL. Used to build the panel link. */
  siteUrl: string;
  /** From address for the digest email. */
  fromEmail: string;
}

export interface AlertDigestResult {
  sessionsNotified: number;
  alertsEmailed: number;
  failures: number;
}

const KIND_LABEL: Record<UnsentAlertRow["kind"], string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function lineText(alert: UnsentAlertRow): string {
  const base = `"${alert.keyword}" (${alert.domain}): ${KIND_LABEL[alert.kind]}`;
  if (alert.kind === "dropped_out_of_top10") return `${base} (önceki #${alert.from_position})`;
  if (alert.kind === "entered_top10") return `${base} (#${alert.to_position})`;
  return `${base} (#${alert.from_position} → #${alert.to_position})`;
}

function groupBySession(rows: UnsentAlertRow[]): Map<string, UnsentAlertRow[]> {
  const groups = new Map<string, UnsentAlertRow[]>();
  for (const r of rows) {
    const list = groups.get(r.sessionId) ?? [];
    list.push(r);
    groups.set(r.sessionId, list);
  }
  return groups;
}

/**
 * Send one digest email per consenting session that has unsent alerts, then
 * mark those alerts as emailed. Runs inside the daily tracker_scan job after
 * the scan loop. A provider failure for one session leaves its alerts
 * `emailed_at` NULL so the next day's digest naturally retries them.
 */
export async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult> {
  const rows = await deps.repo.listUnsentAlertsForDigest();
  if (rows.length === 0) {
    return { sessionsNotified: 0, alertsEmailed: 0, failures: 0 };
  }

  const groups = groupBySession(rows);
  let sessionsNotified = 0;
  let alertsEmailed = 0;
  let failures = 0;
  const allEmailedIds: string[] = [];

  for (const [sessionId, alerts] of groups) {
    const first = alerts[0]!;
    const subject = `SeoVista takip uyarıları — ${formatDate(new Date())}`;
    const bodyLines = alerts.map(lineText);
    const panelUrl = `${deps.siteUrl.replace(/\/$/, "")}/tracker/${first.token}`;
    const textBody = `${bodyLines.join("\n")}\n\nUyarılarınızı görmek için: ${panelUrl}`;

    const payload: EmailPayload = {
      to: { email: first.email },
      from: { email: deps.fromEmail },
      subject,
      textBody,
      consent: {
        marketing: true,
        analytics: false,
        timestamp: first.alert_consent_updated_at?.toISOString() ?? new Date().toISOString(),
      },
      source: "tracker-alerts",
      scenario: "success",
    };

    const outcome = await deps.email.send(payload);
    if (outcome.success) {
      sessionsNotified += 1;
      alertsEmailed += alerts.length;
      allEmailedIds.push(...alerts.map((a) => a.alertId));
    } else {
      failures += 1;
      deps.logger(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-alerts",
          event: "digest_send_failed",
          sessionId,
          code: outcome.error?.code,
          message: outcome.error?.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  if (allEmailedIds.length > 0) {
    await deps.repo.markAlertsEmailed(allEmailedIds);
  }

  deps.logger(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-alerts",
      event: "digest_complete",
      sessionsNotified,
      alertsEmailed,
      failures,
      timestamp: new Date().toISOString(),
    }),
  );

  return { sessionsNotified, alertsEmailed, failures };
}
