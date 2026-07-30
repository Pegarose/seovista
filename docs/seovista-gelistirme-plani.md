Önce bilinmesi gereken iki blokaj
Factory worker runtime sorunu: Son otomatik worker hiçbir kod veya handoff üretmeden exit code 0 ile kapandı. Manuel agent kullanırken her agent için gerçek commit, test çıktısı ve değişen dosya listesi zorunlu olsun.
Docker/lifecycle güvenliği: Aktif güvenlik hook'u Docker, Compose, infrastructure:*, lifecycle:* ve ilgili lifecycle scriptlerini engelliyor. Agent'lar:
docker rm, docker rm -f, compose down, prune çalıştırmamalı.
Başka projelerin container veya portlarına dokunmamalı.
Sahipliği doğrulanamayan kaynakları durdurmak yerine işi blocked olarak raporlamalı.
Gerekirse PostgreSQL 8543, Redis 8637, NextG 3101, web 3200 kaynaklarını siz manuel olarak hazırlamalısınız.
Faz 0: Her agent öncesi ortak çalışma protokolü
Her agent'a şu kuralları verin:

text

Repository: C:\bc-proje\Seovista

Kurallar:
- Mevcut tracked ve untracked değişiklikleri koru.
- git reset, git clean, broad cleanup kullanma.
- Docker container silme/durdurma/recreate/prune işlemi yapma.
- Başka projelere, container'lara veya portlara dokunma.
- pnpm yerine Corepack ile repository-pinned pnpm kullan.
- Secret, credential veya API key loglama.
- Önce RED testini yaz ve gerçekten çalıştır.
- Sonra implementation yap.
- Handoff öncesi exact commands, exit code, test count, skipped checks,
  changed files ve commit hash bildir.
- Bir servis veya kaynak güvenli şekilde doğrulanamıyorsa tahmin etme,
  blocked olarak bildir.

Show more
Her agent sonunda:

powershell

git status --short
git diff --stat
git diff --check
git diff --cached
çıktılarını ve kendi scoped commit hash'ini vermeli.

Faz 1: Foundation Recovery
Bu faz tamamlanmadan sonraki ürün fazlarının validation sonuçlarına güvenmeyin.

1A. GEO result contract hardening
Mission feature: foundation-recovery-geo-result-contract-hardening

Agent tipi: Web/backend test ve typed-contract uzmanı.

Yapılacaklar:

Polling başlangıç durumunu doğru render etme.
queued, running, pending ayrımını koruma.
timeout, permanent, permanent_failure gibi terminal alias'leri doğru ele alma.
Bilinmeyen status ve reddedilmiş action için açık unavailable state.
Completed payload için strict parser:
finite ve sınırlandırılmış skorlar;
geçerli score band/status/tag değerleri;
zorunlu issue alanları;
gerçek boolean değerleri;
geçerli platform ve servis aralıkları;
HTTP(S) target URL.
Preview verilerinde title, snippet ve URL'nin ayrı ayrı doğrulanması.
Gerçek hook kullanan Client Component regression testleri.
Timer, router refresh, stale response, terminal alias ve timeout senaryoları.
Kabul kriterleri:

Implementation öncesi gerçek RED çıktısı.
Focused GEO testleri geçer.
Her state tam olarak bir main ve bir descriptive h1 üretir.
Eksik veya bozuk veri score, target, preview, service veya metric olarak uydurulmaz.
Web test, strict typecheck ve lint geçer.
1B. GEO lifecycle ve HTTP boundary
Bu başlık iki ayrı agent işi olarak yürütülmeli.

1B-1. PostgreSQL lifecycle ve worker
Mission feature: foundation-recovery-geo-lifecycle-authority-followup

Agent tipi: PostgreSQL/backend/concurrency uzmanı.

Yapılacaklar:

PostgreSQL native status'leri authoritative yap.
Terminal durumların geriye dönmesini engelle.
Public alias'lerin persistence'a yazılmasını engelle.
Worker timeout, unavailable, retryable, validation ve permanent sonuçlarını typed olarak eşleştir.
Repository, index ve public normalization için tek canonical in-flight predicate kullan.
checkJobStatusAction içinde UUID doğrulamasını repository/database construction'dan önce yap.
Minimal status DTO döndür, persistedStatus, lead identity ve email sızdırma.
Lead update'i authoritative job ilişkisini kullanan tek atomic mutation yap.
Gerçek PostgreSQL transition, alias, single-flight, race ve worker classification testleri ekle.
1B-2. Result route ve private response headers
Agent tipi: Next.js route/security uzmanı.

Yapılacaklar:

headers() ile ilgili discarded/no-op yolu kaldır.
Her private result HTTP response'una gerçekten şu header'ları ekle:
text

