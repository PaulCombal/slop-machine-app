/**
 * Encode a JS string array as a Postgres array literal. Bun.sql does not
 * auto-encode JS arrays for `text[]` columns, so we build the literal ourselves
 * and cast with `::text[]` at the call site.
 */
export function pgArray(values: readonly string[]): string {
	return `{${values
		.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
		.join(",")}}`;
}
