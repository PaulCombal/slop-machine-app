import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./client.ts";

/**
 * Forward-only migration runner: applies each `migrations/*.sql` not yet in
 * `schema_migrations`, one transaction apiece. Timestamp-prefixed filenames
 * (`YYYYMMDDTHHMM_name.sql`) keep a lexical sort chronological. Idempotent, so
 * both entrypoints can call it at boot.
 */
const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export async function migrate(): Promise<void> {
	await sql`
		create table if not exists schema_migrations (
			version    text primary key,
			applied_at timestamptz not null default now()
		)
	`;

	const rows = await sql`select version from schema_migrations`;
	const applied = new Set(rows.map((r: { version: string }) => r.version));

	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();

	let pending = 0;
	for (const file of files) {
		if (applied.has(file)) continue;
		pending++;
		const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
		console.log(`▶️  applying migration ${file}`);
		await sql.begin(async (tx) => {
			await tx.unsafe(text);
			await tx`insert into schema_migrations (version) values (${file})`;
		});
	}

	console.log(
		pending === 0
			? `✅ migrations up to date (${files.length} total)`
			: `✅ applied ${pending} migration(s) (${files.length} total)`,
	);
}

// `bun run migrate` / `bun run db/migrate.ts`
if (import.meta.main) {
	await migrate();
	await sql.end();
}
