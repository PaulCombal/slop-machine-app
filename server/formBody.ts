/** Helpers for reading Hono `parseBody({ all: true })` results into clean values. */

export type Body = Record<string, string | File | (string | File)[]>;

/** Last value for a field, as a string. */
export function str(body: Body, name: string): string {
	const v = body[name];
	if (Array.isArray(v)) return v.length ? String(v[v.length - 1]) : "";
	return v == null ? "" : String(v);
}

/** All values for a (possibly repeated) checkbox field. */
export function arr(body: Body, name: string): string[] {
	const v = body[name];
	if (v == null) return [];
	return (Array.isArray(v) ? v : [v]).map(String);
}

/** Split a comma-separated field into trimmed, non-empty parts. */
export function csv(s: string): string[] {
	return s
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

/** Interpret a checkbox value as a boolean. */
export function bool(body: Body, name: string): boolean {
	const v = str(body, name);
	return v === "on" || v === "true" || v === "1";
}
