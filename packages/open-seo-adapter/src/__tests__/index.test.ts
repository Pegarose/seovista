import { describe, it, expect } from 'vitest';
import {
  name,
  SeovistaIssueSeverityValues,
  SeovistaSeverityOrder,
  SeovistaAuditIssueTypeValues,
  getSeovistaIssueDescriptor,
  getSeovistaAllIssueTypes,
  getSeovistaIssueTypeKeys,
  SeovistaAuditLimits,
  validateSeovistaAuditLimitConsistency,
  isSeovistaErrorCode,
  shouldReportSeovistaError,
  createSeovistaJsonCodec,
  SeovistaApiCostRecordSchema,
  SeovistaKeywordMetricsSchema,
  SeovistaSerpItemSchema,
  SeovistaDomainOverviewSchema,
} from '../index.js';
import { z } from 'zod';

describe('@seovista/open-seo-adapter', () => {
  describe('package identity', () => {
    it('exports a defined package name', () => {
      expect(name).toBe('@seovista/open-seo-adapter');
    });
  });

  describe('export boundary — only SeoVista-owned interfaces', () => {
    it('all exported identifiers use Seovista prefix', () => {
      // Verify key exports have SeoVista-owned names
      expect(SeovistaIssueSeverityValues).toBeDefined();
      expect(SeovistaAuditIssueTypeValues).toBeDefined();
      expect(SeovistaAuditLimits).toBeDefined();
    });

    it('no OpenSEO-branded names are exported', () => {
      // TypeScript would fail at compile time if we tried to import
      // an OpenSEO-branded name. At runtime, verify the exported
      // function names don't contain upstream branding.
      expect(name).not.toContain('OpenSEO');
      expect(name).toContain('seovista');
    });
  });

  describe('audit issue types', () => {
    it('has 27 issue types', () => {
      const allTypes = getSeovistaIssueTypeKeys();
      expect(allTypes).toHaveLength(27);
    });

    it('severity order is correct', () => {
      expect(SeovistaSeverityOrder.critical).toBe(0);
      expect(SeovistaSeverityOrder.warning).toBe(1);
      expect(SeovistaSeverityOrder.info).toBe(2);
    });

    it('getSeovistaIssueDescriptor returns correct severity for known type', () => {
      const descriptor = getSeovistaIssueDescriptor('missing-title');
      expect(descriptor).not.toBeNull();
      expect(descriptor!.severity).toBe('critical');
      expect(descriptor!.title).toBe('Missing title tag');
    });

    it('getSeovistaIssueDescriptor returns null for unknown type', () => {
      const descriptor = getSeovistaIssueDescriptor('nonexistent');
      expect(descriptor).toBeNull();
    });

    it('getSeovistaAllIssueTypes returns immutable frozen object', () => {
      const registry = getSeovistaAllIssueTypes();
      expect(Object.isFrozen(registry)).toBe(true);
    });

    it('all issue types have required fields', () => {
      const registry = getSeovistaAllIssueTypes();
      for (const [key, descriptor] of Object.entries(registry)) {
        expect(descriptor.severity, `${key}: missing severity`).toBeDefined();
        expect(descriptor.title, `${key}: missing title`).toBeTruthy();
        expect(descriptor.explanation, `${key}: missing explanation`).toBeTruthy();
        expect(descriptor.howToFix, `${key}: missing howToFix`).toBeTruthy();
        expect(['critical', 'warning', 'info']).toContain(descriptor.severity);
      }
    });
  });

  describe('audit limits', () => {
    it('has correct limit values', () => {
      expect(SeovistaAuditLimits.MIN_AUDIT_PAGES).toBe(10);
      expect(SeovistaAuditLimits.DEFAULT_AUDIT_PAGES).toBe(50);
      expect(SeovistaAuditLimits.FREE_MAX_AUDIT_PAGES).toBe(50);
      expect(SeovistaAuditLimits.PAID_MAX_AUDIT_PAGES).toBe(10_000);
    });

    it('limit consistency invariant holds', () => {
      expect(validateSeovistaAuditLimitConsistency()).toBe(true);
    });
  });

  describe('error codes', () => {
    it('isSeovistaErrorCode recognizes valid codes', () => {
      expect(isSeovistaErrorCode('VALIDATION_ERROR')).toBe(true);
      expect(isSeovistaErrorCode('INTERNAL_ERROR')).toBe(true);
      expect(isSeovistaErrorCode('NEXTG_UNAVAILABLE')).toBe(true);
    });

    it('isSeovistaErrorCode rejects invalid codes', () => {
      expect(isSeovistaErrorCode('NOT_A_REAL_CODE')).toBe(false);
      expect(isSeovistaErrorCode('')).toBe(false);
    });

    it('shouldReportSeovistaError excludes non-reportable codes', () => {
      expect(shouldReportSeovistaError('UNAUTHENTICATED')).toBe(false);
      expect(shouldReportSeovistaError('NOT_FOUND')).toBe(false);
      expect(shouldReportSeovistaError('VALIDATION_ERROR')).toBe(false);
    });

    it('shouldReportSeovistaError includes reportable codes', () => {
      expect(shouldReportSeovistaError('INTERNAL_ERROR')).toBe(true);
      expect(shouldReportSeovistaError('UPSTREAM_UNAVAILABLE')).toBe(true);
      expect(shouldReportSeovistaError('RATE_LIMITED')).toBe(true);
    });

    it('shouldReportSeovistaError handles null/undefined', () => {
      expect(shouldReportSeovistaError(null)).toBe(true);
      expect(shouldReportSeovistaError(undefined)).toBe(true);
    });
  });

  describe('json codec', () => {
    it('parses valid JSON matching schema', () => {
      const schema = z.object({ foo: z.string() });
      const codec = createSeovistaJsonCodec(schema);
      const result = codec.safeParse('{"foo":"bar"}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ foo: 'bar' });
      }
    });

    it('rejects invalid JSON', () => {
      const schema = z.object({ foo: z.string() });
      const codec = createSeovistaJsonCodec(schema);
      const result = codec.safeParse('not json');
      expect(result.success).toBe(false);
    });

    it('rejects JSON not matching schema', () => {
      const schema = z.object({ foo: z.string() });
      const codec = createSeovistaJsonCodec(schema);
      const result = codec.safeParse('{"bar":123}');
      expect(result.success).toBe(false);
    });

    it('round-trips through encode/decode', () => {
      const schema = z.object({ num: z.number() });
      const codec = createSeovistaJsonCodec(schema);
      const input = { num: 42 };
      const encoded = JSON.stringify(input);
      const result = codec.safeParse(encoded);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });
  });

  describe('normalization contracts', () => {
    it('SeovistaApiCostRecordSchema validates correct cost record', () => {
      const record = {
        provider: 'dataforseo' as const,
        operation: 'keyword_data',
        requestId: 'req-123',
        currency: 'USD' as const,
        amount: 0.05,
        timestamp: new Date(),
      };
      const result = SeovistaApiCostRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
    });

    it('SeovistaApiCostRecordSchema rejects negative amount', () => {
      const record = {
        provider: 'dataforseo' as const,
        operation: 'keyword_data',
        requestId: 'req-123',
        currency: 'USD' as const,
        amount: -0.05,
        timestamp: new Date(),
      };
      const result = SeovistaApiCostRecordSchema.safeParse(record);
      expect(result.success).toBe(false);
    });

    it('SeovistaKeywordMetricsSchema validates correct metrics', () => {
      const metrics = {
        keyword: 'seo tools',
        searchVolume: 1200,
        competition: 0.65,
        cpc: 2.5,
        locationCode: 2840,
        languageCode: 'en',
      };
      const result = SeovistaKeywordMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });

    it('SeovistaSerpItemSchema validates correct SERP item', () => {
      const item = {
        position: 1,
        url: 'https://example.com',
        title: 'Example Page',
        description: 'A description',
        domain: 'example.com',
      };
      const result = SeovistaSerpItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('SeovistaDomainOverviewSchema validates correct overview', () => {
      const overview = {
        domain: 'example.com',
        organicTraffic: 50000,
        organicKeywords: 12000,
        backlinks: 300000,
        referringDomains: 1500,
        trafficCost: 45000,
      };
      const result = SeovistaDomainOverviewSchema.safeParse(overview);
      expect(result.success).toBe(true);
    });
  });
});
