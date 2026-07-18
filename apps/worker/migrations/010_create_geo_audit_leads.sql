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
