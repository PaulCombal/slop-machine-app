import type { Context } from "hono";

/** The owner whose definitions a request reads/writes. */
export type CurrentOwner = { id: string; name: string };

/** Resolve the request's owner from the session user that `requireAuth` set. */
export function currentOwner(c: Context): CurrentOwner {
	const user = c.get("user");
	if (!user) {
		throw new Error("currentOwner() called without an authenticated user");
	}
	return { id: user.id, name: user.name };
}
