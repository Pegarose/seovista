import type { DbClient } from "./client.js";

export type AdminUserStatus = "active" | "disabled";
export type AdminMembershipRole = "owner" | "member";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  status: AdminUserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAdminUser {
  email: string;
  displayName: string;
  passwordHash: string;
  status?: AdminUserStatus;
}

export interface AdminSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface AdminSessionWithUser extends AdminSession {
  user: AdminUser;
}

interface AdminSessionWithUserRow extends AdminSession {
  user_email: string;
  user_display_name: string;
  user_status: AdminUserStatus;
  user_created_at: Date;
  user_updated_at: Date;
}

export interface CreateAdminSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AdminAuthRepository {
  createUser(input: CreateAdminUser): Promise<AdminUser>;
  findUserByEmail(email: string): Promise<AdminUser | null>;
  findUserById(id: string): Promise<AdminUser | null>;
  createSession(input: CreateAdminSession): Promise<AdminSession>;
  findActiveSessionByHash(tokenHash: string, now: Date): Promise<AdminSessionWithUser | null>;
  revokeSessionByHash(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeAllUserSessions(userId: string, revokedAt: Date): Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAdminAuthRepository(client: DbClient): AdminAuthRepository {
  return {
    async createUser(input): Promise<AdminUser> {
      const result = await client.query<AdminUser>(
        `
          INSERT INTO admin_users (email, display_name, password_hash, status)
          VALUES ($1, $2, $3, $4)
          RETURNING id, email, display_name, status, created_at, updated_at
        `,
        [normalizeEmail(input.email), input.displayName.trim(), input.passwordHash, input.status ?? "active"]
      );
      return result.rows[0]!;
    },

    async findUserByEmail(email): Promise<AdminUser | null> {
      const result = await client.query<AdminUser>(
        "SELECT id, email, display_name, status, created_at, updated_at FROM admin_users WHERE email = $1",
        [normalizeEmail(email)]
      );
      return result.rows[0] ?? null;
    },

    async findUserById(id): Promise<AdminUser | null> {
      const result = await client.query<AdminUser>(
        "SELECT id, email, display_name, status, created_at, updated_at FROM admin_users WHERE id = $1",
        [id]
      );
      return result.rows[0] ?? null;
    },

    async createSession(input): Promise<AdminSession> {
      const result = await client.query<AdminSession>(
        `
          INSERT INTO admin_sessions (user_id, token_hash, expires_at)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [input.userId, input.tokenHash, input.expiresAt]
      );
      return result.rows[0]!;
    },

    async findActiveSessionByHash(tokenHash, now): Promise<AdminSessionWithUser | null> {
      const result = await client.query<AdminSessionWithUserRow>(
        `
          SELECT
            s.id,
            s.user_id,
            s.token_hash,
            s.expires_at,
            s.revoked_at,
            s.created_at,
            u.id AS user_id,
            u.email AS user_email,
            u.display_name AS user_display_name,
            u.status AS user_status,
            u.created_at AS user_created_at,
            u.updated_at AS user_updated_at
          FROM admin_sessions s
          INNER JOIN admin_users u ON u.id = s.user_id
          WHERE s.token_hash = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > $2
            AND u.status = 'active'
        `,
        [tokenHash, now]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        ...row,
        user: {
          id: row.user_id,
          email: row.user_email,
          display_name: row.user_display_name,
          status: row.user_status,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        },
      };
    },

    async revokeSessionByHash(tokenHash, revokedAt): Promise<void> {
      await client.query(
        "UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE token_hash = $1",
        [tokenHash, revokedAt]
      );
    },

    async revokeAllUserSessions(userId, revokedAt): Promise<void> {
      await client.query(
        "UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1 AND revoked_at IS NULL",
        [userId, revokedAt]
      );
    },
  };
}
