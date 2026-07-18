import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestEnvironment, TestEnvironment } from "./helpers/test-env.js";
import { createGeoAuditRepository } from "../db/geo-audit-repository.js";
import { createJobRepository } from "../db/job.js";

describe("Geo Audit Repository", () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await setupTestEnvironment();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it("can create a lead and update the email later", async () => {
    const db = env.db;
    const repo = createGeoAuditRepository(db);
    
    const lead = await repo.createLead({
      domain: "example.com",
      brandName: "Example",
      primaryMarket: "US",
    });

    expect(lead.id).toBeDefined();
    expect(lead.work_email).toBeNull();
    
    const updated = await repo.updateLeadEmail(lead.id, "test@example.com", true);
    expect(updated.work_email).toBe("test@example.com");
    expect(updated.marketing_consent).toBe(true);
  });

  it("can create a job record wrapping job_records", async () => {
    const db = env.db;
    const repo = createGeoAuditRepository(db);
    const jobRepo = createJobRepository(db);

    const lead = await repo.createLead({
      domain: "example.com",
      brandName: "Example",
      primaryMarket: "US",
    });

    const jobId = await repo.createJobRecord({
      target: "example.com",
      service: "geo-audit",
      status: "queued",
      leadId: lead.id
    });

    expect(jobId).toBeDefined();

    // Verify raw job_records table logic
    const res = await db.query("SELECT * FROM job_records WHERE id = $1", [jobId]);
    expect(res.rows[0]).toBeDefined();
    const jr = res.rows[0];
    expect(jr.target).toBe("example.com");
    expect(jr.queue_name).toBe("geo-audit");
    expect(jr.status).toBe("queued");
    expect(jr.lead_id).toBe(lead.id);
    expect(jr.job_identity).toBeDefined();
    expect(jr.correlation_id).toBeDefined();
  });
});

