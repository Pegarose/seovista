# Spec: Tier B — B3 Tracker Alerts (Threshold Alerts + Email Digest + Retention)

**Date:** 2026-08-03
**Status:** Approved (brainstorming complete)
**Parent PRD:** `docs/prd/2026-07-31-keyword-tracking-prd.md` (Tier B)
**Parent authorities:** SeoVista PRD (Later roadmap: Recurring visibility dashboard), Implementation Brief v1 (§12, ADR 0001 mock boundary)
**Depends on:** Tier B B2 Tracker Dashboard (shipped — migration 015, tracker repository, daily scan scheduler, `/tracker` + `/tracker/[token]` dashboard with trend charts and CSV export)

## 1. Scope

B3 is the third vertical slice of Tier B. It delivers the alerting capability B1 and B2 deferred:

- **Transition alerts with fixed system thresholds:** four alert kinds evaluated on every new observation — `dropped_out_of_top10`, `entered_top10`, `significant_drop`, `significant_rise` (delta ≥ 3). No user-configurable thresholds (YAGNI).
- **`tracker_alerts` table (migration 016):** every triggered alert is persisted, powering both the panel and the email digest.
- **Panel surface:** a new "Uyarılar" section on `/tracker/[token]` listing recent alerts — in Sprint 0 this is the only *real* visible surface, since email is mock-only.
- **Consent-gated daily email digest:** one mock email per session per day, containing that session's unsent alerts (see §4 for the post-opt-in rule). Sent only to sessions with explicit `alert_consent`.
- **Consent capture:** opt-in checkbox on both tracker forms + a dashboard toggle for opt-in/opt-out after session creation.
- **Observation/alert retention:** 90-day cleanup running as the final step of the existing daily scan job.

**Architecture decision (brainstorming):** alert evaluation, digest sending, and retention are embedded in the existing `tracker_scan` batch processor (Approach A) — no new queue. Rationale: the scan processor is the only code path that produces observations, so evaluation happens exactly where new data exists; at Sprint 0 scale (one daily batch, ≤5 targets per session) a separate `tracker_alerts` queue with retry/DLQ (Approach B) would be YAGNI.

**Out of scope (explicitly deferred):**
- User-defined alert thresholds per target
- Live email delivery (Sprint 0 mock boundary, ADR 0001)
- Read/unread state on panel alerts
- Per-event or per-target email batching (daily digest per session only)
- B1/B2 deferred extras: crew terminal-status mapping, `result_id` linking, polyline gap markers, B2's 20 non-blocking Minor items

## 2. Data Model

### Migration 016 — `tracker_alerts` + session consent

```sql
ALTER TABLE tracker_sessions
  ADD COLUMN alert_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN alert_consent_updated_at TIMESTAMPTZ;

CREATE TABLE tracker_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id     UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN
    ('dropped_out_of_top10','entered_top10','significant_drop','significant_rise')),
  from_position INTEGER NOT NULL,
  to_position   INTEGER NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at    TIMESTAMPTZ,
  UNIQUE(target_id, kind, observed_at)
);

CREATE INDEX idx_tracker_alerts_session ON tracker_alerts(session_id, created_at DESC);
CREATE INDEX idx_tracker_alerts_unsent  ON tracker_alerts(session_id) WHERE emailed_at IS NULL;
```

Design notes:

- **`session_id` denormalization is deliberate:** reachable via `keyword_targets.session_id`, but keeping it on the row makes the digest grouping and panel queries single-table; `ON DELETE CASCADE` cleans alerts up with the session.
- **`UNIQUE(target_id, kind, observed_at)` is the idempotency key:** if the batch job retries after a partial failure, re-evaluating the same observation cannot double-insert (`ON CONFLICT DO NOTHING`). `observed_at` is the triggering observation's `checked_at`.
- **`emailed_at NULL` semantics:** alerts of non-consenting sessions stay NULL forever (never emailed, still visible on the panel); retention deletes them at day 90.
- **Existing sessions** (pre-B3) get `alert_consent = false` by default — panel-only alerts until they opt in via the dashboard toggle.

## 3. Alert Evaluation

### 3.1 Pure evaluator (`apps/worker/src/alerts/alert-evaluator.ts`)

```ts
export type AlertKind =
  | "dropped_out_of_top10"
  | "entered_top10"
  | "significant_drop"
  | "significant_rise";

export function evaluateTransition(
  prev: number | null,
  next: number,
  minDelta: number,
): AlertKind | null;
```

