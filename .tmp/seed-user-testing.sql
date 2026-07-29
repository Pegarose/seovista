-- Seed data for recommendation-engine user testing validation
-- Creates 5 job types: low-band, high-band, empty-matches, queued, failed

-- First, create leads
INSERT INTO geo_audit_leads (id, domain, brand_name, primary_market, work_email, marketing_consent)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'https://example.com', 'TestBrand Low', 'GLOBAL', 'tester@example.com', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'https://example.com', 'TestBrand High', 'GLOBAL', 'tester@example.com', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'https://example.com', 'TestBrand Empty', 'GLOBAL', 'tester@example.com', true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'https://example.com', 'TestBrand Queued', 'GLOBAL', NULL, false),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'https://example.com', 'TestBrand Failed', 'GLOBAL', NULL, false
  )
ON CONFLICT (id) DO NOTHING;

-- Insert job_results first (for completed jobs)
INSERT INTO job_results (id, correlation_id, job_identity, result_type, payload)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'seed-correlation-low-001', 'seed-job-identity-low-001', 'geo_readiness',
   '{"breakdown":{"scoreVersion":"seovista-score-v1.2-decoupled","overallScore":45,"band":"critical","modules":[{"key":"indexability","name":"İndekslenebilirlik","score":5,"maxScore":15,"status":"critical","issues":[{"code":"NOINDEX_DETECTED","message":"noindex tag detected on page","pointLoss":-10,"severity":"critical","module":"indexability"}]},{"key":"content-depth","name":"İçerik Derinliği","score":8,"maxScore":20,"status":"poor","issues":[{"code":"THIN_CONTENT_RISK","message":"Thin content risk detected","pointLoss":-12,"severity":"high","module":"content-depth"}]},{"key":"schema","name":"Schema İşaretlemesi","score":3,"maxScore":15,"status":"poor","issues":[{"code":"JSON_LD_MISSING_RECOMMENDED_SCHEMA","message":"Missing recommended JSON-LD schema","pointLoss":-12,"severity":"high","module":"schema"}]}],"platformReadiness":[{"platform":"chatgpt","score":30,"confidence":0.5,"rationale":"Low content depth and schema","experimental":true},{"platform":"perplexity","score":35,"confidence":0.5,"rationale":"Missing schema markup","experimental":true}]},"matchedServices":[{"service_id":"geo-schema-pack","name":"Schema & Varlık Paketi","description":"JSON-LD schema işaretlemesi ve varlık netliği için eksiksiz paket; önerilen şemaları ekler ve eksik breadcrumb yapısını tamamlar.","matchedTags":["schema","entity-clarity"],"relevanceScore":12,"addressedIssueCodes":["JSON_LD_MISSING_RECOMMENDED_SCHEMA"]},{"service_id":"content-depth-boost","name":"İçerik Derinliği Boost","description":"İnce içerik ve yapı kalitesi sorunlarını giderir; liste/tablo ile kompleks konuları cevaplanabilir hale getirir.","matchedTags":["content-depth"],"relevanceScore":12,"addressedIssueCodes":["THIN_CONTENT_RISK"]},{"service_id":"indexability-rescue","name":"İndeksleme Kurtarma","description":"noindex, canonical uyuşmazlığı ve tarama engellerini çözerek sayfaların indekse girmesini sağlar.","matchedTags":["indexability"],"relevanceScore":10,"addressedIssueCodes":["NOINDEX_DETECTED"]}],"tier":"free"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'seed-correlation-high-002', 'seed-job-identity-high-002', 'geo_readiness',
   '{"breakdown":{"scoreVersion":"seovista-score-v1.2-decoupled","overallScore":75,"band":"good","modules":[{"key":"technical-seo","name":"Teknik SEO","score":12,"maxScore":15,"status":"good","issues":[{"code":"META_DESCRIPTION_MISSING","message":"Meta description missing","pointLoss":-3,"severity":"medium","module":"technical-seo"}]},{"key":"internal-linking","name":"İç Bağlantılar","score":8,"maxScore":10,"status":"good","issues":[{"code":"NO_INTERNAL_LINKS","message":"No internal links detected","pointLoss":-2,"severity":"low","module":"internal-linking"}]},{"key":"indexability","name":"İndekslenebilirlik","score":14,"maxScore":15,"status":"good","issues":[]}],"platformReadiness":[{"platform":"chatgpt","score":70,"confidence":0.7,"rationale":"Good technical SEO","experimental":true},{"platform":"perplexity","score":72,"confidence":0.7,"rationale":"Good overall structure","experimental":true}]},"matchedServices":[{"service_id":"technical-seo-tuneup","name":"Teknik SEO İnce Ayar","description":"Title, meta açıklama, başlık yapısı ve deneyim metriklerini düzelterek teknik sağlamlaştırma yapar.","matchedTags":["technical-seo"],"relevanceScore":3,"addressedIssueCodes":["META_DESCRIPTION_MISSING"]},{"service_id":"internal-linking-audit","name":"İç Bağlantı Denetimi","description":"Jenerik ve boş çapa metinlerini düzeltir, iç bağlantı boşluklarını kapatarak tarama verimliliğini artırır.","matchedTags":["internal-linking"],"relevanceScore":2,"addressedIssueCodes":["NO_INTERNAL_LINKS"]}],"tier":"free"}'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'seed-correlation-empty-003', 'seed-job-identity-empty-003', 'geo_readiness',
   '{"breakdown":{"scoreVersion":"seovista-score-v1.2-decoupled","overallScore":85,"band":"excellent","modules":[{"key":"indexability","name":"İndekslenebilirlik","score":15,"maxScore":15,"status":"excellent","issues":[]},{"key":"content-depth","name":"İçerik Derinliği","score":19,"maxScore":20,"status":"excellent","issues":[]}],"platformReadiness":[{"platform":"chatgpt","score":82,"confidence":0.8,"rationale":"Excellent content","experimental":true}]},"matchedServices":[],"tier":"free"}')