Cache-Control: private, no-store, max-age=0
X-Robots-Tag: noindex, nofollow
Header'ları yalnızca source inspection ile değil gerçek HTTP response üzerinden test et.
Mismatched lead update ve direct repository çağrılarını test et.
Raw persistence alanlarının public DTO'ya sızmadığını doğrula.
Not: Bu iki agent aynı dosyalara dokunacaksa paralel çalıştırmayın. Önce backend/lifecycle agent, sonra route agent.

1C. Lifecycle ownership ve E2E environment
Bu alanı üç küçük manuel agent görevine ayırın.

1C-1. Resource leak ve ownership detection
Mission feature: foundation-recovery-e2e-resource-leak-detection

Agent tipi: Infrastructure/test lifecycle uzmanı.

Yapılacaklar:

Process identity, ownership token, compose project ve port kayıtlarını doğrula.
Stale context ve dead-owner tespiti ekle.
Concurrent claim ve wrong-token rejection testleri yaz.
Parent-owned context'leri koru.
Çözülemeyen kaynağı kanıt olarak raporla.
Hiçbir container'ı silme, durdurma veya recreate etme.
Kabul: Ownership kanıtlanamıyorsa cleanup yapmak yerine açık blocked evidence.

1C-2. E2E environment propagation
Mission feature: foundation-recovery-e2e-environment-propagation

Agent tipi: Playwright/lifecycle integration uzmanı.

Yapılacaklar:

Root ve nested scriptlerde bare pnpm kullanımlarını kaldır.
Corepack ve pnpm 10.30.1 sınırını tüm child process'lere taşı.
Validated lifecycle context'ten:
DATABASE_URL;
REDIS_URL;
database name;
Redis port/database;
namespace üret.
Aynı context'i Playwright build ve serve process'lerine aktar.
Ambient environment'a güvenme.
Port 3200 üzerinde stale server'ı sessizce reuse etme.
Root test:e2e wrapper üzerinden desktop ve mobile GEO lead redirect testlerini çalıştır.
1C-3. E2E scrutiny review
Mission feature: foundation-recovery-e2e-environment-scrutiny-fixes

Agent tipi: Bağımsız code review ve gate uzmanı.

Kontrol listesi:

Bare pnpm kalmış mı?
Lifecycle context gerçekten validated mı?
Build ve serve aynı environment'ı alıyor mu?
Playwright stale server reuse ediyor mu?
Root test:e2e gerçekten çalışıyor mu?
Desktop ve mobile redirect kanıtı var mı?
Ownership ve cleanup evidence gerçek mi?
Herhangi bir broad Docker cleanup kullanılmış mı?
1D. Worker test hygiene
Mission feature: misc-fix-worker-test-hygiene

Agent tipi: Worker test determinism uzmanı.

Yapılacaklar:

429 testinin gerçek rate-limit branch'ine ulaştığını doğrula.
Response mock'a gerekli .text() gibi metotları ekle.
Render-cache testlerinde per-run unique URL veya test izolasyonu kullan.
Misleading migration test başlığını idempotency olarak düzelt.
Production cache semantiğini değiştirme.
Live egress ekleme.
Kabul:

text

corepack pnpm --filter @seovista/worker exec vitest run --exclude src/__tests__/fetcher.test.ts
exit code 0 olmalı. Worker typecheck ve lint de geçmeli.

1E. Foundation Recovery validation
Bu noktaya kadar tüm implementation işleri geçmeden validator çalıştırmayın.

1E-1. Scrutiny
Mission feature: scrutiny-validator-Foundation Recovery

Kontrol:

Test
Typecheck
Lint
E2E altyapı raporu
Commit scope
Docker/lifecycle güvenlik ihlali
Gerçek RED/GREEN kanıtı
1E-2. User testing
Mission feature: user-testing-validator-Foundation Recovery

Kontrol:

Fresh browser context
Admin login
GEO result states
Private HTTP headers
Desktop/mobile lead redirect
Auth ve ownership sınırları
No fabricated result
No foreign resource access
Servis sahipliği doğrulanamıyorsa validator blocked dönmeli, sahte passed yazmamalı.

Faz 2: Keyword/SERP backend
Foundation Recovery yeterince doğrulandıktan sonra başlatın.

2A. Keyword CRUD ve ownership
Mission feature: keyword-crud-and-ownership

Agent tipi: Backend/API ve küçük admin navigation uzmanı.

Yapılacaklar:

Workspace/project scoped CRUD.
Unicode trim, NFC, internal whitespace ve case normalization.
Stable validation/conflict response.
Normalized duplicate rejection.
Delete policy'yi açıkça uygula.
Foreign tenant ve insufficient capability izolasyonu.
/admin üzerinden görünür keyword navigation.
Kabul:

