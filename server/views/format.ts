/** Format an epoch-ms timestamp as a compact UTC string, or "—" if absent. */
export function fmtTime(ms?: number): string {
	if (!ms) return "—";
	return `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)}Z`;
}

/** Deep-link to a queue's bullboard view (bullboard runs at :8001 under /ui). */
export const BULLBOARD_QUEUE = "http://localhost:8001/ui/queue/assets-pipeline";
