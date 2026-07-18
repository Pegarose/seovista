# SeoVista CMS-First Content, Admin, and Public Delivery Design

**Status:** Design approved in conversation, pending written-spec review  
**Date:** 2026-07-18  
**Scope:** First CMS vertical slice: core collections, authenticated admin operations, publication lifecycle, secure preview, and dynamic public delivery

## 1. Purpose and scope

SeoVista currently has domain content contracts, public projection rules, an authenticated read-only admin shell, and deterministic NextG fixtures, but it does not yet have a persistent CMS or a dynamic content source for the public website. This design adds the smallest production-shaped CMS boundary needed to replace the hardcoded public source without coupling SeoVista to Payload or to the separate `C:\bc-proje\nextg` repository.

The first vertical slice includes:

- SeoVista-native PostgreSQL persistence for content entries and immutable revisions.
- The core collection set:
  - Pages
  - Articles
  - Authors
  - Sources
  - Redirects
  - Locales
- Authenticated admin list, create, edit, preview, publish, unpublish/private, archive, and permitted delete operations.
- Three editorial roles: Editor, Publisher, and Admin.
- A typed block editor backed by Zod schemas and TypeScript discriminated unions.
- A server-only public content source for RSC pages and all public projections.
- A short-lived, hashed preview-token flow with a secure preview cookie.
- Cache invalidation and publication event boundaries that keep public HTML, metadata, JSON-LD, sitemap, feed, and `llms.txt` consistent.
- Tests for lifecycle, authorization, preview isolation, projection leakage, and public route behavior.

This is a design for one SeoVista organization. The existing organization and membership tables remain the scope authority, but the first UI has no organization switcher or multi-tenant workflow.

## 2. Non-goals

The following are deliberately outside this slice:

- Running, modifying, or copying the separate `C:\bc-proje\nextg` repository.
- Installing Payload, using Payload Local API, importing Payload migrations, or copying NextG-generated types.
- A general-purpose arbitrary HTML or Markdown editor.
- Media processing, object-storage integration, or a media library beyond typed references that can be added through a later bounded slice.
- The non-core collection UI for services, tools, organizations, research reports, definitions, and FAQs. Their domain contracts remain available for future slices and must not be weakened.
- GEO Readiness Checker requests, crawling, scoring, report delivery, email consent, or audit-result UI.
- Organization creation, tenant switching, billing, public user accounts, or external identity providers.
- Direct browser access to PostgreSQL.

## 3. Source-of-truth and repository boundaries

SeoVista's source-of-truth hierarchy remains unchanged:

1. The SeoVista PRD defines product behavior, public routes, brand, and acceptance criteria.
2. The SeoVista Implementation Brief defines engineering sequence and non-functional constraints.
3. `AGENTS.md`, existing contracts, and tests implement those requirements but do not override them.

The following boundaries are mandatory:

- `packages/content-models` remains the authority for domain types, collection contracts, raw-to-domain mapping, publication eligibility, canonical/indexation policy, and relationship validation.
- `apps/worker` remains the authority for the SeoVista-native PostgreSQL client, migration runner, repositories, and shared persistence primitives.
- `apps/web` owns delivery orchestration, server-only content queries, admin route composition, server actions, and public route rendering.
- Public RSC pages and projection routes do not issue ad hoc SQL. They depend on a server-only application query/source interface.
- `C:\bc-proje\nextg` is read-only reference material. Its UI, DTO, caching, and authorization ideas may inform implementation, but its Payload collections, local API calls, migrations, generated types, media assumptions, and lifecycle semantics are not copied.
- No CMS raw row may bypass `packages/content-models` before it reaches a public projection or a typed editor boundary.

## 4. Architecture and module boundaries

### 4.1 Persistence layer

A new SeoVista-native migration set extends the existing numeric migration convention. The CMS persistence layer owns:

- Content entry identity and collection/locale scope.
- Append-only revisions.
- Current and published revision pointers.
- Publication state and archive metadata.
- Preview grants with hashed tokens.
- Publication events and durable revalidation work.

Repositories accept typed command/query inputs and return typed results. They do not contain UI concerns, Next.js request objects, cookies, or HTML rendering.

### 4.2 Application/content service layer

A content application service is the only mutation boundary for CMS operations. It coordinates:

1. Authentication and organization scope.
2. Capability authorization.
3. Input validation and collection-specific schema validation.
4. Optimistic concurrency checks.
5. Transactional repository calls.
6. Audit/publication event creation.
7. Post-commit cache invalidation or durable revalidation scheduling.