Owner/admin/editor/viewer matrisi doğru.
Foreign request keyword, rank veya provider metadata sızdırmıyor.
Delete repeat-safe.
Fresh /admin navigation selected project context'i koruyor.
2B. Keyword provider jobs
Mission feature: keyword-provider-jobs

Agent tipi: Worker/BullMQ/backend uzmanı.

Bağımlılık: 2A tamamlanmış olmalı.

Yapılacaklar:

Append-only metric, SERP ve rank history.
Job, operation ve run identity.
Exactly 3 attempts, initial dahil.
Backoff: 100ms, 200ms.
Sadece timeout/rate-limit/unavailable retry.
Processing ve finalization sırasında ownership revalidation.
Duplicate, concurrent, crash-before-commit ve crash-after-commit idempotency.
Terminal success doğru persisted result'a bağlı olmalı.
2C. Keyword dashboard lifecycle
Mission feature: keyword-dashboard-lifecycle

Agent tipi: Frontend/browser integration uzmanı.

Bağımlılık: 2A ve 2B.

Yapılacaklar:

Latest-successful değerlerin korunması.
CRUD, research, refresh, retry, cancel ve reload akışları.
Queued, running, retrying, partial, failed, cancelled, ownership-invalid state'leri.
Append-only history.
Two-run deterministic comparison.
Owner/admin/editor/viewer/foreign browser davranışı.
Faz 3: CMS Editor
3A. Editor analysis contract
Mission feature: editor-analysis-contract

Agent tipi: Domain package/backend uzmanı.

Yapılacaklar:

Package-root public analyzer.
Title, body, heading, LSI, entity, readability ve density ölçümleri.
Score 0..100.
Empty draft desteği.
Typed block normalization.
Unsafe scheme, URL, userinfo ve private host rejection.
Raw editor shape, any ve unsafe HTML public boundary'den çıkmamalı.
Kabul:

Strong, weak, empty, over-optimized ve malformed fixture'lar deterministic.
Tek bir terimi taşıdığınızda yalnızca ilgili metric değişiyor.
Unknown/malformed block sessizce düşürülmüyor.
3B. Interactive live analysis
Mission feature: editor-live-analysis

Agent tipi: Frontend + accessibility uzmanı.

Bağımlılık: 3A.

Yapılacaklar:

Title/body/heading değişikliklerinde full reload olmadan analiz.
Sequence identity ile stale response koruması.
Actionable recommendations.
NeuronWriter optional degraded state.
Loading, dirty, saving, saved, stale, validation, persistence, auth ve analysis error state'leri.
Keyboard operability.
Desktop ve narrow viewport accessibility.
3C. Revision ve publishing
Mission feature: editor-revision-publishing

Bunu iki ayrı chat agent ile yapın:

3C-1. Revision transaction ve authorization
Immutable revision.
Strictly monotonic revision number.
Analysis snapshot ile atomic commit.
Capability enforcement.
Publish/unpublish/archive.
Historical revision read-only.
Failed transaction'da revision ve analysis eklenmemesi.
3C-2. Preview/public artifact security
Preview token document/revision/entry scoped.
Expiration ve revocation.
Draft/private/preview marker'larının public HTML, metadata, JSON-LD, sitemap, feed, llms.txt, bundle ve log'lara sızmaması.
Historical revision save/publish edememeli.
Faz 4: Monitoring ve Bulk Audit
Bu fazın ilk iki backend agent'ı, dosya çakışması yoksa ayrı oturumlarda paralel yürüyebilir.

4A. Monitoring schedules/history
Mission feature: monitoring-schedules-history

Agent tipi: Backend/queue/scheduler uzmanı.

Yapılacaklar:

Subscription CRUD.
Schedule/timezone validation.
Exact controlled-clock boundaries.
Stable subscription/run identity.
Append-only scores.
Threshold alerts.
Notification outbox isolation.
Duplicate enqueue/delivery/retry idempotency.
Failure/degraded run'larda score uydurmama.
4B. Bulk worker
Mission feature: monitoring-bulk-worker

Agent tipi: Worker/security/backend uzmanı.

Yapılacaklar:

Maximum 100 URL.
Maximum URL length 2048.
Scheme/host/default port/dot segment normalization.
Fragment/query policy.
SSRF, loopback, private, link-local, multicast ve metadata block.
Redirect ve DNS/TOCTOU revalidation.
Duplicate item identity.
Aggregate invariant'ler.
Retry/cancel semantics.
Processing-time ownership validation.
4C. Monitoring/Bulk UI
Mission feature: monitoring-navigation-degraded-ui

Agent tipi: Frontend/integration/accessibility uzmanı.

