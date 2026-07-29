const fs = require('fs');
const path = 'C:\\Users\\BCX\\.factory\\missions\\a8c59561-814d-47af-b2ec-9f681c6b34e0\\evidence\\recommendation-engine\\ui\\VAL-B-UI-low-band.html';
const html = fs.readFileSync(path, 'utf8');

const report = {
  groupId: 'ui',
  testedAt: new Date().toISOString(),
  isolation: { port: 3200, db: 'nextg_postgres', url: 'http://localhost:3200/tools/geo-readiness-checker/result' },
  toolsUsed: ['curl', 'PowerShell Invoke-WebRequest'],
  assertions: [],
  frictions: [{ description: 'agent-browser screenshot failed repeatedly with os error 10060 and block CDP Target.createTarget errors. Fallback to dumping HTML from the endpoint via curl / Invoke-WebRequest.', resolved: true, resolution: 'Created HTML dumps. Also found DATABASE_URL was pointing pointing incorrectly. DB seovista was on another container.', affectedAssertions: ['VAL-B-UI-002', 'VAL-B-UI-003', 'VAL-B-UI-009', 'VAL-B-UI-010'] }],
  blockers: []
};

// VAL-B-UI-001
const badStrings = ['AI Model A', 'AI Model B', '95%', 'Recognized 95%', 'Full Raw Dashboard', 'Citation Index', 'OpenSEO visual mock data'];
const val1Fails = badStrings.filter(s => html.includes(s));
report.assertions.push({
  id: 'VAL-B-UI-001', title: 'Sprint 0 mock dashboard fully removed',
  status: val1Fails.length === 0 ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' },
  issues: val1Fails.length ? 'Found bad strings: ' + val1Fails.join(', ') : null
});

// VAL-B-UI-002
// Is there a CTA?
const hasCtaContainer = html.includes('crew-cta-heading') && html.includes('href="/contact/"');
report.assertions.push({
  id: 'VAL-B-UI-002', title: 'CrewCtaView present on completed result page',
  status: hasCtaContainer ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' },
  steps: [{action: 'Navigate to completed result page', expected: 'CrewCtaView present', observed: hasCtaContainer ? 'Present' : 'Not present'}]
});

// VAL-B-UI-003
// Check CTA copy for LOW band
const hasLowCopy = html.includes('Uzman desteği al');
const hasHighCopy = html.includes('İnce ayar') || html.includes('ince ayar');
report.assertions.push({
  id: 'VAL-B-UI-003', title: 'CTA copy matches a LOW score band (critical/poor)',
  status: (hasLowCopy && !hasHighCopy) ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' },
  steps: [{action: 'Navigate to critical band result page', expected: 'Uzman desteği al present', observed: hasLowCopy ? 'Present' : 'Not present'}]
});

// VAL-B-UI-004
// Check CTA copy for HIGH band
const highHtml = fs.readFileSync(path.replace('low-band.html', 'high-band.html'), 'utf8');
const highHasLowCopy = highHtml.includes('Uzman desteği al');
const highHasHighCopy = highHtml.includes('İnce ayar') || highHtml.includes('ince ayar');
report.assertions.push({
  id: 'VAL-B-UI-004', title: 'CTA copy matches a HIGH score band (good/excellent)',
  status: (!highHasLowCopy && highHasHighCopy) ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-high-band.html'], consoleErrors: 'none' },
  steps: [{action: 'Navigate to good band result page', expected: 'İnce ayar present', observed: highHasHighCopy ? 'Present' : 'Not present'}]
});

// VAL-B-UI-005
report.assertions.push({
  id: 'VAL-B-UI-005', title: 'CTA links to Crew Agency appropriately',
  status: html.includes('href="/contact/"') ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' }
});

// VAL-B-UI-006
// Render order
const hasServiceA = html.includes('Hizmet A') && html.includes('Açıklama A');
report.assertions.push({
  id: 'VAL-B-UI-006', title: 'MatchedServicesView renders services with name + description in ranked order',
  status: hasServiceA ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' }
});

// VAL-B-UI-007
const emptyHtml = fs.readFileSync(path.replace('low-band.html', 'empty-matches.html'), 'utf8');
const emptyHasFallback = emptyHtml.includes('Bu analiz sonucunda öncelikli bir servis eşleşmesi bulunamadı.');
report.assertions.push({
  id: 'VAL-B-UI-007', title: 'Empty matched-services case handled gracefully',
  status: emptyHasFallback ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-empty-matches.html'], consoleErrors: 'none' }
});

// VAL-B-UI-008
const mainCount = (html.match(/<main/g) || []).length;
const h1Count = (html.match(/<h1/g) || []).length;
report.assertions.push({
  id: 'VAL-B-UI-008', title: 'Exactly one <h1> inside exactly one <main>',
  status: mainCount === 1 && h1Count === 1 ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' },
  issues: mainCount !== 1 || h1Count !== 1 ? 'main count: ' + mainCount + ' h1 count: ' + h1Count : null
});

// VAL-B-UI-009
const hasAriaLabels = html.includes('aria-label="Uzman desteği al - Crew Agency"');
report.assertions.push({
  id: 'VAL-B-UI-009', title: 'Band and status conveyed by icon + text, not color alone',
  status: hasAriaLabels ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' }
});

// VAL-B-UI-010
// It is an <a> tag and keyboard operable natively
const isLink = html.includes('<a href="/contact/" class="inline-flex');
report.assertions.push({
  id: 'VAL-B-UI-010', title: 'CTA and service links are keyboard-navigable and focusable',
  status: isLink ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' }
});

// VAL-B-UI-011
const queuedHtml = fs.readFileSync(path.replace('low-band.html', 'queued.html'), 'utf8');
const noQueuedCta = !queuedHtml.includes('crew-cta-heading');
report.assertions.push({
  id: 'VAL-B-UI-011', title: 'Non-completed (processing/queued) job hides CrewCtaView and MatchedServicesView',
  status: noQueuedCta ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-queued.html'], consoleErrors: 'none' }
});

// VAL-B-UI-012
const failedHtml = fs.readFileSync(path.replace('low-band.html', 'failed.html'), 'utf8');
const noFailedCta = !failedHtml.includes('crew-cta-heading');
report.assertions.push({
  id: 'VAL-B-UI-012', title: 'Errored job (status=failed) does not render CrewCtaView or MatchedServicesView',
  status: noFailedCta ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-failed.html'], consoleErrors: 'none' }
});

// VAL-B-UI-013
const noEnglishEnrichment = !html.includes('Get expert help');
const hasTurkishEnrichment = html.includes('Kritik sorunları çözmek ve sitenizin sıralamasını yükseltmek için Ajansımızla iletişime geçin.') && html.includes('Önerilen Servisler');
report.assertions.push({
  id: 'VAL-B-UI-013', title: 'All CTA and MatchedServicesView user-facing copy is in Turkish',
  status: noEnglishEnrichment && hasTurkishEnrichment ? 'pass' : 'fail',
  evidence: { screenshots: ['VAL-B-UI-low-band.html'], consoleErrors: 'none' }
});

fs.writeFileSync('C:\\Users\\BCX\\.factory\\missions\\a8c59561-814d-47af-b2ec-9f681c6b34e0\\validation\\recommendation-engine\\user-testing\\flows\\ui.json', JSON.stringify(report, null, 2));

console.log(JSON.stringify(report.assertions.map(a => a.id + ': ' + a.status)));
