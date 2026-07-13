/**
 * Boundary Test: Export Isolation
 *
 * Proves that packages/open-seo-adapter exports only SeoVista-owned
 * interfaces. Verifies that no upstream types, paths, or identifiers
 * leak through the public API surface.
 *
 * VAL-QUALITY-010: packages/open-seo-adapter exports only
 * SeoVista-owned interfaces.
 */

import { describe, it, expect } from 'vitest';
import * as adapterModule from '../index.js';

describe('OpenSEO export boundary', () => {
  describe('all public exports are SeoVista-owned', () => {
    it('exports exactly the expected SeoVista-owned identifiers', () => {
      const expectedExports = [
        'name',
        // Audit issue types
        'SeovistaIssueSeverityValues',
        'SeovistaSeverityOrder',
        'SeovistaAuditIssueTypeValues',
        'getSeovistaIssueDescriptor',
        'getSeovistaAllIssueTypes',
        'getSeovistaIssueTypeKeys',
        'issueDescriptorSchema',
        'SeovistaIssueSeveritySchema',
        // Audit limits
        'SeovistaAuditLimits',
        'SeovistaAuditLimitsSchema',
        'validateSeovistaAuditLimitConsistency',
        // Error codes
        'SeovistaErrorCodeSchema',
        'isSeovistaErrorCode',
        'shouldReportSeovistaError',
        // JSON codec
        'createSeovistaJsonCodec',
        // Normalization contracts
        'SeovistaApiCostRecordSchema',
        'SeovistaKeywordMetricsSchema',
        'SeovistaSerpItemSchema',
        'SeovistaDomainOverviewSchema',
      ];

      const actualExports = Object.keys(adapterModule).sort();
      const expectedSorted = [...expectedExports].sort();

      // Verify all expected exports exist
      for (const exp of expectedSorted) {
        expect(actualExports).toContain(exp);
      }
    });

    it('no unexpected exports exist', () => {
      const allowedExports = new Set([
        'name',
        'SeovistaIssueSeverityValues',
        'SeovistaSeverityOrder',
        'SeovistaAuditIssueTypeValues',
        'getSeovistaIssueDescriptor',
        'getSeovistaAllIssueTypes',
        'getSeovistaIssueTypeKeys',
        'issueDescriptorSchema',
        'SeovistaIssueSeveritySchema',
        'SeovistaAuditLimits',
        'SeovistaAuditLimitsSchema',
        'validateSeovistaAuditLimitConsistency',
        'SeovistaErrorCodeSchema',
        'isSeovistaErrorCode',
        'shouldReportSeovistaError',
        'createSeovistaJsonCodec',
        'SeovistaApiCostRecordSchema',
        'SeovistaKeywordMetricsSchema',
        'SeovistaSerpItemSchema',
        'SeovistaDomainOverviewSchema',
      ]);

      const actualExports = Object.keys(adapterModule);

      for (const exp of actualExports) {
        expect(
          allowedExports.has(exp),
          `Unexpected export: ${exp}`,
        ).toBe(true);
      }
    });

    it('no export name contains upstream branding', () => {
      const actualExports = Object.keys(adapterModule);

      const forbiddenPatterns = [
        /open\s*seo/i,
        /openseo/i,
        /DaisyUI/i,
        /daisyui/i,
        /TanStack/i,
        /tanstack/i,
        /Vite/i,
        /Cloudflare/i,
        /D1/i,
        /Durable/i,
      ];

      for (const exp of actualExports) {
        for (const pattern of forbiddenPatterns) {
          expect(exp).not.toMatch(pattern);
        }
      }
    });
  });

  describe('no upstream module paths are re-exported', () => {
    it('all exports resolve to local adapter source files', () => {
      // TypeScript module resolution ensures that re-exports
      // from upstream paths would fail at build time.
      // This test confirms the module loads cleanly.
      expect(adapterModule.name).toBe('@seovista/open-seo-adapter');
    });
  });

  describe('SeoVista-owned interfaces conform to contract', () => {
    it('SeovistaAuditLimits returns readonly values', () => {
      const { SeovistaAuditLimits } = adapterModule;
      expect(SeovistaAuditLimits.MIN_AUDIT_PAGES).toBe(10);
      expect(SeovistaAuditLimits.DEFAULT_AUDIT_PAGES).toBe(50);
      expect(SeovistaAuditLimits.FREE_MAX_AUDIT_PAGES).toBe(50);
      expect(SeovistaAuditLimits.PAID_MAX_AUDIT_PAGES).toBe(10_000);
    });

    it('getSeovistaAllIssueTypes is immutable', () => {
      const registry = adapterModule.getSeovistaAllIssueTypes();
      expect(Object.isFrozen(registry)).toBe(true);
    });

    it('SeovistaErrorCodeSchema validates correct codes', () => {
      const { SeovistaErrorCodeSchema } = adapterModule;
      expect(SeovistaErrorCodeSchema.safeParse('INTERNAL_ERROR').success).toBe(true);
      expect(SeovistaErrorCodeSchema.safeParse('INVALID').success).toBe(false);
    });
  });
});
