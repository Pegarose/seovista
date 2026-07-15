# SeoVista Frontend Design and Implementation Prompt

Copy the complete prompt below into Lovable, Bolt, or another frontend-generation agent.

---

## Role

You are implementing the frontend experience for **SeoVista**, an editorial intelligence lab focused on Generative Engine Optimization (GEO), traditional SEO, digital authority, and search visibility.

Build the frontend inside the existing project context. Do not replace the existing application architecture, do not create an unrelated SaaS product, and do not create a new backend.

Before changing anything, inspect the existing repository structure, routes, components, styles, content models, metadata helpers, and backend contracts. Reuse existing code and design tokens wherever possible.

## Product stage

SeoVista is currently in **Sprint 0 foundation stage**.

This is an editorial and educational website foundation, not yet:

- A live audit platform
- A dashboard
- A ranking tracker
- An AI citation monitoring platform
- A customer portal
- A live analytics product
- A live CMS integration
- A functioning GEO audit engine

The UI and copy must be truthful about this stage.

Never fabricate:

- Customers
- Testimonials
- Reviews
- Case studies
- Rankings
- Citations
- Audit results
- Scores
- Metrics
- Benchmarks
- Research findings
- Traffic numbers
- Conversion numbers
- Provider capabilities
- Live integrations

Never promise rankings, AI citations, inclusion in generative systems, or a specific visibility outcome.

## Existing technology and implementation rules

Preserve and use the existing stack where present:

- Next.js App Router
- React
- TypeScript with strict mode
- Tailwind CSS
- Server Components by default
- Client Components only when real browser interaction is required
- Existing SeoVista components and shared packages
- Existing `@seovista/content-models` package
- Existing `@seovista/seo-core` package
- Existing `@seovista/schema` package

Do not migrate to another framework.

Do not replace the working backend with Supabase, Firebase, a new CMS, a new database, or another hosted backend.

Do not add unrelated dependencies. Use packages already installed in the repository unless a dependency is strictly necessary and compatible with the existing package policy.

Do not create or modify README files or unrelated documentation files.

## Environment and deployment neutrality

The generated frontend must work in the hosting environment where it is deployed. Do not hardcode:

- `localhost`
- Any local development hostname
- Any fixed development port
- Docker service URLs
- PostgreSQL URLs
- Redis URLs
- Private network addresses
- Machine-specific paths
- Local-only credentials

The frontend must not assume that a local backend is reachable from Lovable, Bolt, or a hosted browser preview.

Use a single configurable backend integration boundary. The backend base URL must be supplied by the deployment environment or by the existing server-side application configuration. Do not invent a URL or a new endpoint.

If the backend URL is not configured or cannot be reached, show a truthful unavailable or foundation state. Do not replace missing content with fabricated production data.

## Backend integration boundary

The existing backend contract is a deterministic NextG mock/provider boundary. It is not a live CMS and it is not a live audit provider.

Keep all backend access behind a typed adapter or repository layer. Use the existing server-side adapter if the project already has one. If the generated frontend is a separate hosted project, leave the adapter boundary configurable for the real backend URL to be supplied later.

Do not expose server-only variables, tokens, preview authorization, or provider credentials in browser code.

When the existing backend is available, public collection reads use this contract shape:

```text
GET {configured-backend-base}/api/{collection}?mode=public&locale=en
```

The `{configured-backend-base}` value must come from the hosting or application environment. Never hardcode a local URL or port.

The response shape is:

```ts
interface RawCollectionResponse {
  collection: string;
  mode: "public" | "preview";
  locale: string;
  items: readonly RawEntity[];
  generatedAt: string;
  total: number;
}

interface RawEntity {
  id: string;
  collection: string;
  provenance: {
    createdAt: string;
    updatedAt: string;
    status: "published" | "draft" | "preview" | "private";
    locale: string;
    version: number;
  };
  [key: string]: unknown;
}
```

Error responses use:

```ts
interface RawErrorResponse {
  error: string;
  code: string;
  collection?: string;
}
```

Known error codes include:

```text
INVALID_MODE
UNSUPPORTED_LOCALE
UNKNOWN_COLLECTION
DEFERRED_COLLECTION
NOT_FOUND
```

Validate external responses with existing types, type guards, or Zod. Do not blindly trust arbitrary JSON.

Always request public English content from the frontend boundary:

```text
mode=public
locale=en
```

Never request preview content from browser code.

Never send or accept preview authorization in:

- Query parameters
- Browser local storage
- Browser session storage
- Client cookies
- Client state
- A public form
- A client-side header

Preview access is server-only and must fail closed.

Never request the private `auditLeads` collection from the frontend.

The deferred `caseStudies` collection must not be represented with invented data.

## Supported public content collections

The existing content model includes:

```text
pages
services
tools
articles
authors
organizations
researchReports
definitions
faqs
sources
redirects
locales
```

Use only content that is returned by the public backend contract or trusted existing content projections.

Do not expose draft, preview, or private content.

Do not place untrusted raw backend objects directly into HTML. Map content into typed view models first.

## Existing public routes to preserve

Preserve these public routes and their existing trailing-slash behavior:

```text
/
/geo/
/seo/
/digital-authority/
/tools/
/tools/geo-readiness-checker/
/about/
/contact/
/insights/
/privacy/
/cookies/
/terms/
```

Do not remove, rename, or silently redirect these routes to a new product structure.

Preserve these system routes and their existing behavior:

```text
/api/health/
/robots.txt
/sitemap.xml
/feed.xml
/llms.txt
```

Do not replace existing system routes with frontend-only mock implementations.

## Information architecture and page design

### Home page: `/`

Design a polished editorial-intelligence landing page with:

1. A clear hero section
   - Position SeoVista around GEO and search visibility intelligence.
   - Use a precise, credible headline.
   - Explain that visibility is earned through clarity, technical health, credible sources, and authority.
   - Use one primary CTA to learn about GEO or contact SeoVista.
   - Use one secondary CTA to explore the foundation tool.

2. A short explanation of the problem
   - Brands need to be understandable to both traditional search systems and generative answer systems.
   - Avoid fear-based claims and unsupported market statistics.

3. Three focus areas
   - Generative Engine Optimization
   - Search Engine Optimization
   - Digital Authority

4. A methodology section
   - Clear information architecture
   - Useful and attributable content
   - Technical crawlability and indexation
   - Credible sourcing
   - Consistent topical expertise

5. A truthful tool callout
   - Link to `/tools/geo-readiness-checker/`.
   - Clearly label it as a foundation-stage, non-operational tool.

6. An Insights callout
   - Link to `/insights/`.
   - Render only genuine available content.

7. A contact CTA
   - Use the existing contact route and existing approved contact content.

Do not include fake logos, fake partner marks, fake customer grids, fake dashboard screenshots, fake results, or fake performance counters.

### GEO page: `/geo/`

Explain:

- What Generative Engine Optimization means.
- How GEO differs from traditional SEO.
- Why clear structure and evidence matter.
- Why source quality and topical authority matter.
- That no ethical provider can guarantee rankings, citations, or inclusion in an AI system.

Use educational diagrams or simple editorial cards only if they communicate real concepts. Do not show fabricated measurement data.

### SEO page: `/seo/`

Explain:

- Technical crawlability
- Indexation
- Metadata
- Content structure
- Internal linking
- Site architecture
- Sustainable organic visibility

Do not promise specific ranking improvements or timeframes.

### Digital Authority page: `/digital-authority/`

Explain:

- Earned authority
- Attributable expertise
- Editorial reputation
- Credible references
- Consistent topical contribution
- Why fabricated mentions and link schemes are unacceptable

Do not show fake publications, backlinks, logos, awards, or media coverage.

### Tools page: `/tools/`

Present the tool library as a foundation-stage product area.

Only link to the existing GEO Readiness Checker foundation page. Do not suggest that additional tools are already operational.

### GEO Readiness Checker: `/tools/geo-readiness-checker/`

This page must remain visibly non-operational in Sprint 0.

State clearly:

- This is a foundation page for a future tool.
- There is currently no submission flow.
- There is no live audit.
- There is no score.
- There is no generated report.
- No live provider is connected yet.

Do not add:

- A functioning URL submission form
- A fake Analyze button
- A fake progress indicator
- A fake score
- Fake recommendations
- Fake audit findings
- Fake report data
- A fake success state

A disabled informational preview is allowed only when it is unmistakably non-operational and does not collect or send user data.

### Insights page: `/insights/`

Use only genuine published articles or research records from the public content boundary.

If there is no published content, show a truthful editorial foundation state explaining that Insights will be populated when genuine research is ready.

Do not invent:

- Article titles
- Authors
- Citations
- Publication dates
- Research outcomes
- Statistics
- Reports

### About page: `/about/`

Use the existing SeoVista and GMedya Group positioning.

Do not invent:

- Team members
- Offices
- Awards
- Clients
- Partnerships
- Company size
- Revenue
- Performance metrics

### Contact page: `/contact/`

Keep the contact experience simple and truthful.

Use the existing approved contact information and route behavior. An email link is acceptable if it already exists in the trusted content.

Do not create a data-collecting form unless an existing backend contract explicitly supports form submission, storage, validation, rate limiting, and privacy handling.

Do not pretend that a message was delivered if there is no real submission backend.

### Legal pages

Preserve:

```text
/privacy/
/cookies/
/terms/
```

Do not add trackers, cookies, analytics behavior, or consent flows that are not already supported by the project.

## Visual design direction

The visual identity should feel like an editorial intelligence lab, not a generic AI startup or SaaS dashboard.

Use the existing SeoVista design language and tokens where available:

- Paper-like light background
- Mineral or muted secondary surfaces
- Ink-colored typography
- Muted supporting text
- Signal green for primary action accents
- Spectral blue for focus states and supporting accents
- Fine borders
- Restrained shadows
- Strong typographic hierarchy
- Generous whitespace
- Clear editorial rhythm
- Precise, calm, research-oriented presentation

Use:

- Large but controlled headlines
- Narrow readable text columns
- Editorial cards
- Methodology panels
- Subtle section dividers
- Responsive navigation
- Accessible buttons and links
- Consistent spacing
- Thoughtful empty and unavailable states

Avoid:

- Generic purple-gradient AI branding
- Neon cyberpunk styling
- Excessive glassmorphism
- Dense admin dashboard layouts
- Fake live charts
- Fake real-time monitors
- Fake progress meters
- Excessive rounded cards
- Decorative animation that harms readability
- Visual noise
- Stock imagery that implies unsupported claims

If imagery is needed, prefer abstract editorial geometry, diagrams, typography, or neutral visual systems that do not imply real customers or results.

## Shared components

Create or reuse a consistent component system for:

- Site header
- Desktop navigation
- Mobile navigation
- Footer
- Skip-to-content link
- Container and section layout
- Hero section
- Primary and secondary CTA
- Editorial card
- Methodology step
- Content collection list
- Empty state
- Unavailable state
- Status badge
- Breadcrumbs where appropriate
- FAQ block where real FAQ content exists

Do not duplicate the same navigation, metadata, card, or status logic across pages.

Use semantic HTML rather than generic clickable containers.

## Accessibility requirements

Every public page must have:

- Exactly one descriptive `h1`
- Exactly one `main` landmark
- A logical heading hierarchy
- A skip-to-content link
- Keyboard-operable navigation
- Visible focus styles
- Accessible mobile navigation
- Meaningful link text
- Correct button and link semantics
- Sufficient color contrast
- Responsive behavior on mobile, tablet, and desktop
- No information conveyed by color alone

Do not use clickable `div` or `span` elements in place of buttons or links.

Do not hide important content from keyboard users or screen readers.

Use loading, empty, error, and unavailable states that are understandable without relying only on animation.

## SEO and structured data requirements

Reuse the existing metadata and canonical helpers.

Every public page must have:

- A unique title
- A unique description
- A canonical URL
- Open Graph metadata
- Twitter metadata where supported
- Correct robots directives
- Correct trailing-slash behavior

