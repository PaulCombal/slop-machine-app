import type { Context, Next } from "hono";
import { getSignedCookie } from "hono/cookie";
import { config } from "../config.ts";
import { lookupSession, type SessionUser } from "./sessions.ts";

/** The signed cookie holding the opaque session id. */
export const SESSION_COOKIE = "vm_session";

// Make `c.get("user")` typed across all routes.
declare module "hono" {
	interface ContextVariableMap {
		user: SessionUser;
	}
}

/**
 * Gate every page behind a valid session. On success the resolved user is put on
 * the context (`c.get("user")`); otherwise the request is redirected to /login.
 */
export async function requireAuth(c: Context, next: Next) {
	const sid = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE);
	if (sid) {
		const user = await lookupSession(sid);
		if (user) {
			c.set("user", user);
			return next();
		}
	}
	return c.redirect("/login");
}
