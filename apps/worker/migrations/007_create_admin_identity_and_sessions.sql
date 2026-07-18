-- SeoVista admin identities and opaque session persistence. Raw passwords and
-- raw session tokens never enter this schema.
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (length(email) > 3),
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_organization_memberships (
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES admin_organizations(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL CHECK (membership_role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO rbac_roles (canonical_identity, display_name, description)
VALUES ('operator', 'SeoVista Operator', 'Global operator for the SeoVista admin surface')
ON CONFLICT (canonical_identity) DO NOTHING;

INSERT INTO rbac_permissions (canonical_identity, display_name, description)
VALUES ('admin:overview:read', 'Read admin overview', 'View operational Overview metrics')
ON CONFLICT (canonical_identity) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r
CROSS JOIN rbac_permissions p
WHERE r.canonical_identity = 'operator'
  AND p.canonical_identity = 'admin:overview:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
