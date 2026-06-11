import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { verifyPassword } from "../../db/users.ts";
import { config } from "../config.ts";
import { SESSION_COOKIE } from "../auth/middleware.ts";
import {
	createSession,
	destroySession,
	findUserCredentials,
} from "../auth/sessions.ts";

export const auth = new Hono();

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches the DB session TTL

/** Standalone login page (no nav chrome — the user isn't authenticated yet). */
function LoginPage({ error }: { error?: boolean }) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Sign in · video-machine</title>
				<style>{CSS}</style>
			</head>
			<body>
				<form method="post" action="/login">
					<h1>video-machine</h1>
					{error ? <p class="error">Invalid username or password.</p> : null}
					<label>
						Username
						<input name="username" autofocus required />
					</label>
					<label>
						Password
						<input name="password" type="password" required />
					</label>
					<button type="submit">Sign in</button>
				</form>
			</body>
		</html>
	);
}

auth.get("/login", (c) => c.html(<LoginPage error={c.req.query("e") === "1"} />));

auth.post("/login", async (c) => {
	const body = await c.req.parseBody();
	const username = String(body.username ?? "");
	const password = String(body.password ?? "");

	const creds = await findUserCredentials(username);
	const ok = creds ? await verifyPassword(password, creds.passwordHash) : false;
	if (!creds || !ok) {
		return c.redirect("/login?e=1");
	}

	const sid = await createSession(creds.id);
	await setSignedCookie(c, SESSION_COOKIE, sid, config.sessionSecret, {
		httpOnly: true,
		sameSite: "Lax",
		secure: !config.debug,
		path: "/",
		maxAge: MAX_AGE,
	});
	return c.redirect("/");
});

auth.post("/logout", async (c) => {
	const sid = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE);
	if (sid) await destroySession(sid);
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
	return c.redirect("/login");
});

const CSS = `
:root { color-scheme: light dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center;
       font: 15px/1.5 system-ui, sans-serif; }
form { display: flex; flex-direction: column; gap: .75rem; width: 18rem;
       padding: 2rem; border: 1px solid #8884; border-radius: 8px; }
h1 { margin: 0 0 .5rem; font-size: 1.25rem; }
label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; }
input { padding: .5rem; font-size: 1rem; }
button { padding: .55rem; font-size: 1rem; cursor: pointer; margin-top: .5rem; }
.error { color: #c0392b; margin: 0; font-size: .85rem; }
`;
