--
-- PostgreSQL database dump
--

\restrict qAeUoDABCcgacglknQBkbwL6GLSULalq0jDJUokazRkInHKmBTRrDE7nZlbyeyp

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: validate_job_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_job_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM job_status_transitions
    WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Invalid job status transition from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'attempt_count cannot decrease from % to %', OLD.attempt_count, NEW.attempt_count;
  END IF;

  IF NEW.result_id IS NOT NULL AND NEW.status != 'completed' THEN
    RAISE EXCEPTION 'result_id can only be set for completed status';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'completed status requires completed_at';
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_organization_memberships (
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    membership_role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_organization_memberships_membership_role_check CHECK ((membership_role = ANY (ARRAY['owner'::text, 'member'::text])))
);


--
-- Name: admin_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_organizations_name_check CHECK ((length(name) > 0))
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_sessions_token_hash_check CHECK ((length(token_hash) = 64))
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_users_display_name_check CHECK ((length(display_name) > 0)),
    CONSTRAINT admin_users_email_check CHECK ((length(email) > 3)),
    CONSTRAINT admin_users_password_hash_check CHECK ((length(password_hash) > 0)),
    CONSTRAINT admin_users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: api_cost_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_cost_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    operation text NOT NULL,
    request_identity text NOT NULL,
    correlation_id text NOT NULL,
    currency text NOT NULL,
    amount numeric(18,6) NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_cost_ledger_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT api_cost_ledger_currency_check CHECK ((length(currency) > 0)),
    CONSTRAINT api_cost_ledger_operation_check CHECK ((length(operation) > 0)),
    CONSTRAINT api_cost_ledger_provider_check CHECK ((length(provider) > 0))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_identity text NOT NULL,
    action text NOT NULL,
    subject_identity text NOT NULL,
    outcome text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    correlation_id text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_action_check CHECK ((length(action) > 0)),
    CONSTRAINT audit_logs_actor_identity_check CHECK ((length(actor_identity) > 0)),
    CONSTRAINT audit_logs_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text, 'error'::text]))),
    CONSTRAINT audit_logs_subject_identity_check CHECK ((length(subject_identity) > 0))
);


--
-- Name: cms_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    collection_name text NOT NULL,
    slug text,
    locale text,
    current_revision_id uuid,
    published_revision_id uuid,
    publication_status text DEFAULT 'draft'::text NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT cms_entries_publication_status_check CHECK ((publication_status = ANY (ARRAY['draft'::text, 'preview'::text, 'published'::text, 'private'::text])))
);


--
-- Name: cms_preview_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_preview_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    entry_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    issued_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    exchanged_at timestamp with time zone
);


--
-- Name: cms_publication_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_publication_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cms_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    revision_number integer NOT NULL,
    schema_version text NOT NULL,
    content jsonb NOT NULL,
    content_checksum text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: geo_audit_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_audit_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain text NOT NULL,
    brand_name text NOT NULL,
    primary_market text NOT NULL,
    work_email text,
    marketing_consent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_identity text NOT NULL,
    target text,
    queue_name text NOT NULL,
    correlation_id text NOT NULL,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    terminal_class text,
    result_id uuid,
    owner text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    lead_id uuid,
    cache_key text,
    CONSTRAINT job_records_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT job_records_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'permanent'::text, 'timeout'::text]))),
    CONSTRAINT job_records_target_check CHECK (((target IS NULL) OR (length(target) > 0))),
    CONSTRAINT job_records_terminal_class_check CHECK ((terminal_class = ANY (ARRAY['retryable'::text, 'permanent'::text, 'timeout'::text, 'success'::text])))
);


--
-- Name: job_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    correlation_id text NOT NULL,
    job_identity text NOT NULL,
    result_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_status_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_status_transitions (
    from_status text NOT NULL,
    to_status text NOT NULL
);


--
-- Name: rbac_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_identity text NOT NULL,
    display_name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rbac_permissions_canonical_identity_check CHECK ((length(canonical_identity) > 0))
);


