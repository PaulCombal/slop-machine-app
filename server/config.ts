/**
 * Server config, parsed once from env. Isolated here so routes never touch
 * process.env directly (the seam for a real config source later).
 */
export const config = {
	port: Number(process.env.API_PORT ?? 8002),
	adminUser: process.env.ADMIN_USER ?? "admin",
	adminPass: process.env.ADMIN_PASS ?? "admin",
	/** Secret for signing the session cookie. MUST be set in any real deploy. */
	sessionSecret:
		process.env.SESSION_SECRET ?? "dev-insecure-session-secret-change-me",
	/**
	 * Where Google redirects back after the browser OAuth flow. MUST be an
	 * Authorized redirect URI on the OAuth client and match exactly (Google
	 * allows http only for localhost).
	 */
	googleWebRedirectUrl:
		process.env.GOOGLE_OAUTH2_WEB_REDIRECT_URL ??
		"http://localhost:8002/channels/oauth/callback",
	queueHost: process.env.QUEUE_HOST ?? "valkey",
	queuePort: 6379,
	/** Same DEBUG semantics as the rest of the app: real calls only when "false". */
	debug: process.env.DEBUG !== "false",
	/** Base URL of the bullboard dashboard, for deep-links from the UI. */
	bullboardUrl: process.env.BULLBOARD_URL ?? "http://localhost:8001",
};
