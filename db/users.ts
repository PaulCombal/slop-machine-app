import { sql } from "./client.ts";

/**
 * User rows + password hashing (Bun.password / argon2id). The bootstrap admin is
 * created from ADMIN_USER / ADMIN_PASS on first boot.
 */

const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASS ?? "admin";

export type UserRow = { id: string; username: string };

export function hashPassword(plain: string): Promise<string> {
	return Bun.password.hash(plain);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
	return Bun.password.verify(plain, hash);
}

/** Create the admin user if it doesn't exist yet. Idempotent + race-tolerant. */
export async function ensureAdminUser(): Promise<UserRow> {
	const existing = await sql`
		select id, username from users where username = ${ADMIN_USER} limit 1
	`;
	if (existing.length) return existing[0] as UserRow;

	const hash = await hashPassword(ADMIN_PASS);
	const inserted = await sql`
		insert into users (username, password_hash, is_admin)
		values (${ADMIN_USER}, ${hash}, true)
		on conflict (username) do nothing
		returning id, username
	`;
	if (inserted.length) {
		console.log(`👤 Created admin user "${ADMIN_USER}"`);
		return inserted[0] as UserRow;
	}

	// Lost a concurrent race — the row now exists.
	const again = await sql`
		select id, username from users where username = ${ADMIN_USER} limit 1
	`;
	return again[0] as UserRow;
}

let cachedAdminId: string | undefined;

/**
 * The admin user's id, cached. Phase 1 is single-tenant on the worker side, so
 * channel credentials resolve within the admin tenant (mirrors the registry
 * cache). Replace with a per-job tenant once job payloads carry an owner.
 */
export async function adminOwnerId(): Promise<string> {
	if (cachedAdminId) return cachedAdminId;
	const admin = await ensureAdminUser();
	cachedAdminId = admin.id;
	return cachedAdminId;
}