--
-- Name: rbac_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_identity text NOT NULL,
    display_name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rbac_roles_canonical_identity_check CHECK ((length(canonical_identity) > 0))
);


--
-- Name: rbac_subject_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_subject_roles (
    subject_identity text NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rbac_subject_roles_subject_identity_check CHECK ((length(subject_identity) > 0))
);


--
-- Name: seovista_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seovista_migrations (
    id integer NOT NULL,
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: admin_organization_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_organization_memberships (user_id, organization_id, membership_role, created_at) FROM stdin;
\.


--
-- Data for Name: admin_organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_organizations (id, name, created_at) FROM stdin;
\.


--
-- Data for Name: admin_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: admin_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_users (id, email, display_name, password_hash, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: api_cost_ledger; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_cost_ledger (id, provider, operation, request_identity, correlation_id, currency, amount, recorded_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, actor_identity, action, subject_identity, outcome, metadata, correlation_id, recorded_at) FROM stdin;
\.


--
-- Data for Name: cms_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cms_entries (id, organization_id, collection_name, slug, locale, current_revision_id, published_revision_id, publication_status, archived_at, archived_by, created_at, updated_at, version) FROM stdin;
\.


--
-- Data for Name: cms_preview_grants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cms_preview_grants (id, token_hash, entry_id, revision_id, issued_by, created_at, expires_at, revoked_at, exchanged_at) FROM stdin;
\.


--
-- Data for Name: cms_publication_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cms_publication_events (id, entry_id, revision_id, actor_id, action, previous_status, new_status, created_at) FROM stdin;
\.


--
-- Data for Name: cms_revisions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cms_revisions (id, entry_id, revision_number, schema_version, content, content_checksum, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: geo_audit_leads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.geo_audit_leads (id, domain, brand_name, primary_market, work_email, marketing_consent, created_at) FROM stdin;
01f363fe-db4f-49d9-b73c-e13a5ee24d46	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 03:54:31.494385+00
6d970b81-db7d-4ca8-993b-d974a01e6197	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 03:55:16.114855+00
2ce9ae7d-6cab-49f3-a8e6-65b7b1c50748	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 03:55:41.106071+00
8a6b7512-437b-4b1b-bb95-9a4ae8752d19	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 03:57:29.737409+00
81e3cd0f-effe-49f3-b080-32a097b33b05	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:02:08.883743+00
cd7f4671-a5e4-41eb-a843-45a34215ef5a	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.502739+00
bddc86cb-7f98-47f8-8fb0-c58a526c7540	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.501225+00
16e74650-0a41-40cd-b295-25799407c603	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.503949+00
78d7cd6e-9591-4e53-b4c6-5ac5378a2ad9	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.508969+00
79fe6c98-d34d-4d07-a8b1-4461b3b9e0d4	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.509262+00
c69da40f-f972-4aa1-b397-4c80545a9579	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.509122+00
3bc54f40-f3ce-43b3-8233-2b817f45b11e	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.509094+00
4c8b0b2f-0258-45ea-813e-a65fdbc33274	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.508985+00
5fa5482d-bc8a-4446-acf8-03d49a717a0c	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.510971+00
28db0853-bd10-4ad7-bfe7-bd1d058ba7b1	https://react.dev/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:07:18.510829+00
ffe840b9-8bb2-4ac0-9773-5f4c0e7473a1	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:10:02.333617+00
9860bf1c-6f8e-48ce-94db-d82e6dfb51b5	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:16:14.948034+00
a5a77ac6-a98b-4d06-9ee1-534c2da9b297	https://example.com/	ValidatorProbe	GLOBAL	\N	f	2026-07-24 04:18:01.626836+00
\.


--
-- Data for Name: job_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_records (id, job_identity, target, queue_name, correlation_id, status, attempt_count, terminal_class, result_id, owner, created_at, updated_at, completed_at, lead_id, cache_key) FROM stdin;
cccccccc-0000-0000-0000-000000000001	sub-low	https://example.com/low	geo_readiness_jobs	cor-low	completed	0	\N	11111111-1111-1111-1111-111111111111	\N	2026-07-24 20:35:22.368+00	2026-07-24 20:35:22.368+00	2026-07-24 20:35:22.368+00	\N	hash-low
cccccccc-0000-0000-0000-000000000002	sub-high	https://example.com/high	geo_readiness_jobs	cor-high	completed	0	\N	22222222-2222-2222-2222-222222222222	\N	2026-07-24 20:35:22.380081+00	2026-07-24 20:35:22.380081+00	2026-07-24 20:35:22.380081+00	\N	hash-high
cccccccc-0000-0000-0000-000000000003	sub-empty	https://example.com/empty	geo_readiness_jobs	cor-empty	completed	0	\N	33333333-3333-3333-3333-333333333333	\N	2026-07-24 20:35:22.382421+00	2026-07-24 20:35:22.382421+00	2026-07-24 20:35:22.382421+00	\N	hash-empty
cccccccc-0000-0000-0000-000000000004	sub-queued	https://example.com/queued	geo_readiness_jobs	cor-queued	queued	0	\N	\N	\N	2026-07-24 20:35:22.383572+00	2026-07-24 20:35:22.383572+00	\N	\N	hash-queued
cccccccc-0000-0000-0000-000000000005	sub-failed	https://example.com/failed	geo_readiness_jobs	cor-failed	failed	0	\N	\N	\N	2026-07-24 20:35:22.384707+00	2026-07-24 20:35:22.384707+00	\N	\N	hash-failed
\.


--
-- Data for Name: job_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_results (id, correlation_id, job_identity, result_type, payload, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	cor-low	sub-low	geo_readiness	{"scoreBand": "critical", "overallScore": 45, "matchedServices": [{"name": "Hizmet A", "service_id": "geo-a", "description": "Açıklama A", "matchedTags": ["schema"], "relevanceScore": 10, "addressedIssueCodes": ["C1"]}]}	2026-07-24 20:35:22.365853+00
22222222-2222-2222-2222-222222222222	cor-high	sub-high	geo_readiness	{"scoreBand": "good", "overallScore": 85, "matchedServices": [{"name": "Hizmet B", "service_id": "geo-b", "description": "Açıklama B", "matchedTags": ["schema"], "relevanceScore": 10, "addressedIssueCodes": ["C1"]}]}	2026-07-24 20:35:22.378623+00
33333333-3333-3333-3333-333333333333	cor-empty	sub-empty	geo_readiness	{"scoreBand": "good", "overallScore": 85, "matchedServices": []}	2026-07-24 20:35:22.381403+00
\.


--
-- Data for Name: job_status_transitions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_status_transitions (from_status, to_status) FROM stdin;
queued	running
queued	failed
running	completed
running	failed
running	permanent
running	timeout
failed	running
failed	permanent
failed	timeout
\.


--
-- Data for Name: rbac_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_permissions (id, canonical_identity, display_name, description, created_at) FROM stdin;
9ae51c2f-e2c9-4b33-9bea-74d44abc3a92	admin:overview:read	Read admin overview	View operational Overview metrics	2026-07-22 21:55:32.325214+00
\.


--
-- Data for Name: rbac_role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_role_permissions (role_id, permission_id, granted_at) FROM stdin;
6ceee61b-7ada-4a13-9a49-f34a44cf8ca2	9ae51c2f-e2c9-4b33-9bea-74d44abc3a92	2026-07-22 21:55:32.325214+00
\.


--
-- Data for Name: rbac_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_roles (id, canonical_identity, display_name, description, created_at) FROM stdin;
6ceee61b-7ada-4a13-9a49-f34a44cf8ca2	operator	SeoVista Operator	Global operator for the SeoVista admin surface	2026-07-22 21:55:32.325214+00
\.


--
-- Data for Name: rbac_subject_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rbac_subject_roles (subject_identity, role_id, assigned_at) FROM stdin;
\.


--
-- Data for Name: seovista_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.seovista_migrations (id, name, applied_at) FROM stdin;
\.


--
-- Name: admin_organization_memberships admin_organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_organization_memberships
    ADD CONSTRAINT admin_organization_memberships_pkey PRIMARY KEY (user_id, organization_id);


--
-- Name: admin_organizations admin_organizations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_organizations
    ADD CONSTRAINT admin_organizations_name_key UNIQUE (name);


--
-- Name: admin_organizations admin_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_organizations
    ADD CONSTRAINT admin_organizations_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: api_cost_ledger api_cost_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_cost_ledger
    ADD CONSTRAINT api_cost_ledger_pkey PRIMARY KEY (id);


--
-- Name: api_cost_ledger api_cost_ledger_request_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_cost_ledger
    ADD CONSTRAINT api_cost_ledger_request_identity_key UNIQUE (request_identity);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: cms_entries cms_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_entries
    ADD CONSTRAINT cms_entries_pkey PRIMARY KEY (id);


--
-- Name: cms_preview_grants cms_preview_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_preview_grants
    ADD CONSTRAINT cms_preview_grants_pkey PRIMARY KEY (id);


--
-- Name: cms_preview_grants cms_preview_grants_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_preview_grants
    ADD CONSTRAINT cms_preview_grants_token_hash_key UNIQUE (token_hash);


--
-- Name: cms_publication_events cms_publication_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_publication_events
    ADD CONSTRAINT cms_publication_events_pkey PRIMARY KEY (id);


--
-- Name: cms_revisions cms_revisions_entry_id_revision_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_revisions
    ADD CONSTRAINT cms_revisions_entry_id_revision_number_key UNIQUE (entry_id, revision_number);


--
-- Name: cms_revisions cms_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_revisions
    ADD CONSTRAINT cms_revisions_pkey PRIMARY KEY (id);


--
-- Name: geo_audit_leads geo_audit_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_audit_leads
    ADD CONSTRAINT geo_audit_leads_pkey PRIMARY KEY (id);


--
-- Name: job_records job_records_job_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_records
    ADD CONSTRAINT job_records_job_identity_key UNIQUE (job_identity);


--
-- Name: job_records job_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_records
    ADD CONSTRAINT job_records_pkey PRIMARY KEY (id);


--
-- Name: job_results job_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_results
    ADD CONSTRAINT job_results_pkey PRIMARY KEY (id);


--
-- Name: job_status_transitions job_status_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_status_transitions
    ADD CONSTRAINT job_status_transitions_pkey PRIMARY KEY (from_status, to_status);


--
-- Name: rbac_permissions rbac_permissions_canonical_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_permissions
    ADD CONSTRAINT rbac_permissions_canonical_identity_key UNIQUE (canonical_identity);


--
-- Name: rbac_permissions rbac_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_permissions
    ADD CONSTRAINT rbac_permissions_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_permissions rbac_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: rbac_roles rbac_roles_canonical_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_canonical_identity_key UNIQUE (canonical_identity);


--
-- Name: rbac_roles rbac_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_subject_roles rbac_subject_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_subject_roles
    ADD CONSTRAINT rbac_subject_roles_pkey PRIMARY KEY (subject_identity, role_id);


--
-- Name: seovista_migrations seovista_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seovista_migrations
    ADD CONSTRAINT seovista_migrations_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_active ON public.admin_sessions USING btree (token_hash, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_admin_sessions_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_expiry ON public.admin_sessions USING btree (expires_at);


--
-- Name: idx_admin_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_user_id ON public.admin_sessions USING btree (user_id);


--
-- Name: idx_admin_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);


--
-- Name: idx_api_cost_ledger_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_cost_ledger_correlation ON public.api_cost_ledger USING btree (correlation_id);


--
-- Name: idx_api_cost_ledger_recorded_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_cost_ledger_recorded_day ON public.api_cost_ledger USING btree (provider, operation, date((recorded_at AT TIME ZONE 'UTC'::text)));


--
-- Name: idx_audit_logs_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_correlation ON public.audit_logs USING btree (correlation_id);


--
-- Name: idx_audit_logs_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_recorded_at ON public.audit_logs USING btree (recorded_at);


--
-- Name: idx_cms_entries_active_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cms_entries_active_slug ON public.cms_entries USING btree (collection_name, locale, slug) WHERE ((archived_at IS NULL) AND (slug IS NOT NULL) AND (locale IS NOT NULL));


--
-- Name: idx_job_records_cache_key_inflight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_records_cache_key_inflight ON public.job_records USING btree (cache_key) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: idx_job_records_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_records_correlation ON public.job_records USING btree (correlation_id);


--
-- Name: idx_job_records_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_records_identity ON public.job_records USING btree (job_identity);


--
-- Name: idx_job_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_records_status ON public.job_records USING btree (status);


--
-- Name: idx_job_results_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_results_correlation ON public.job_results USING btree (correlation_id);


--
-- Name: idx_job_results_job_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_results_job_identity ON public.job_results USING btree (job_identity);


--
-- Name: idx_rbac_subject_roles_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_subject_roles_subject ON public.rbac_subject_roles USING btree (subject_identity);


--
-- Name: job_records job_transition_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER job_transition_trigger BEFORE UPDATE ON public.job_records FOR EACH ROW EXECUTE FUNCTION public.validate_job_transition();


--
-- Name: admin_organization_memberships admin_organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_organization_memberships
    ADD CONSTRAINT admin_organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.admin_organizations(id) ON DELETE CASCADE;


--
-- Name: admin_organization_memberships admin_organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_organization_memberships
    ADD CONSTRAINT admin_organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: admin_sessions admin_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: cms_entries cms_entries_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_entries
    ADD CONSTRAINT cms_entries_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.admin_users(id);


--
-- Name: cms_entries cms_entries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_entries
    ADD CONSTRAINT cms_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.admin_organizations(id);


--
-- Name: cms_preview_grants cms_preview_grants_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_preview_grants
    ADD CONSTRAINT cms_preview_grants_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.cms_entries(id);


--
-- Name: cms_preview_grants cms_preview_grants_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_preview_grants
    ADD CONSTRAINT cms_preview_grants_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.admin_users(id);


--
-- Name: cms_preview_grants cms_preview_grants_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_preview_grants
    ADD CONSTRAINT cms_preview_grants_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.cms_revisions(id);


--
-- Name: cms_publication_events cms_publication_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_publication_events
    ADD CONSTRAINT cms_publication_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.admin_users(id);


--
-- Name: cms_publication_events cms_publication_events_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_publication_events
    ADD CONSTRAINT cms_publication_events_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.cms_entries(id);


--
-- Name: cms_publication_events cms_publication_events_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_publication_events
    ADD CONSTRAINT cms_publication_events_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.cms_revisions(id);


--
-- Name: cms_revisions cms_revisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_revisions
    ADD CONSTRAINT cms_revisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admin_users(id);


--
-- Name: cms_revisions cms_revisions_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_revisions
    ADD CONSTRAINT cms_revisions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.cms_entries(id) ON DELETE CASCADE;


--
-- Name: job_records job_records_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_records
    ADD CONSTRAINT job_records_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.geo_audit_leads(id);


--
-- Name: job_records job_records_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_records
    ADD CONSTRAINT job_records_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.job_results(id) ON DELETE SET NULL;


--
-- Name: rbac_role_permissions rbac_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.rbac_permissions(id) ON DELETE CASCADE;


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_subject_roles rbac_subject_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_subject_roles
    ADD CONSTRAINT rbac_subject_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict qAeUoDABCcgacglknQBkbwL6GLSULalq0jDJUokazRkInHKmBTRrDE7nZlbyeyp