Representative commands are:

- `createEntry`
- `saveRevision`
- `requestPreview`
- `publishEntry`
- `unpublishEntry`
- `setPrivate`
- `archiveEntry`
- `restoreEntry`
- `deleteUnpublishedDraft`

The service must not expose a generic “write arbitrary JSON” command. Each collection resolves to a known schema and command policy.

### 4.3 Admin delivery layer

The admin app uses Server Components by default. Server actions or route handlers call the application service and return safe success/error results. They do not pass database clients into components and do not serialize secrets, password hashes, raw preview tokens, or unrestricted raw JSON to the browser.

The first route shape is:

- `/admin/content`
- `/admin/content/new`
- `/admin/content/[entryId]/edit`
- `/admin/content/[entryId]/preview`
- `/admin/content/[entryId]/history`
- Existing `/admin` overview remains available.

All admin pages are private, have one descriptive `h1` in one `main`, are excluded from public navigation and public projections, and use the existing server-only session boundary.

### 4.4 Public content source

A server-only `ContentSource`/query adapter is introduced between web routes and persistence. It exposes separate read modes rather than a boolean “include drafts” switch:

- `public`: only validated published snapshots.
- `preview`: only when a valid preview context is present and authorized.
- `admin`: authenticated editorial reads, including revision history and unpublished content.

The public source resolves a database row into the existing `content-models` domain entity through the mapper and adapter contracts. It never returns a draft as a public fallback. If a record is malformed, unauthorized, archived, or lacks a valid published revision, it is excluded or the route fails closed according to the query contract.

## 5. Core collection model

The CMS first slice registers exactly six collections in its admin inventory. The collection matrix remains the canonical field and relationship contract.

### Pages

Required identity and editorial fields follow the existing page contract: `id`, `collection`, `slug`, `locale`, `title`, `description`, `provenance`, and `indexation`. Optional fields include canonical settings, body blocks, publication dates, author/reviewer references, sources, and related entities where permitted by the matrix.

### Articles

Articles require title, description, one author relationship, provenance, and indexation. They may include body blocks, reviewer, sources, category, and publication metadata. The author relationship must resolve to a valid author in the same organization and supported locale policy.

### Authors

Authors include name, social profiles, provenance, and indexation, with optional bio and photo reference. Email and other lead/contact fields are prohibited from this public collection contract.

### Sources

Sources include title, provenance, and indexation, with optional URL, author, publisher, and publication date. Source URLs are content data and must be validated as URLs at the schema boundary; they are not automatically fetched by the CMS.

### Redirects

Redirects use the matrix's special fields: source, destination, permanent flag, and status code. They do not have a public slug, locale, indexation, or body. Only a published redirect can affect public routing. Destination validation must reject unsafe or malformed destinations according to the existing trusted-canonical and URL policy.

### Locales

Locales include code, name, default flag, supported flag, and provenance. They do not use a content slug, nested locale, indexation, or body. Locale changes are publication-controlled because unsupported or default-locale changes affect public URL generation and projection selection.

The six collections use the same entry/revision/authorization infrastructure, but their field schemas and state transition policies remain collection-specific. A future collection must be registered through the collection matrix and its own typed schema; adding a database row alone is not sufficient.

## 6. Data model

The following names are normative. Exact SQL types and indexes are implementation details, but the invariants are not.

### 6.1 `content_entries`

One row represents the stable identity of a logical item.

Required concepts:

- `id`: stable UUID.
- `organization_id`: FK to the existing SeoVista organization; the first UI always resolves this single organization from the authenticated membership.
- `collection`: known collection identity.
- `slug`: nullable for Redirects and Locales; required where the collection matrix requires it.
- `locale`: nullable for Redirects and Locales; required for localized content collections.
- `current_revision_id`: latest editable revision, nullable only during a tightly controlled initial insert.
- `published_revision_id`: revision currently exposed by public reads, nullable until first publish.
- `publication_status`: `draft | preview | published | private`.
- `archived_at`, `archived_by`: nullable archive metadata.
- `created_by`, `updated_by`, timestamps.
- An optimistic-concurrency version or equivalent monotonic update marker.

The database enforces collection-aware uniqueness for active entries. At minimum, localized content cannot have two active entries with the same collection, locale, and slug, while redirect sources and locale codes have their own uniqueness rules.

`archived_at` is authoritative over publication status. An archived entry is never returned by public, preview, or normal admin list queries unless an explicit history/admin filter is used.

### 6.2 `content_revisions`