Canonical URLs must be generated from the trusted configured site URL only. Never construct canonicals from request headers, browser hostnames, user input, or an untrusted origin.

Use JSON-LD only for real, visible, eligible content. Reuse the existing schema builders.

Do not emit schema for content that is:

- Draft
- Preview
- Private
- Untrusted
- Not visible on the page
- Not supported by the content model

Never fabricate:

- Ratings
- Reviews
- Aggregate scores
- Customer counts
- Organization awards
- Product availability
- Research metrics

Never represent `llms.txt` as a ranking factor or promise inclusion in AI models.

Do not include draft, preview, or private content in:

- HTML
- Metadata
- JSON-LD
- Sitemap
- Feed
- `llms.txt`

## Security and privacy requirements

- Never expose server-only environment variables.
- Never expose backend tokens or preview authorization.
- Never add credentials or secrets to tracked files.
- Never store secrets in browser storage.
- Never add a live provider integration without an explicit contract.
- Never add a real audit crawler without an explicit backend security boundary.
- Never send user-controlled URLs to private, metadata, loopback, or internal network addresses.
- Never create a fake success response for an unavailable backend.
- Never silently collect personal data.

## Error and unavailable-state behavior

Implement truthful UI states for:

- Backend unavailable
- Empty public collection
- Unknown collection
- Deferred collection
- Invalid response
- Network failure
- Unsupported locale

Use restrained copy such as:

- "This content is not available yet."
- "The editorial collection is currently being prepared."
- "This capability is not operational in the foundation release."
- "Please check back when the service is connected."

Do not expose stack traces, secret values, internal URLs, raw provider errors, or server diagnostics to visitors.

## Implementation sequence

Follow this order:

1. Inspect the existing project structure and current web shell.
2. Identify reusable components, routes, content models, metadata helpers, and schema helpers.
3. Preserve existing routes and existing backend boundaries.
4. Establish or reuse the typed content adapter.
5. Establish or reuse shared layout and visual tokens.
6. Implement the shared header, navigation, footer, and accessibility shell.
7. Implement the home page and the three main topic pages.
8. Implement the tools and non-operational checker pages.
9. Implement the Insights, About, Contact, and legal pages.
10. Integrate only public backend content through the typed adapter.
11. Add truthful loading, empty, unavailable, and error states.
12. Verify metadata, canonical URLs, JSON-LD, accessibility, and responsive behavior.
13. Run the existing project lint, typecheck, tests, and build commands.

Do not stop after creating a visual mockup. The routes, semantics, accessibility behavior, content boundary, and SEO behavior must be implemented as part of the frontend.

## Acceptance criteria

The implementation is complete only when:

- All existing public routes render without breaking the current application.
- The site has a coherent SeoVista editorial-intelligence visual system.
- The frontend does not contain hardcoded local hostnames or fixed development ports.
- Backend access is isolated behind a typed configurable adapter.
- The frontend does not invent API endpoints or backend behavior.
- Server-only credentials and preview authorization never reach browser code.
- Only public content is rendered.
- Draft, preview, private, and deferred content are not exposed.
- The GEO Readiness Checker remains explicitly non-operational.
- No fake scores, audits, reports, metrics, testimonials, customers, rankings, citations, or research claims exist.
- Every page has exactly one `h1` and one `main` landmark.
- Canonical URLs use the trusted configured site URL.
- Metadata and JSON-LD match visible page content.
- Existing robots, sitemap, feed, health, and `llms.txt` routes continue to work.
- Loading, empty, unavailable, and error states are truthful and accessible.
- TypeScript, lint, tests, and build checks pass using the existing project commands.

## Final response format

After implementation, report:

1. Files changed.
2. Routes implemented or updated.
3. Backend adapter and contract used.
4. Security and environment-boundary checks completed.
5. Accessibility and SEO checks completed.
6. Commands run and their results.
7. Any blocked integration that requires a real backend URL or backend contract.

Do not claim that a backend integration is live unless it was actually connected and verified.
