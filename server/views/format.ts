import { config } from "../config.ts";

/** Format an epoch-ms timestamp as a compact UTC string, or "—" if absent. */
export function fmtTime(ms?: number): string {
	if (!ms) return "—";
	return `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)}Z`;
}

/** Deep-link to a queue's bullboard view (bullboard serves under /ui). */
export const BULLBOARD_QUEUE = `${config.bullboardUrl}/ui/queue/assets-pipeline`;
