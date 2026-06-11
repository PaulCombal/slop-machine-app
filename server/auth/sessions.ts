import { sql } from "../../db/client.ts";

/**
 * Server-side sessions in the `sessions` table; the opaque id rides in a signed
 * cookie (middleware.ts). Revoking is a row delete; expiry is enforced in SQL.
 */

const SESSION_TTL = "30 days";

export type SessionUser = { id: string; name: string; isAdmin: boolean };

/** Create a session for a user and return its opaque id (the cookie value). */
export async function createSession(userId: string): Promise<string> {
	const id = crypto.randomUUID();
	await sql`
		insert into sessions (id, user_id, expires_at)
		values (${id}, ${userId}, now() + interval '${sql.unsafe(SESSION_TTL)}')
	`;
	return id;
}

/** Resolve a session id to its user, or null if missing/expired. */
export async function lookupSession(id: string): Promise<SessionUser | null> {
	const rows = await sql`
		select u.id, u.username, u.is_admin
		from sessions s
		join users u on u.id = s.user_id
		where s.id = ${id} and s.expires_at > now()
		limit 1
	`;
	if (!rows.length) return null;
	const r = rows[0];
	return { id: r.id, name: r.username, isAdmin: r.is_admin };
}

/** Revoke a session (logout). */
export async function destroySession(id: string): Promise<void> {
	await sql`delete from sessions where id = ${id}`;
}

/** Look up a user's password hash by username (for login). */
export async function findUserCredentials(
	username: string,
): Promise<{ id: string; passwordHash: string } | null> {
	const rows = await sql`
		select id, password_hash from users where username = ${username} limit 1
	`;
	if (!rows.length) return null;
	return { id: rows[0].id, passwordHash: rows[0].password_hash };
}