Rules (`0` = not found in top 10; `minDelta` from `TRACKER_ALERT_MIN_DELTA`, default 3):

| prev | next | Result |
|---|---|---|
| `null` (first observation) | any | `null` — baseline, no alert |
| 1–10 | 0 | `dropped_out_of_top10` |
| 0 | 1–10 | `entered_top10` |
| 1–10 | 1–10, `next − prev ≥ minDelta` | `significant_drop` |
| 1–10 | 1–10, `prev − next ≥ minDelta` | `significant_rise` |
| anything else (small movement, equality, 0→0) | | `null` |

- **Categories are mutually exclusive:** a single transition yields at most one alert (0-crossing vs in-band movement cannot coincide). Return type is `AlertKind | null`, not an array.
- **Transition-based dedup is natural:** while the position stays flat, no alert re-fires; a new alert only appears on a new state crossing (e.g. re-entering the top 10 and dropping again).
- `minDelta` is a parameter (not a module-level env read) so the truth table is unit-testable without env manipulation.

### 3.2 Processor integration (`apps/worker/src/processors/tracker-scan.ts`)

Inside the existing per-target loop:

1. Fetch the target's latest observation **before** insert (`findLatestObservation(targetId)`) → `prev`
2. Insert the new observation (existing behavior)
3. `evaluateTransition(prev?.position ?? null, newPosition, minDelta)`
4. If non-null → `insertAlert({ targetId, sessionId, kind, fromPosition: prev.position, toPosition: newPosition, observedAt })` with `ON CONFLICT DO NOTHING`
5. Alert insert failure for one target → structured log, batch continues (B1's "one target failure doesn't kill the run" policy)

`listActiveTargets` already returns `sessionId`; no extra session lookup is needed in the loop.

## 4. Digest Email Flow (`apps/worker/src/alerts/alert-digest.ts`)

Runs once after the scan loop, inside the same job. DI-style per the M2 pattern: the digest function receives the tracker repository, an `EmailProvider`, and the logger — no module-level singletons.

1. **Query:** `listUnsentAlertsForDigest()` — sessions with `alert_consent = true` that have alerts with `emailed_at IS NULL AND created_at > alert_consent_updated_at`, joined to target (keyword, domain) and session (email, token, alert_consent_updated_at), ordered by `created_at`. The `created_at > alert_consent_updated_at` filter resolves the late-opt-in backlog case: a session that opts in days after alerts accumulated is **not** emailed the stale backlog (up to 90 days old); emailing starts with alerts triggered after opt-in. The backlog stays visible on the panel.
2. **Grouping:** one `EmailPayload` per session:
   - `to`: session email; `from`: `TRACKER_ALERTS_FROM_EMAIL` (default `noreply@seovista.com`)
   - `subject`: `SeoVista takip uyarıları — 3 Ağu 2026` (tr-TR date; the date in the subject keeps the mock provider's `to|subject|source|utm` dedup key naturally unique per day)
   - `textBody`: one Turkish line per alert — `"seo denetimi" (ornek.com): İlk 10'dan düştü (önceki #4)`, `"seo analizi" (ornek.com): Belirgin yükseliş (#8 → #3)` — plus the panel link `{NEXT_PUBLIC_SITE_URL}/tracker/{token}` (the token is the user's own secret URL; same security model as a magic link, and the only way the email is actionable). Text-only, no `htmlBody` (YAGNI).
   - `consent`: `{ marketing: true, analytics: false, timestamp: alert_consent_updated_at }` — constructed from the stored consent; satisfies the mock provider's `CONSENT_DENIED` gate.
   - `source: "tracker-alerts"`, `scenario: "success"` (Sprint 0 mock contract).
3. **Result handling:** on success → `markAlertsEmailed(ids)`; on provider error → structured warning, `emailed_at` stays NULL → the next day's digest naturally retries those alerts (no extra retry infrastructure).
4. **Log:** `{ sessions_notified, alerts_emailed, failures }`. Alerts of non-consenting sessions never enter the digest; they live on the panel only.

**New dependency:** `@seovista/reports` (`workspace:*`) is added to `apps/worker/package.json` — its first app consumer. The worker constructs the provider via the existing `createMockEmail()` factory. Live provider enablement stays out of scope (ADR 0001).

## 5. Consent Model

- **Checkbox on both tracker forms** (`tracker-form.tsx` on `/tracker`, `track-this-button.tsx` inline form on the keyword-rank-checker result page): "Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)" — unchecked by default, not `required`.
- **Validation:** FormData `"on"`/missing → `z.preprocess` to boolean; added to `TrackerTargetFormSchema` and the track-this variant.
- **`createTrackingTarget` semantics:**
  - New session → `alert_consent` written from the checkbox (`alert_consent_updated_at = now()` when true).
  - Existing session + checkbox checked → upgrade `false → true` (with timestamp).
  - Existing session + checkbox unchecked → **existing value untouched** (an unchecked box is the default state, not an explicit revocation).
- **Opt-out / late opt-in path:** `ConsentToggle` client island on the dashboard shows the current state ("E-posta uyarıları: Açık/Kapalı") and calls `updateAlertConsentAction(token, consent)` → `updateAlertConsent(sessionId, consent)` sets value + timestamp. This is the only way pre-B3 sessions can opt in, and the revocation path for everyone. Opting in does not email the pre-existing alert backlog (§4's `created_at > alert_consent_updated_at` rule); opting out stops future digests immediately and leaves already-sent history untouched.

## 6. Panel UI (`/tracker/[token]`)

New "Uyarılar" section between `AddTargetForm` and the target cards:

- **`alerts-list.tsx` (RSC):** `<h2>Uyarılar</h2>` + the last 30 alerts (within the 90-day window), newest first: tr-TR date, keyword, domain, kind badge, `#from → #to` detail.
- **Kind labels** (WCAG — never color-only, text always present): "İlk 10'dan düştü", "İlk 10'a girdi", "Belirgin düşüş", "Belirgin yükseliş".
- **Empty state:** "Henüz uyarı yok. Pozisyon değişikliklerinde burada görünecek."
- **`ConsentToggle`** sits in the section header with its state text.
- **No read/unread state** (YAGNI) — a chronological list is sufficient.
- Repository addition: `listAlertsByToken(token, limit 30)` — the panel page fetches it alongside `listTargetsByToken`.
- Landmark contract preserved: one `<main id="main">`, one `<h1>`; the section heading is an `<h2>`.

## 7. Retention

Final step of the daily scan job, after the digest:

```sql
DELETE FROM rank_observations WHERE checked_at < now() - make_interval(days => $1);
DELETE FROM tracker_alerts     WHERE created_at < now() - make_interval(days => $1);
```

- `$1` = `TRACKER_RETENTION_DAYS` (default 90). 90 days aligns with the dashboard's 90-observation window (B2's `LIMIT 90` ≈ 90 days at daily cadence).
- Structured log: `{ observations_deleted, alerts_deleted }`.
- Retention failure → error log, the job still completes successfully (scan and alert data are already safe); the next run retries.

## 8. Component Breakdown

| Component | Location | Responsibility |
|---|---|---|
| `alert-evaluator.ts` | `apps/worker/src/alerts/` | Pure `evaluateTransition` truth-table function |
| `alert-digest.ts` | `apps/worker/src/alerts/` | Digest builder + sender (repo, EmailProvider, logger via DI) |
| `tracker-scan.ts` | `apps/worker/src/processors/` | Extended: prev fetch → evaluate → insertAlert; post-loop digest + retention |
| `tracker-repository.ts` | `apps/worker/src/db/` | New queries (below) |
| `alerts-list.tsx` | `apps/web/src/components/tracker/` | RSC alerts section |
| `consent-toggle.tsx` | `apps/web/src/components/tracker/` | Client island: consent state + toggle |
| `actions.ts` | `apps/web/src/lib/tracker/` | Consent param on the email-collecting create actions (`createTrackerTargetAction` and the track-this variant — not the dashboard's session-scoped `createTrackerTargetForSessionAction`, which collects no email); new `updateAlertConsentAction` |
| `validation.ts` | `apps/web/src/lib/tracker/` | Consent boolean in both target schemas |
| `tracker-form.tsx`, `track-this-button.tsx` | `apps/web/src/components/tracker/` | Consent checkbox |
| `app/tracker/[token]/page.tsx` | `apps/web/` | Renders the Uyarılar section |
| Migration `016_create_tracker_alerts.sql` | `apps/worker/migrations/` | `tracker_alerts` table + session consent columns |

New repository methods: `findLatestObservation(targetId)`, `insertAlert(...)` (ON CONFLICT DO NOTHING), `listUnsentAlertsForDigest()`, `markAlertsEmailed(ids)`, `listAlertsByToken(token, limit)`, `deleteOldObservations(cutoffDays)`, `deleteOldAlerts(cutoffDays)`, `updateAlertConsent(sessionId, consent)`. `findOrCreateSession` gains consent handling per §5.

## 9. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRACKER_ALERT_MIN_DELTA` | 3 | Position delta that qualifies as significant drop/rise |
| `TRACKER_RETENTION_DAYS` | 90 | Observation + alert retention window |
| `TRACKER_ALERTS_FROM_EMAIL` | `noreply@seovista.com` | Digest sender address |

All added to `.env.example`. The panel list size (30) is a code constant, not an env var.

## 10. Error Handling

| Scenario | Behavior |
|---|---|
| Alert INSERT fails for one target | Structured log, batch continues (B1 policy) |
| Batch retry / double run | `UNIQUE(target_id, kind, observed_at)` + `ON CONFLICT DO NOTHING` → idempotent |
| Digest provider error (per session) | Warning log, `emailed_at` stays NULL → next day's digest retries naturally |
| Retention DELETE fails | Error log, job still completes; next run retries |
| `updateAlertConsentAction` with invalid/foreign token | UUID regex + session ownership check → error, no data leak |
| Panel alerts list with invalid token | Inherits the existing token gate → 404 |
| Consent checkbox absent from FormData | Preprocesses to `false` — never a validation error |

## 11. Testing Strategy

### Unit Tests (worker)
- `alert-evaluator.test.ts`: full truth table — every rules-table row, boundary `delta = 3` exactly, first observation (`prev = null`), equal positions, 0→0, custom `minDelta`
- `tracker-repository.test.ts` extensions: `insertAlert` idempotency (duplicate ON CONFLICT), `listUnsentAlertsForDigest` (consent filter, `emailed_at IS NULL` filter, grouping fields), `markAlertsEmailed`, `listAlertsByToken` limit/ordering, retention DELETE cutoff, `updateAlertConsent` timestamp
- `alert-digest.test.ts`: per-session grouping, Turkish line format, subject contains tr-TR date, consent state construction, success → `markAlertsEmailed` called, provider error → ids not marked, panel link contains token, late-opt-in backlog excluded (`created_at > alert_consent_updated_at`)
- `tracker-scan-processor.test.ts` extensions: mocked SearXNG → alert row written on transition, no alert on flat positions, alert insert failure doesn't abort the batch, digest + retention steps run after the loop

### Unit Tests (web)
- `validation`: consent preprocess (`"on"` → true, missing → false)
- `actions`: `createTrackingTarget` consent semantics (new session stores true; existing session false→true upgrade; unchecked leaves existing true untouched); `updateAlertConsentAction` (token ownership, invalid token)
- Page tests: alerts section renders list + kind labels, empty state copy, consent toggle state text, landmark contract (one `<h1>`, one `<main>`) preserved

### E2E (Playwright, deferred to CI per repo convention)
- Scan run with a position crossing → alert visible on panel; consenting session → mock email side-effect count increments

## 12. Honest Content Rules

- Alerts are computed exclusively from real SearXNG observations — no fabricated transitions, no synthetic events.
- `position = 0` stays honestly labeled ("İlk 10'dan düştü" / "İlk 10'a girdi") — never represented as a numeric rank.
- The digest email carries the existing data-source honesty posture: Sprint 0 mock delivery is not represented as live email infrastructure.
- No "ranking factor" claims in alert copy — alerts report factual position changes only.
- Consent is explicit and unchecked by default; no implicit-consent dark patterns.

## 13. Out of Scope (Explicitly Deferred)

- **User-defined thresholds:** fixed system thresholds only; per-target configuration may follow real usage demand.
- **Live email delivery:** ADR 0001 mock boundary; provider enablement is a separate, explicitly approved ops step.
- **Read/unread state, alert archiving UI:** chronological list is sufficient at this scale.
- **Per-event / per-target email batching:** daily digest per session only.
- **B1/B2 deferred extras:** crew terminal-status mapping, `result_id` linking, polyline gap markers, B2's 20 non-blocking Minor items — tracked separately, not part of B3.
- **In-app notification center beyond the tracker panel:** no global notification system exists; the tracker panel section is the entire surface.

## 14. Migration

Migration `016_create_tracker_alerts.sql` in `apps/worker/migrations/` creates the `tracker_alerts` table and adds the two consent columns to `tracker_sessions`. Runs via the existing migration runner. Down migration drops the table and the columns.
