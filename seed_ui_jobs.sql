TRUNCATE job_records CASCADE;
TRUNCATE job_results CASCADE;

INSERT INTO job_results (id, correlation_id, job_identity, result_type, payload) 
VALUES ('11111111-1111-1111-1111-111111111111', 'cor-low', 'sub-low', 'geo_readiness', '{"overallScore": 45, "scoreBand": "critical", "matchedServices": [{"service_id":"geo-a", "name":"Hizmet A", "description":"Açıklama A", "matchedTags":["schema"], "relevanceScore":10, "addressedIssueCodes":["C1"]}]}');
INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status, cache_key, result_id, completed_at) 
VALUES ('cccccccc-0000-0000-0000-000000000001', 'sub-low', 'geo_readiness_jobs', 'cor-low', 'https://example.com/low', 'completed', 'hash-low', '11111111-1111-1111-1111-111111111111', now());

INSERT INTO job_results (id, correlation_id, job_identity, result_type, payload) 
VALUES ('22222222-2222-2222-2222-222222222222', 'cor-high', 'sub-high', 'geo_readiness', '{"overallScore": 85, "scoreBand": "good", "matchedServices": [{"service_id":"geo-b", "name":"Hizmet B", "description":"Açıklama B", "matchedTags":["schema"], "relevanceScore":10, "addressedIssueCodes":["C1"]}]}');
INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status, cache_key, result_id, completed_at) 
VALUES ('cccccccc-0000-0000-0000-000000000002', 'sub-high', 'geo_readiness_jobs', 'cor-high', 'https://example.com/high', 'completed', 'hash-high', '22222222-2222-2222-2222-222222222222', now());

INSERT INTO job_results (id, correlation_id, job_identity, result_type, payload) 
VALUES ('33333333-3333-3333-3333-333333333333', 'cor-empty', 'sub-empty', 'geo_readiness', '{"overallScore": 85, "scoreBand": "good", "matchedServices": []}');
INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status, cache_key, result_id, completed_at) 
VALUES ('cccccccc-0000-0000-0000-000000000003', 'sub-empty', 'geo_readiness_jobs', 'cor-empty', 'https://example.com/empty', 'completed', 'hash-empty', '33333333-3333-3333-3333-333333333333', now());

INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status, cache_key) 
VALUES ('cccccccc-0000-0000-0000-000000000004', 'sub-queued', 'geo_readiness_jobs', 'cor-queued', 'https://example.com/queued', 'queued', 'hash-queued');

INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status, cache_key) 
VALUES ('cccccccc-0000-0000-0000-000000000005', 'sub-failed', 'geo_readiness_jobs', 'cor-failed', 'https://example.com/failed', 'failed', 'hash-failed');