ON CONFLICT (id) DO NOTHING;

-- Insert job_records
-- Low-band completed job
INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, result_id, lead_id, completed_at, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'seed-job-identity-low-001', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-low-001', 'completed', 1, 'success', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', now(), 'seed-cache-key-low-001')
ON CONFLICT (id) DO NOTHING;

-- High-band completed job
INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, result_id, lead_id, completed_at, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000002', 'seed-job-identity-high-002', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-high-002', 'completed', 1, 'success', 'bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', now(), 'seed-cache-key-high-002')
ON CONFLICT (id) DO NOTHING;

-- Empty-matches completed job
INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, result_id, lead_id, completed_at, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'seed-job-identity-empty-003', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-empty-003', 'completed', 1, 'success', 'bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', now(), 'seed-cache-key-empty-003')
ON CONFLICT (id) DO NOTHING;

-- Queued job (no result)
INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, lead_id, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000004', 'seed-job-identity-queued-004', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-queued-004', 'queued', 0, 'aaaaaaaa-0000-0000-0000-000000000004', 'seed-cache-key-queued-004')
ON CONFLICT (id) DO NOTHING;

-- Failed job (no result)
INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, lead_id, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000005', 'seed-job-identity-failed-005', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-failed-005', 'failed', 1, 'retryable', 'aaaaaaaa-0000-0000-0000-000000000005', 'seed-cache-key-failed-005')
ON CONFLICT (id) DO NOTHING;

-- Also create a permanent (terminal failure) job for VAL-B-UI-012 coverage
INSERT INTO geo_audit_leads (id, domain, brand_name, primary_market, work_email, marketing_consent)
VALUES ('aaaaaaaa-0000-0000-0000-000000000006', 'https://example.com', 'TestBrand Permanent', 'GLOBAL', NULL, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, lead_id, cache_key)
VALUES ('cccccccc-0000-0000-0000-000000000006', 'seed-job-identity-permanent-006', 'https://example.com/', 'geo_readiness_jobs', 'seed-correlation-permanent-006', 'permanent', 3, 'permanent', 'aaaaaaaa-0000-0000-0000-000000000006', 'seed-cache-key-permanent-006')
ON CONFLICT (id) DO NOTHING;
