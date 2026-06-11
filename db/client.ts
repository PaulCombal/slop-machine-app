import { SQL } from "bun";

/**
 * The single Postgres client, shared by the worker and the web server. Uses
 * Bun's native SQL — no driver dependency. Connection is lazy (opens on first
 * query), so importing this in a process that never touches the DB is cheap.
 *
 * This is the lowest layer of the Phase 1 data plane; the repositories in
 * `repositories/*` and `server/repositories/*` build on top of it.
 */
const url = process.env.DATABASE_URL;
if (!url) {
	throw new Error(
		"DATABASE_URL is not set — required for the Postgres-backed definitions.",
	);
}

export const sql = new SQL(url);