Revisions are append-only snapshots of validated typed content.

Required concepts:

- `id`: immutable UUID.
- `entry_id`: parent entry.
- `revision_number`: monotonically increasing per entry.
- `schema_version`: identifies the collection schema version used for validation.
- `content`: JSONB matching the collection's Zod schema.
- `content_checksum`: deterministic checksum for comparison and audit diagnostics.
- `created_by`, `created_at`.

A save never overwrites an existing revision. A revision is inserted only after the full collection payload, relationships, canonical fields, and block tree pass validation. Failed validation creates no revision.

### 6.3 Current versus published revision

`current_revision_id` is the editable working snapshot. `published_revision_id` is the immutable snapshot used by public delivery. They may differ.

This distinction is normative:

- Creating or editing content advances `current_revision_id` only.
- Publishing atomically moves `published_revision_id` to a validated current revision.
- Editing an already published entry does not expose the new current revision publicly. The prior published revision remains public until a Publisher or Admin publishes the new revision.
- A published entry with pending edits remains publicly backed by `published_revision_id`; the admin UI displays that it has unpublished changes.
- Draft and preview content can be rendered only through an authorized admin/preview read mode.

### 6.4 State and archive invariants

`publication_status` describes the public release policy, not whether a newer working revision exists:

- `draft`: never publicly released; no public revision is required.
- `preview`: intentionally available for authorized preview reads only; never public.
- `published`: `published_revision_id` must be present and valid. Public reads use that revision even if a newer current revision exists.
- `private`: not public; a previously published pointer may be retained for history but must not be read publicly.

Archive is a separate lifecycle flag and overrides all four statuses.

Allowed high-level transitions:

- New entry → `draft`.
- Draft/working edit → new current revision without public exposure.
- Authorized preview → preview read context; changing the persisted status to `preview` is allowed only through an explicit Publisher/Admin action, not as a side effect of opening a preview link.
- Publisher/Admin publish → `published` with a valid published revision.
- Publisher/Admin unpublish or set private → `private` with no public eligibility.
- Publisher/Admin archive → archived, regardless of prior state.
- Admin restore → unarchived with an explicit non-public status unless a new publish action is performed.

Hard delete is allowed only when all of the following are true:

- The entry has never been published.
- `published_revision_id` is null.
- The entry is not referenced by a published relationship, redirect, or other protected record.
- The caller has the draft-delete capability.

Published entries and entries with any publication history are archived rather than hard-deleted. Revision history for those entries remains append-only and auditable.

### 6.5 Preview grants

`preview_grants` binds a short-lived capability to one entry and one revision. It stores:

- Grant ID.
- SHA-256 token hash, never the raw token.
- Entry and revision IDs.
- Issuing admin identity.
- Created, expiry, revoked, and exchanged timestamps as applicable.
- A bounded reason or source label only if needed for audit.

The raw token is returned once to the authorized caller, is never written to logs or audit metadata, and is not included in analytics payloads.

### 6.6 Publication events and durable revalidation

Publication mutations create an append-only content publication event in the same transaction as the state/pointer update. The event records entry, revision, actor, action, previous status, resulting status, and bounded metadata without secrets or full content bodies.

The transaction also records durable revalidation work for affected entry, collection, and locale scopes. The web process may attempt immediate post-commit invalidation, but a failure must be retryable from the durable event/outbox boundary. A rollback produces neither a publication event nor public invalidation.

## 7. Typed block editor and validation

The editor accepts a discriminated union of known block types, not arbitrary HTML or Markdown. Each block has a stable `type` discriminator and a Zod schema shared by server validation, form normalization, and rendering.

The initial block vocabulary is intentionally limited to:

- `heading`: constrained heading level and text.
- `paragraph`: plain text with normalized whitespace.
- `richText`: a bounded inline/node representation with an allowlist of marks and links; no raw HTML injection.
- `answer`: prompt, answer text, and optional source references for GEO-oriented editorial answers.
- `faq`: question and answer fields with schema-controlled rendering.
- `cta`: label, trusted internal path or explicitly validated external URL, and accessible name.
- `sourceList`: references to published/eligible Source entries.
- `table`: column definitions and bounded rows with text-only cell values.

A block may not introduce arbitrary attributes, scripts, event handlers, style tags, iframe embeds, or unvalidated URLs. Block count, text length, nesting depth, table dimensions, and relationship counts are bounded at validation time.

Collection-level validation runs after block validation and verifies:

