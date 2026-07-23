# SeoVista Phase 2 — Scale, Reliability & GEO Depth

### TL;DR

SeoVista's free GEO Readiness Checker has proven the top-of-funnel model, but the current architecture strains under concurrent audits and long-running platform checks, and the GEO feature set is still shallow. Phase 2 hardens the platform for scale (caching, concurrency control, resilient scrape routing, and an async queue for Crew Agency handoffs) and deepens the product (SERP/AI-answer preview, continuous monitoring, bulk audits, and multi-tenant support). The work serves growth marketers and SEO/GEO consultants who need fast, reliable, citation-ready audits at higher volume.

---

## Goals

### Business Goals

* Increase audit throughput to support 10x concurrent traffic without degrading p95 latency beyond current levels.
* Reduce infrastructure cost per completed audit by at least 30% through caching and smarter platform-check routing.
* Grow qualified lead volume into Crew Agency by 40% via bulk audits and continuous monitoring surfaces.
* Improve audit reliability so that fewer than 1% of audits fail or return partial results.
* Establish a multi-tenant foundation that unlocks agency and enterprise pricing tiers.

### User Goals

* Get a complete, trustworthy 0–100 GEO score quickly, even during peak load.
* See not just a score but a preview of how the brand appears in AI answers and search results.
* Monitor readiness over time rather than running one-off checks.
* Audit many URLs or a full domain in a single workflow.
* Trust that results are consistent and reproducible across runs.

### Non-Goals

* Building a full-scale rank-tracking product to compete with established SEO suites.
* Offering white-label reselling in this phase (deferred to a later multi-tenant maturity milestone).
* Replacing Crew Agency's manual consulting workflow with full automation.

---

## User Stories

Growth Marketer (Sarah, in-house at a mid-market brand)

* As a growth marketer, I want my audit to complete reliably during busy periods, so that I can trust the score in stakeholder reports.
* As a growth marketer, I want to see how my brand is represented in ChatGPT and Perplexity answers, so that I can prioritize content fixes.
* As a growth marketer, I want to track my GEO score weekly, so that I can show progress to leadership.

SEO/GEO Consultant (Marcus, agency-side)

* As a consultant, I want to run a bulk audit across a client's top 100 URLs, so that I can scope an engagement quickly.
* As a consultant, I want stable, reproducible scores, so that I can defend recommendations to clients.
* As a consultant, I want separate workspaces per client, so that data stays cleanly isolated.

Crew Agency Sales Rep (Elif, GMedya Group)

* As a sales rep, I want high-intent audit leads routed to me without delay, so that I can follow up while interest is warm.
* As a sales rep, I want to see which platforms a prospect scored poorly on, so that I can tailor my pitch.

Platform Operator (internal SRE/engineer)

* As an operator, I want concurrency and rate limits enforced, so that a traffic spike does not exhaust upstream API budgets or crash the service.
* As an operator, I want failed platform checks to degrade gracefully, so that users still receive a partial, clearly-labeled result.

---

## Functional Requirements

Reliability & Scale Foundation (Priority: P0)

* Result Caching: Cache normalized audit results keyed by URL + input signature with a configurable TTL to serve repeat requests without re-running platform checks.
* Concurrency Control: Global and per-platform concurrency limits with a bounded work queue to protect upstream AI/search APIs and control cost.
* Resilient Scrape Router: Route page fetches through a tiered strategy (direct fetch → headless render → third-party fallback) with per-tier timeouts and automatic failover.
* Graceful Degradation: When a platform check fails or times out, return a partial score with the affected platform clearly flagged rather than failing the whole audit.

Crew Agency Handoff (Priority: P0)

* Async Lead Queue: Move Crew Agency lead creation and enrichment onto an asynchronous queue so audit response time is decoupled from CRM/handoff latency.
* Lead Enrichment Payload: Attach per-platform readiness breakdown and score to each lead so sales reps can tailor outreach.

