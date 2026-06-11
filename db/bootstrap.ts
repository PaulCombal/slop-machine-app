import { migrate } from "./migrate.ts";
import { seedDefinitions } from "./seed.ts";
import { ensureAdminUser, type UserRow } from "./users.ts";

/**
 * Bring the database to a ready state at process boot: apply migrations, ensure
 * the admin user, and seed definitions on first run. All three are idempotent,
 * so both the worker and the web server can call this safely on startup.
 */
export async function ensureDatabaseReady(): Promise<UserRow> {
	await migrate();
	const admin = await ensureAdminUser();
	await seedDefinitions(admin.id);
	return admin;
}