- Required fields from `collection-matrix.ts`.
- Prohibited fields are rejected rather than silently discarded.
- Relationship cardinality and target collection/kind are correct.
- Referenced entries belong to the same organization and are allowed by publication policy.
- Canonical paths use trusted site configuration and do not conflict with redirects or other active entries.
- Locale values are supported and collection-specific locale requirements are met.
- Articles have exactly one valid author.

Rendering is done from typed domain data. No renderer accepts raw editor HTML as a trusted input.

## 8. Roles and capabilities

The existing RBAC tables remain the persistence mechanism. The CMS adds granular permission identities and seeds them into the three roles.

### Editor

- Read content and revision history permitted by organization scope.
- Create entries in the core collections.
- Save and update unpublished/current revisions.
- Request and view authorized previews.
- Cannot publish, unpublish, set private, archive, restore, hard-delete, or manage users/roles.

### Publisher

Includes Editor capabilities plus:

- Publish a validated current revision.
- Unpublish or set an entry private.
- Archive and restore content.
- Manage redirects and locales through the same publication controls.

### Admin

Includes all content capabilities plus:

- Manage admin users, memberships, role assignments, and role permissions through the existing organization scope.
- Override normal content operations where policy permits.
- Hard-delete only never-published drafts under the explicit draft-delete capability.

Capability checks occur after authentication and organization scope resolution, before loading or mutating protected content. A UI hiding a button is not an authorization control. Every server action, route handler, repository command, and preview exchange repeats the relevant server-side check.

Suggested permission identities are stable strings such as:

- `content:read`
- `content:create`
- `content:revision:update`
- `content:preview`
- `content:publish`
- `content:unpublish`
- `content:private`
- `content:archive`
- `content:restore`
- `content:delete:unpublished`
- `admin:users:manage`
- `admin:roles:manage`

## 9. Admin workflows

### Create and edit

The form selects a known collection and renders the corresponding typed field/block editor. The server revalidates all submitted values and includes the expected entry version in the mutation. A stale version returns a conflict result rather than silently overwriting another editor's work.

Saving creates a new revision and updates `current_revision_id`. It does not update `published_revision_id` or public caches.

### Preview

An authorized user requests a grant for a specific revision. The UI receives a short-lived preview URL or equivalent exchange target. The preview flow is described in Section 11. Opening a preview never mutates public state.

### Publish

The Publisher/Admin confirms the exact current revision to publish. The application service verifies that the revision is valid, relationships are resolvable, the entry is not archived, and the caller has the capability. The pointer/status update, publication event, audit event, and durable revalidation record are committed together.

### Unpublish, private, archive, restore

Unpublish/private removes public eligibility without deleting history. Archive hides the record from normal admin and all public/preview reads. Restore returns the entry to an explicit non-public status and requires a later publish operation to become public again.

### Delete

The UI exposes hard delete only for entries satisfying the never-published draft policy. The server repeats that policy and rejects all other deletes.

## 10. Public delivery and projection consistency

All public representations derive from the same public eligibility policy and a consistent public snapshot. The dynamic source replaces the current hardcoded `apps/web/src/content/site.ts` source behind an adapter rather than changing each route independently.

The public snapshot must:

- Select only non-archived entries with `publication_status = published`.
- Read only `published_revision_id`, never `current_revision_id` for public content.
- Require valid mapped domain content and supported locale.
- Enforce trusted canonical resolution using `NEXT_PUBLIC_SITE_URL`.
- Reject invalid or missing required relationships.
- Exclude private lead data and any prohibited collection fields.

The same snapshot boundary feeds:

- Public HTML/RSC page content.
- Page metadata and canonical tags.
- JSON-LD/schema output.
- Sitemap URLs and last-modified values.
- Feed entries.
- `llms.txt` resources.

Draft, preview, private, archived, malformed, unsupported-locale, and unauthorized records must not appear in any of those outputs. The sitemap, feed, and `llms.txt` must never use a broader query than the HTML route. JSON-LD must be generated from the same eligible domain entity rather than from raw database content.

If a public query encounters a malformed record or relationship, it fails closed for that record. It must not fall back to the current draft or emit partially trusted metadata. Database or configuration failures return a safe server error or an already validated public snapshot according to the implementation's explicit cache policy, never raw unvalidated content.

Redirect handling is also publication-controlled. Unpublished or archived redirects have no public routing effect.

## 11. Secure preview design

Preview is an authenticated editorial capability, not a public content mode.

### Grant and exchange flow

