-- Role-based access control foundation.
CREATE TABLE IF NOT EXISTS rbac_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_identity TEXT NOT NULL UNIQUE CHECK (length(canonical_identity) > 0),
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_identity TEXT NOT NULL UNIQUE CHECK (length(canonical_identity) > 0),
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES rbac_permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS rbac_subject_roles (
  subject_identity TEXT NOT NULL CHECK (length(subject_identity) > 0),
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_identity, role_id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_subject_roles_subject
  ON rbac_subject_roles (subject_identity);