GEO Depth (Priority: P1)

* SERP & AI-Answer Preview: Show a representative preview of how the brand surfaces in AI-generated answers and search results, alongside the score.
* Citation Readiness Detail: Expand per-platform readiness with specific, actionable reasons (e.g., missing structured data, thin authoritative content, crawlability gaps).

Monitoring & Volume (Priority: P2)

* Continuous Monitoring: Scheduled re-audits with score-over-time history and change alerts.
* Bulk Audit: Submit multiple URLs or a full domain in one workflow with aggregated reporting and per-URL drill-down.

Multi-Tenant & Extensibility (Priority: P3)

* Workspaces: Tenant isolation for accounts, audits, and monitoring data to support agency and enterprise use.
* Role-Based Access: Basic roles (owner, member, viewer) within a workspace.

Deployment Flexibility (Priority: P4)

* Self-Hosting Option: Package the platform for self-hosted deployment for enterprise buyers with data-residency requirements.

---

## User Experience

Entry Point & First-Time User Experience

* Users discover SeoVista through organic search, referrals, or GMedya channels and land on the free GEO Readiness Checker.
* A first-time user enters a URL with no signup required; a short inline explainer sets expectations on what the 0–100 score means and which platforms are checked.
* After the first result, a contextual prompt invites the user to save history, enable monitoring, or run a bulk audit (account creation gate).

Core Experience

* Step 1: The user submits a URL on the checker.
  * Minimal friction: single input, clear CTA, no signup for a first single audit.
  * Input validation for malformed or unreachable URLs with an inline, human-readable error.
  * On submit, the user sees an immediate progress state showing per-platform checks in flight.
* Step 2: The system runs the audit through the concurrency-controlled queue and scrape router.
  * If the result is cached and within TTL, it returns near-instantly with a subtle "recently checked" indicator and a refresh option.
  * Each platform check reports success, partial, or failed status as it resolves.
* Step 3: The user receives the 0–100 score with per-platform readiness.
  * Any degraded platform is clearly labeled (e.g., "Perplexity check unavailable — score excludes this platform").
  * The SERP & AI-answer preview shows representative output; citation readiness detail lists specific fixes.
  * A clear next-step CTA routes high-intent users toward a Crew Agency consultation.
* Step 4 (returning/authenticated): The user enables monitoring or launches a bulk audit.
  * Monitoring shows a score-over-time chart and highlights meaningful changes.
  * Bulk audit shows aggregate readiness plus a sortable per-URL table with drill-down.

Advanced Features & Edge Cases

* Rate-limited or upstream-throttled state: the queue holds the request and communicates estimated wait rather than erroring.
* Total upstream outage for one platform: audits continue for available platforms with the score methodology transparently adjusted.
* Duplicate concurrent submissions of the same URL collapse to a single in-flight job to avoid wasted work.
* Very large domains in bulk audit are chunked and processed progressively with partial results streaming in.

UI/UX Highlights

* Per-platform status must be visually distinct (success / partial / failed) with accessible color contrast and non-color-dependent indicators.
* Score methodology and any exclusions must always be transparent to preserve trust.
* Progress and wait states should feel responsive; avoid indefinite spinners by showing per-platform granularity.
* Responsive layout for desktop-first consultant workflows and mobile score checks.

---

## Narrative

Marcus runs a lean GEO consultancy and just landed a mid-market retail client who is invisible in AI answers. Before Phase 2, he would have run audits one URL at a time, occasionally hitting a timeout during peak hours that made him second-guess whether a low score was real or just a glitch. Reproducing a result to show the client felt fragile.

With SeoVista Phase 2, Marcus submits the client's top 100 URLs as a single bulk audit. The concurrency-controlled queue processes them steadily, and results stream in with clear per-platform status. Where a platform check briefly fails, the score is transparently marked rather than silently wrong. He sees not just numbers but previews of how the brand actually surfaces in ChatGPT and Perplexity, with specific, citable reasons for each low score.