1. Editor, Publisher, or Admin requests preview for a selected entry/revision.
2. The server verifies organization scope, capability, entry/revision ownership, archive state, and revision validity.
3. The server creates cryptographically random token material and stores only its SHA-256 hash in `preview_grants`.
4. The raw token is returned once in a short-lived exchange URL. Exchange responses are `Cache-Control: no-store` and use a strict referrer policy.
5. The exchange endpoint verifies the hash, expiry, revocation, entry, and revision. On success it sets a short-lived `HttpOnly`, `Secure` in production, `SameSite=Lax` preview cookie and redirects to the clean canonical content path.
6. The token is not retained in the browser URL after exchange. Invalid, expired, revoked, mismatched, or already-used grants fail closed.
7. The preview query source reads only the grant-bound revision and only while the cookie/grant remains valid.

The exact cookie name is an implementation detail, but it must be distinct from the admin session cookie, scoped to the needed site paths, and never exposed to client JavaScript. Preview cookies must not be shared with public cache keys.

### Preview response policy

Preview responses use:

- `Cache-Control: private, no-store`.
- `X-Robots-Tag: noindex, nofollow, noarchive`.
- No public CDN or Next.js public cache.
- No inclusion in sitemap, feed, `llms.txt`, or public JSON-LD.
- No raw token in logs, analytics, audit metadata, or error messages.

A normal public route without a valid preview context returns the published revision, or a safe not-found/private response when no public release exists. A preview URL or cookie cannot make a draft public.

## 12. Cache tags, invalidation, and publication events

Cache tags are centralized and derived from stable identifiers, not user input. The initial tag vocabulary is:

- `content:entry:<entryId>`
- `content:collection:<collection>`
- `content:locale:<locale>`
- `content:public-snapshot`

After a successful publish, unpublish/private, archive, restore, redirect, or locale mutation, the application schedules invalidation for the affected entry, collection, locale, and public snapshot. Invalidation occurs only after the transaction commits.

The revalidation boundary must be idempotent. Replaying an event must not corrupt content or expose a draft. If synchronous invalidation fails, durable revalidation work remains available for retry. Preview responses are never placed in these public tags.

## 13. Error handling and fail-closed behavior

Errors are classified into safe categories:

- `authentication_required`
- `forbidden`
- `not_found`
- `validation_failed`
- `relationship_invalid`
- `slug_conflict`
- `stale_revision`
- `invalid_transition`
- `preview_invalid`
- `storage_unavailable`
- `unexpected`

Admin responses may include field-level validation details, but not SQL, stack traces, password hashes, token material, or internal connection information. Public responses reveal only the minimum route result and do not disclose whether a private/draft record exists.

Transactions must be atomic for revision pointer changes, publication state, events, and durable revalidation records. Partial writes are not accepted. The service must use parameterized queries and bounded inputs throughout.

## 14. Migration, backfill, and fixture strategy

The CMS migrations are added after the existing migration set using the repository's numeric SQL runner. They must be forward-only and transactional where PostgreSQL permits.

The migration sequence will establish, in dependency order:

1. Content entry identity and collection constraints.
2. Revision storage and entry revision pointers.
3. Preview grants.
4. Publication/audit event and revalidation records.
5. Indexes for public lookup, locale/slug uniqueness, active/archive filtering, and grant expiry.
6. CMS permission identities and Editor/Publisher/Admin role mappings.

Existing admin organizations, memberships, users, sessions, and RBAC data are preserved. The first CMS organization is resolved from the existing SeoVista organization/membership scope; the CMS does not silently create tenant selectors.

The existing hardcoded site source is treated as an import input, not as a second runtime authority. Any backfill must:

- Map through the same collection schemas and provenance requirements.
- Preserve trusted canonical paths and supported locales.
- Create revisions rather than writing only current rows.
- Make publication status explicit.
- Never publish an unvalidated or fabricated record merely because it existed in a fixture.

Deterministic fixtures remain test-only unless an explicit reviewed import marks them as public content. No live credentials or provider data are introduced.

## 15. Testing matrix

### Domain and schema unit tests

- Each core collection accepts valid typed payloads.
- Required, optional, and prohibited fields follow the collection matrix.
- Invalid blocks, unsafe links, excessive nesting, oversized tables, and invalid relationships are rejected.
- Canonical, locale, indexation, and publication eligibility rules remain fail-closed.

### Persistence integration tests

- Migrations apply in order from a clean database.
- Revision inserts are append-only.
- Current and published pointers remain distinct during an edit.
- Publish changes the published pointer atomically.
- Unpublish/private/archive remove public eligibility without deleting history.
- Draft-only hard delete is accepted; published-history delete is rejected.
- Optimistic concurrency rejects stale saves.
- Publication event and revalidation records are rolled back with failed transactions.

