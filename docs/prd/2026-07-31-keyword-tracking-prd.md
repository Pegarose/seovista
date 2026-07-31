# PRD: Keyword Tracking / SERP Tracker

**Date:** 2026-07-31
**Status:** Draft — awaiting scope decision (Tier A vs Tier B)
**Parent authorities:** SeoVista PRD ("Later" roadmap: *Recurring visibility dashboard*; §10 OpenSEO donor candidates: *rank, keyword, backlink and competitor workflow logic*), Implementation Brief v1 (§12: DataForSEO cost ledger + daily hard ceiling; ADR 0001 mock boundary; ADR 0003 adapter boundary)

---

## 1. Positioning & Source-of-Truth Relationship

The parent PRD's launch tool library (`/tools/`) is complete with four tools (GEO Readiness, Schema, AI Crawler, SERP Preview). Keyword Tracking is **not** in the launch or Phase 1.1 scope; it maps to the parent PRD's "Later" roadmap item *Recurring visibility dashboard* and to OpenSEO donor candidate 5 (*rank, keyword … workflow logic*). This document, once approved, becomes the authoritative PRD for this feature. Where it conflicts with the parent PRD, the parent wins.

Honesty boundary inherited from the parent PRD: no guaranteed rankings, no fabricated data, no "real-time tracking" claims until verifiably operational.

## 2. Problem

SeoVista's free tools answer "is my site ready?" but nothing answers "where do I rank for the queries that matter?" — the most recurring question in search visibility. A keyword/SERP capability both extends the lead-acquisition tool library and seeds the future recurring dashboard.

## 3. Scope Tiers (decision required)

### Tier A — One-shot Keyword Rank Check (`/tools/keyword-rank-checker/`)

A free, anonymous, low-friction utility following the proven tool template (Server Action → `job_records` → BullMQ → worker → `job_results` → polling result page).

- Input: domain + single keyword (+ optional locale/country).
- Worker queries the SERP data source once, extracts the domain's position (or "not in top N"), SERP feature presence, top-10 snapshot.
- Result page: position card, top-10 list, honest data-source label, CTA toward the GEO Readiness Checker.
- Rate-limited per IP (existing pattern); no persistence beyond the standard job retention.
- **Effort:** S-M. Reuses the entire existing pipeline; new surface is one processor + one form/result page pair + adapter method.

### Tier B — Recurring Tracker (adds to Tier A)

- Persisted tracking targets (keyword × domain × locale), time-series rank observations, scheduled BullMQ repeatable jobs (daily), trend UI (chart, deltas), basic alerting thresholds.
- **New infrastructure:** two tables (`keyword_targets`, `rank_observations`), scheduler registration, per-run cost accounting against the DataForSEO daily hard ceiling, dashboard route.
- **Open product question:** anonymous (email-gated like the GEO report) vs authenticated accounts. Authenticated accounts are a platform-level dependency not yet built.
- **Effort:** L. Decomposable into vertical slices (B1 storage+scheduler, B2 dashboard, B3 alerts).

**Recommendation:** Tier A now, Tier B as a follow-on PRD iteration after A validates demand — mirrors the parent PRD's "validate demand before platform" posture.

## 4. Data Source & Cost Boundary

- **Sprint 0 posture (binding):** deterministic DataForSEO mock only (ADR 0001); no live provider traffic or credentials. All results carry a data-source label ("örnek veri / mock" until a live source is configured).
- Integration goes through `@seovista/open-seo-adapter` (ADR 0003): SeoVista-owned interfaces, upstream types wrapped, MIT notices in `THIRD_PARTY_NOTICES.md`.
- Brief §12 requirements that apply even to Tier A: DataForSEO cost ledger + **daily hard ceiling**, per-IP rate limits, audit logs without storing unnecessary page content (top-10 snapshot stores ranks/URLs/titles only, not page bodies).
- Live-provider enablement is a separate, explicitly approved step (env-gated, credentials never in tracked files).

## 5. Functional Requirements (Tier A)

1. Form: domain, keyword, locale selector (default `tr-TR`; honor existing locale conventions). Zod-validated, Turkish UI (PRD §0.3).
2. Submission: same contract as schema/ai-crawler actions (rate limit, `getAdminDb` in try, NEXT_REDIRECT rethrow).
3. Processor: query SERP source via adapter; extract position, top-10, SERP features; 0-100 scoring is NOT applicable — output is factual position data, no invented score.
4. Result page: polling (existing `JobPollingProgress` pattern), explicit-unknown status guard (`job-result-guard`), position card, top-10 table, data-source label, truncation-safe URL display.
5. Tools index: fifth instrument entry; site.ts copy + `seo.spec.ts` pin updated consistently.
6. Exactly one `<h1>` in one `<main>`; WCAG 2.1 AA; no color-only indicators.

## 6. Functional Requirements (Tier B, deferred detail)

1. `keyword_targets` (id, domain, keyword, locale, created_by/session identifier, created_at, active) + `rank_observations` (target_id, observed_at, position, serp_features jsonb, cost_units).
2. Daily repeatable BullMQ job per active target; scheduler resilient to missed runs; cost ledger decrement + hard-ceiling skip with structured log.
3. Dashboard route with trend sparkline + position delta table; empty states honest.
4. Identity model decision gates B: anonymous-with-email vs accounts.

## 7. Non-Functional Requirements

- TypeScript strict; Node 24 LTS; `pnpm@10.30.1`; TDD; Server Components default.
- All fetches through the SSRF-hardened fetcher (per-hop redirect revalidation, body caps) where page fetches occur.
- Queue lifecycle per post-debt-fix patterns (legal transitions, orphan compensation, queue-name env resolution).
- No rankings/citations promises in copy; data-source labeling mandatory.

## 8. Out of Scope (both tiers)

- Backlink/competitor workflows (separate donor candidates).
- White-label reports, agency workspace.
- Live DataForSEO credentials provisioning (ops task, separate approval).

## 9. Open Questions (for scope decision)

1. Tier A only now, or A+B planned as one program?
2. For Tier B identity: anonymous-email vs authenticated accounts (platform dependency)?
3. Locale set at launch: `tr-TR` only, or also `en-US`?
4. Top-N depth: 10 (cheaper, faster) or 100 (DataForSEO cost scales with depth)?