He enables weekly monitoring so the client can watch progress after implementing fixes. When he flags the biggest gaps, the "consult with Crew Agency" path gives the client a warm handoff — and that lead reaches Elif on the sales team within seconds, enriched with the exact per-platform breakdown she needs to tailor her pitch. Marcus closes the engagement faster, the client sees measurable GEO improvement over time, and GMedya converts a qualified lead. The audit that used to be a fragile one-off is now a reliable, revenue-generating workflow.

---

## Success Metrics

### User-Centric Metrics

* Audit completion rate (share of audits returning a full, non-degraded score) above 99%.
* Monitoring adoption: percentage of authenticated users enabling continuous monitoring.
* Bulk audit usage: number of URLs processed via bulk workflows per week.
* User-reported trust/satisfaction (CSAT on results screen) trending up quarter over quarter.

### Business Metrics

* 40% increase in qualified leads routed to Crew Agency.
* 30% reduction in infrastructure cost per completed audit.
* Conversion rate from audit → consultation booking.
* Revenue attributable to new agency/enterprise (multi-tenant) tiers.

### Technical Metrics

* p95 audit latency held flat or improved under 10x concurrent load.
* Cache hit rate on repeat/duplicate audits (target range defined in Technical Considerations).
* Platform-check failure rate below 1%; graceful-degradation coverage at 100% of platform checks.
* Async lead-queue processing latency (enqueue → CRM handoff) under a defined SLA.

### Tracking Plan

* audit_submitted (with input signature, authenticated flag)
* audit_completed (score, per-platform status, cache hit/miss, degraded flag)
* platform_check_failed (platform, failure reason, tier reached)
* crew_lead_enqueued / crew_lead_delivered (latency, enrichment payload present)
* monitoring_enabled / monitoring_alert_sent
* bulk_audit_started / bulk_audit_url_completed
* consult_cta_clicked

---

## Technical Considerations

### Technical Needs

* Caching layer: normalized result cache keyed by URL + input signature with configurable TTL, plus in-flight request de-duplication (single-flight) so concurrent identical submissions share one job.
* Queue & concurrency: a bounded work queue with global and per-platform concurrency limits and backpressure, protecting upstream AI/search API budgets.
* Scrape router: tiered fetch strategy with per-tier timeouts and failover.
  * Tier 1 — direct HTTP fetch (fastest, cheapest)
  * Tier 2 — headless render for JS-heavy pages
  * Tier 3 — third-party fetch/proxy fallback for hostile or blocked targets
* Async handoff: message queue for Crew Agency lead creation/enrichment decoupled from the audit request path.
* Data model additions: audit history, monitoring schedules, bulk-audit batches, and workspace/tenant entities.

Preserved credit / cost math (source engineering analysis)

| Item | Assumption | Notes |
| --- | --- | --- |
| Platform checks per audit | 4 (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot) | Each has independent cost and failure profile |
| Cost driver | Upstream API + scrape cost per platform check | Concurrency limits cap peak spend |
| Cache TTL | Configurable (default candidate: 24h) | Repeat audits within TTL avoid re-running checks |
| Target cost reduction | ≥30% per completed audit | Achieved via cache hits + de-duplication + routing efficiency |

Cache hit projection (source engineering analysis)

| Traffic pattern | Expected repeat/duplicate rate | Projected cache hit rate |
| --- | --- | --- |
| Organic single audits | Moderate URL overlap | Lower band |
| Consultant re-checks & monitoring | High overlap | Upper band |
| Bulk audits with shared domains | Domain-level overlap | Mid–upper band |

DB scaling triggers (source engineering analysis)

| Signal | Threshold action |
| --- | --- |
| Sustained write contention on audit history | Introduce partitioning / archival of old audits |
| Monitoring schedule volume growth | Move schedules to dedicated store / job runner |
| Bulk-audit batch size growth | Chunked processing with progressive persistence |
| Multi-tenant row growth | Tenant-aware indexing and isolation review |