### Authorization tests

- Editor can create/edit/preview but cannot publish, archive, or delete protected content.
- Publisher can publish, unpublish/private, archive, and restore.
- Admin can perform content operations and manage users/roles.
- A user outside the organization cannot read or mutate an entry.
- Server-side checks remain effective when UI controls are bypassed.

### Preview security tests

- Raw token is stored only as a hash.
- Token exchange sets the correct cookie and cleans the URL.
- Expired, revoked, mismatched, reused, or malformed grants fail closed.
- Preview is `private, no-store` and `noindex`.
- Preview content never appears in public HTML, metadata, JSON-LD, sitemap, feed, or `llms.txt`.
- Raw token is absent from logs, analytics, and audit metadata.
- Preview cookie is not reused as a public cache key.

### Public projection tests

- HTML, metadata, JSON-LD, sitemap, feed, and `llms.txt` use the same public eligibility boundary.
- A draft edit after publication does not change public output until publish.
- Unpublish, private, archive, unsupported locale, invalid canonical, and invalid relationship cases disappear from all public projections.
- Redirects affect public routing only after publication.
- Locale changes do not leak unsupported content into public routes.
- Public canonical URLs use the trusted configured site URL.

### Admin and browser tests

- Unauthenticated users cannot access admin content routes.
- Admin pages have one `h1` in one `main` and do not enter public navigation or metadata.
- Create/edit/preview/publish/archive flows work for the permitted role.
- Error states are accessible and do not expose sensitive diagnostics.
- Existing admin overview and session/logout behavior remain intact.

## 16. Security, privacy, and non-functional acceptance criteria

The implementation is acceptable only if all of the following hold:

- TypeScript strict mode is maintained across new modules.
- Server-only environment variables and database clients cannot enter client bundles.
- All database writes are parameterized and bounded.
- Password hashes and preview token material are never serialized to the browser or logs.
- Draft, preview, private, and archived records cannot enter any public artifact.
- Public canonical URLs are derived from trusted `NEXT_PUBLIC_SITE_URL` configuration.
- Preview responses cannot be publicly cached or indexed.
- Publication state and revision pointers are transactionally consistent.
- Public queries do not silently fall back from a missing published revision to a current draft.
- Role and organization checks happen server-side at every protected boundary.
- Public projection generation remains deterministic for the same validated snapshot and timestamp.
- Existing ports, mock-provider boundaries, and no-live-credential rules remain unchanged.
- Processes and containers started for validation are stopped before handoff.

## 17. Future extension boundaries

### Additional collections

Services, Tools, Organizations, Research Reports, Definitions, and FAQs can be added using the same entry/revision/service/source infrastructure. Each requires a collection matrix registration, typed schema, relationship policy, admin form, and projection tests. Case Studies remain deferred until explicitly added to the authoritative collection inventory.

### GEO Readiness Checker

The GEO audit is a separate vertical slice. It may reference a published content snapshot or public URL, but it does not run inside CMS publish transactions and does not gain permission to read drafts by default. Its SSRF-safe fetcher, BullMQ lifecycle, scoring version, result persistence, report/consent flow, and audit admin views remain separate application modules.

### Media and richer editing

Media storage, image transformations, richer collaborative editing, and external providers require separate designs. The typed block contract may gain new versioned block types without reopening the raw HTML/Markdown boundary.

## 18. Design decisions and explicit constraints

- SeoVista uses local, SeoVista-native PostgreSQL persistence.
- The separate NextG repository remains an unchanged, read-only donor/reference.
- The first CMS slice is limited to Pages, Articles, Authors, Sources, Redirects, and Locales.
- The organization model is single-organization in the first UI, while existing membership/RBAC scope remains enforced.
- Roles are Editor, Publisher, and Admin.
- Published content is archived rather than hard-deleted. Only never-published drafts may be hard-deleted, subject to relationship checks and capability authorization.
- The editor uses validated typed blocks, not arbitrary HTML or Markdown.
- Current editable revisions and published revisions are separate pointers.
- Preview uses hashed short-lived grants, secure cookie exchange, clean canonical URLs, `no-store`, and `noindex`.
- All public artifacts derive from one validated published snapshot boundary.

These decisions remove the previously open architectural choices. The next artifact, after written-spec review, is an implementation plan that decomposes this design into small testable tasks.