Bağımlılık: 4A ve 4B.

Yapılacaklar:

/admin üzerinden gerçek visible navigation.
Monitoring, subscription detail, audit result ve bulk route'ları.
Click-through, reload, back/forward ve deep-link context korunması.
Empty, loading, forbidden, queued, running, retrying, partial, complete, failed, rejected, cancelled ve ownership-invalid state'leri.
DB, Redis, provider ve notification degradation state'leri.
Mevcut başarılı kayıtların dependency failure sırasında korunması.
Foreign tenant metadata leak olmaması.
Faz 5: Live ve Advanced
5A. Live provider adapter
Mission feature: live-provider-adapter-selection

Agent tipi: Provider boundary/backend uzmanı.

Yapılacaklar:

DataForSEO-compatible adapter.
Mock ile aynı normalized DTO.
Timeout/rate-limit/unavailable retry taxonomy.
Missing mode, invalid mode, missing opt-in ve missing credentials error'ları.
Fixture transport zorunluluğu.
Her selector path'te zero egress.
Secret ve raw provider response leak kontrolü.
Bu fazda gerçek provider credentials kullanmayın. Fixture-backed transport ile çalışın.

5B. Preview ve citations
Mission feature: live-preview-citations

Agent tipi: Backend + frontend integration uzmanı.

Bağımlılık: 5A.

Yapılacaklar:

Source mode ve display type bağımsız toggle.
Provider/fixture provenance.
Operation/run identity.
Capture time, TTL ve freshness.
No-result, expired, unavailable, revoked ve unauthorized state'leri.
Simulated output'un live gibi gösterilmemesi.
Workspace/project/audit scoped citation persistence.
Same-run idempotency.
Later-run append.
Reload sonrası provenance korunması.
Foreign read/mutation rejection.
Faz 6: Final integration ve güvenlik
6A. Observability ve owned validation
Mission feature: live-observability-and-owned-validation

Agent tipi: Integration, lifecycle ve security review uzmanı.

Kontrol:

Telemetry yalnızca izinli alanları içeriyor:
mode
outcome
retryable
attempt
request_id
operation_key
run_id
fixture_id
captured_at
freshness
redacted error code
Secret scan:
credentials
auth headers
raw payload
secret URL
private/draft markers
fabricated claims
Full typecheck, package, web, worker, E2E, a11y, SEO ve lifecycle gate'leri.
Browser validation yalnızca sahipliği doğrulanmış server üzerinde.
Agent'ın başlattığı kaynakların tamamı kanıtlı şekilde kapatılmış.
Off-limit port ve container erişimi yok.
6B. Cross-surface auth isolation
Mission feature: live-cross-surface-auth-isolation

Agent tipi: Final browser/API/security integration uzmanı.

Kontrol:

Her protected route:
authorized;
insufficient capability;
foreign workspace;
unauthenticated;
guessed ID;
dependency failure.
Same-origin returnTo.
Login sonrası original route restore.
Logout ve session expiry sonrası cache temizliği.
Back/reload protected veya foreign content göstermemeli.
İki tenant arasında browser, API, worker, CMS, monitoring, bulk, citation ve public artifact izolasyonu.
Aynı route/state matrix iki kez çalıştırılıp normalized output karşılaştırılmalı.
Failed, stale, unavailable ve unverified state'ler hiçbir şeyi uydurmamalı.
Önerilen dependency sırası
text

Foundation Recovery
  ├── GEO contract
  ├── GEO lifecycle + private headers
  ├── lifecycle ownership
  ├── E2E environment
  └── worker hygiene
        ↓
Foundation Recovery validation

Keyword CRUD
  ↓
Keyword provider jobs
  ↓
Keyword dashboard

Editor analysis contract
  ↓
Editor live analysis
  ↓
Revision/publishing

Monitoring schedules/history ─┐
                              ├── Monitoring/Bulk UI
Monitoring bulk worker ───────┘

Live provider adapter
  ↓
Preview/citations

All surfaces
  ├── Observability/owned validation
  └── Cross-surface auth isolation

Show more
Manuel agent kullanırken önerilen sıra
Aynı anda yalnızca bağımsız dosya alanlarına dokunan agent'ları çalıştırın:

Foundation Recovery GEO contract
Foundation Recovery lifecycle/backend
Foundation Recovery private headers
Resource ownership/leak detection
E2E environment propagation
Worker test hygiene
Foundation Recovery review
Foundation Recovery browser validation
Keyword CRUD
Keyword provider jobs
Keyword dashboard
Editor analysis
Editor live analysis
Editor revision/publication
Monitoring schedules
Bulk worker
Monitoring UI
Live adapter
Citations/preview
Observability
Final cross-surface auth isolation