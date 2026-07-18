/**
 * SeoVista Sprint 0 — Lighthouse CI Configuration
 *
 * Version-controlled route set (VAL-QUALITY-007):
 *   - / (home)
 *   - /geo/ (service route — GEO)
 *   - /tools/ (tools index)
 *   - /tools/geo-readiness-checker/ (checker foundation)
 *   - /contact/ (contact)
 *   - /terms/ (legal route)
 *
 * Assertions:
 *   - Performance >= 0.90
 *   - SEO = 1.00 (error if below)
 *   - Accessibility >= 0.95 (error if below)
 *   - LCP <= 2500ms
 *   - CLS <= 0.1
 *   - TTFB <= 800ms
 *   - INP <= 200ms (warn if above; recorded as "not collected" when unavailable)
 *
 * Cleanup: pnpm lighthouse must stop server, profiles, networks, and
 * containers on success, assertion/startup failure, and interruption.
 */

module.exports = require("./lighthouserc.cjs");