### Integration Points

* Upstream AI/search platforms: ChatGPT, Perplexity, Google AI Overviews, Bing Copilot.
* Third-party fetch/proxy provider for Tier 3 scrape fallback.
* Crew Agency CRM / lead intake system (via async queue).
* Analytics/event pipeline for the tracking plan above.

### Component Inventory (preserved from source analysis)

| Component | Phase 2 change | Priority |
| --- | --- | --- |
| Result cache | New | P0 |
| Concurrency/queue manager | New | P0 |
| Scrape router (3-tier) | New / replaces direct fetch | P0 |
| Graceful degradation handler | New | P0 |
| Crew async lead queue | New | P0 |
| SERP/AI-answer preview | New | P1 |
| Citation readiness detail | Enhancement | P1 |
| Monitoring scheduler | New | P2 |
| Bulk audit engine | New | P2 |
| Workspace/tenant layer | New | P3 |
| Self-host packaging | New | P4 |

### Data Storage & Privacy

* Store audit results, history, and monitoring data with tenant isolation as workspaces are introduced.
* Cache stores derived results, not sensitive credentials; TTL and invalidation policy documented.
* Lead data passed to Crew Agency must follow existing data-handling and consent practices; enrichment payloads limited to what sales needs.
* English-first, global audience: account for data-residency requests in the self-hosting track (P4).

### Scalability & Performance

* Design target: sustain 10x current concurrent audit load with flat p95 latency.
* Concurrency limits and queue backpressure prevent upstream API exhaustion and runaway cost.
* Cache and single-flight de-duplication absorb duplicate/repeat traffic.
* Bulk and monitoring workloads run on background workers isolated from the interactive audit path.

### Potential Challenges

* Upstream platform variability: AI/search endpoints change behavior or rate limits without notice; the scrape router and degradation handler must absorb this.
* Score reproducibility vs. freshness: caching improves stability and cost but must not serve stale scores misleadingly — hence transparent "recently checked" labeling and refresh.
* Cost control under viral traffic spikes: concurrency caps must balance user wait time against budget.
* Multi-tenant introduction risks data-isolation bugs; requires careful indexing and access-control review.

---

## Milestones & Sequencing

### Project Estimate

* Large: 4–8 weeks for the P0/P1 foundation (reliability, scale, Crew handoff, GEO depth). P2–P4 sequenced as follow-on increments beyond this window.

### Team Size & Composition

* Small, fast-moving team of 2–3:
  * 1 full-stack engineer (owns cache, queue, scrape router, degradation).
  * 1 engineer/PM hybrid (Crew async handoff, GEO preview, tracking plan).
  * Fractional design support for the preview and monitoring surfaces.

### Suggested Phases

Phase A — Reliability & Scale Foundation (2–3 weeks)

* Key Deliverables: result cache + single-flight de-dup, concurrency/queue manager, 3-tier scrape router, graceful degradation. Owner: full-stack engineer.
* Dependencies: upstream API limits confirmed; event tracking scaffold.

Phase B — Crew Handoff & GEO Depth (2–3 weeks)

* Key Deliverables: async lead queue with enriched payload, SERP/AI-answer preview, citation readiness detail. Owner: engineer/PM hybrid + design.
* Dependencies: Phase A queue infrastructure; Crew CRM intake contract.

Phase C — Monitoring & Bulk Audit (follow-on, 2–4 weeks)

* Key Deliverables: monitoring scheduler with alerts, bulk audit engine with aggregated reporting. Owner: full team.
* Dependencies: stable Phase A workers; data model for history/batches.

Phase D — Multi-Tenant & Self-Hosting (follow-on, sequenced by demand)

* Key Deliverables: workspaces + role-based access (P3), self-host packaging (P4). Owner: full team.
* Dependencies: tenant data-isolation review; enterprise demand signals.