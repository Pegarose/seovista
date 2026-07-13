import { describe, it, expect } from 'vitest';
import {
  auditOutcomeSchema,
  name,
  normalizeAuditOutcome,
  projectAuditOutcomeForLog,
  serializeAuditOutcome,
} from '../index.js';

describe('@seovista/audit-core', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/audit-core');
  });

  it('exports the normalized audit outcome contract', () => {
    const outcome = normalizeAuditOutcome({ kind: 'timeout' });

    expect(auditOutcomeSchema.parse(outcome)).toEqual(outcome);
    expect(projectAuditOutcomeForLog(outcome)).toEqual({
      phase: 'request',
      errorClass: 'timeout',
      durationMs: 0,
    });
    expect(serializeAuditOutcome(outcome)).toBe(
      '{"phase":"request","errorClass":"timeout","durationMs":0}',
    );
  });
});
