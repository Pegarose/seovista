## Task 1: Audit Leads and Jobs DB Schema

**Files:**
- Create: `apps/worker/migrations/010_create_geo_audit_leads.sql`
- Create: `apps/worker/src/db/audit-repository.ts`
- Modify: `apps/worker/src/db/index.ts`

**Interfaces:**
- Produces: `010_create_geo_audit_leads.sql` schema.
- Produces: `createAuditRepository(db)` holding `createLead(leadPayload)` and `updateLeadEmail(leadId, email, marketingConsent)`.
- Produces: A unified function to insert queue records wrapping `job_records`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/worker/src/__tests__/audit-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestDb, closeTestDb, runMigrations } from "./helpers/test-env";
import { createAuditRepository } from "../db/audit-repository";

describe("Audit Repository", () => {
  beforeEach(async () => await runMigrations());
  afterEach(async () => await closeTestDb());

  it("can create a lead and update the email later", async () => {
    const db = getTestDb();
    const repo = createAuditRepository(db);
    
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --run test --filter @seovista/worker -- run apps/worker/src/__tests__/audit-repository.test.ts`
Expected: FAIL since the file is missing/modules are undefined.

- [ ] **Step 3: Write migration script**

```sql
-- apps/worker/migrations/010_create_geo_audit_leads.sql
CREATE TABLE IF NOT EXISTS geo_audit_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    primary_market TEXT NOT NULL,
    work_email TEXT,
    marketing_consent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- We link our job_records to leads
ALTER TABLE job_records ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES geo_audit_leads(id);
```

- [ ] **Step 4: Write repository logic**

```typescript
// apps/worker/src/db/audit-repository.ts
import type { DbClient } from "./client";

export interface GeoAuditLeadRow {
  id: string;
  domain: string;
  brand_name: string;
  primary_market: string;
  work_email: string | null;
  marketing_consent: boolean;
  created_at: Date;
}

export function createAuditRepository(client: DbClient) {
  return {
    async createLead(data: { domain: string; brandName: string; primaryMarket: string }) {
      const res = await client.query<GeoAuditLeadRow>(
        `INSERT INTO geo_audit_leads (domain, brand_name, primary_market)
         VALUES ($1, $2, $3) RETURNING *`,
        [data.domain, data.brandName, data.primaryMarket]
      );
      return res.rows[0]!;
    },
    async updateLeadEmail(leadId: string, email: string, consent: boolean) {
      const res = await client.query<GeoAuditLeadRow>(
        `UPDATE geo_audit_leads SET work_email = $1, marketing_consent = $2 
         WHERE id = $3 RETURNING *`,
        [email, consent, leadId]
      );
      if (res.rowCount === 0) throw new Error("Lead not found");
      return res.rows[0]!;
