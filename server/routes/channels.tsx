import type { Credentials } from "google-auth-library";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import {
	type ChannelInput,
	channelsRepo,
} from "../../repositories/channelsRepo.ts";
import { buildWebAuthUrl, exchangeCodeForTokens } from "../../utils/google.mts";
import { config } from "../config.ts";
import { currentOwner } from "../currentOwner.ts";
import { type Body, str } from "../formBody.ts";
import { channelSchema, fieldErrors } from "../validation.ts";
import { ChannelForm } from "../views/forms.tsx";
import { Layout } from "../views/layout.tsx";

export const channels = new Hono();

/** Short-lived signed cookie carrying `${channelKey}:${nonce}` across the redirect. */
const OAUTH_COOKIE = "vm_oauth";

function OauthFlash({ status }: { status?: string }) {
	if (status === "ok")
		return <p style="color:#2e7d32">✅ YouTube connected — refresh token stored.</p>;
	if (status === "denied")
		return <p class="err">Connection cancelled — Google access was denied.</p>;
	if (status === "error")
		return <p class="err">Connection failed — please try again.</p>;
	return null;
}

/** Secrets are only included when the user typed a new value (blank = keep current). */
function buildInput(body: Body): {
	raw: Record<string, unknown>;
	input?: ChannelInput;
	error?: Record<string, string>;
} {
	const channelKey = str(body, "channelKey");
	const displayName = str(body, "displayName");
	const igUsername = str(body, "igUsername");
	const igPasswordRaw = str(body, "igPassword");
	const googleTokensRaw = str(body, "googleTokens").trim();

	const raw = { channelKey, displayName, igUsername };

	const parsed = channelSchema.safeParse(raw);
	if (!parsed.success) return { raw, error: fieldErrors(parsed.error) };

	let googleTokens: Credentials | undefined;
	if (googleTokensRaw) {
		try {
			googleTokens = JSON.parse(googleTokensRaw);
		} catch {
			return { raw, error: { googleTokens: "invalid JSON" } };
		}
	}

	return {
		raw,
		input: {
			channelKey: parsed.data.channelKey,
			displayName: parsed.data.displayName,
			igUsername: parsed.data.igUsername,
			igPassword: igPasswordRaw ? igPasswordRaw : undefined,
			googleTokens,
		},
	};
}

channels.get("/channels", async (c) => {
	const owner = await currentOwner(c);
	const rows = await channelsRepo.listByOwner(owner.id);
	return c.html(
		<Layout title="Channels">
			<OauthFlash status={c.req.query("oauth")} />
			<p>
				<a href="/channels/new">+ new channel</a>
			</p>
			<p style="opacity:.8">
				Publishing credentials per channel. Secrets are write-only — they are
				never shown back here.
			</p>
			<table>
				<thead>
					<tr>
						<th>channel</th>
						<th>name</th>
						<th>YouTube</th>
						<th>Instagram</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{rows.map((ch) => (
						<tr>
							<td>
								<code>{ch.channelKey}</code>
							</td>
							<td>{ch.displayName ?? "—"}</td>
							<td>
								{ch.hasGoogleTokens ? "✓ tokens · " : "— "}
								<a href={`/channels/${ch.channelKey}/oauth/start`}>
									{ch.hasGoogleTokens ? "reconnect" : "connect"}
								</a>
							</td>
							<td>
								{ch.igUsername
									? `${ch.igUsername}${ch.hasIgPassword ? " ✓" : " (no pw)"}`
									: "—"}
							</td>
							<td>
								<a href={`/channels/${ch.channelKey}/edit`}>edit</a>{" "}
								<form
									method="post"
									action={`/channels/${ch.channelKey}/delete`}
									style="display:inline"
									onsubmit="return confirm('Delete this channel and its credentials?')"
								>
									<button type="submit" class="linkbtn">
										delete
									</button>
								</form>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Layout>,
	);
});

channels.get("/channels/new", async (c) => {
	await currentOwner(c);
	return c.html(
		<Layout title="New channel">
			<ChannelForm action="/channels" value={{}} errors={{}} isEdit={false} />
		</Layout>,
	);
});

channels.post("/channels", async (c) => {
	const owner = await currentOwner(c);
	const body = await c.req.parseBody();
	const { raw, input, error } = buildInput(body);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title="New channel">
				<ChannelForm action="/channels" value={raw} errors={errors} isEdit={false} />
			</Layout>,
		);
	if (error || !input) return render(error ?? {});
	if (await channelsRepo.exists(owner.id, input.channelKey)) {
		return render({ channelKey: `"${input.channelKey}" already exists` });
	}
	await channelsRepo.create(owner.id, input);
	return c.redirect("/channels");
});

// ---- Browser OAuth flow (YouTube) --------------------------------------

// Kick off consent: stash channel+nonce in a signed cookie, redirect to Google.
channels.get("/channels/:key/oauth/start", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("key");
	if (!(await channelsRepo.exists(owner.id, key))) {
		return c.redirect("/channels?oauth=error");
	}
	const nonce = crypto.randomUUID();
	await setSignedCookie(c, OAUTH_COOKIE, `${key}:${nonce}`, config.sessionSecret, {
		httpOnly: true,
		sameSite: "Lax",
		secure: !config.debug,
		path: "/",
		maxAge: 600,
	});
	return c.redirect(buildWebAuthUrl(config.googleWebRedirectUrl, nonce));
});

// Google redirects back here (top-level GET, so the Lax session cookie rides
// along and requireAuth still passes). Verify state, exchange code, store tokens.
channels.get("/channels/oauth/callback", async (c) => {
	const owner = await currentOwner(c);
	const cookie = await getSignedCookie(c, config.sessionSecret, OAUTH_COOKIE);
	deleteCookie(c, OAUTH_COOKIE, { path: "/" });

	if (c.req.query("error")) return c.redirect("/channels?oauth=denied");

	const code = c.req.query("code");
	const state = c.req.query("state");
	const [key, nonce] = (typeof cookie === "string" ? cookie : "").split(":");
	if (!code || !key || !nonce || nonce !== state) {
		return c.redirect("/channels?oauth=error");
	}
	if (!(await channelsRepo.exists(owner.id, key))) {
		return c.redirect("/channels?oauth=error");
	}
	try {
		const tokens = await exchangeCodeForTokens(config.googleWebRedirectUrl, code);
		await channelsRepo.setGoogleTokens(owner.id, key, tokens);
	} catch (e) {
		console.error("OAuth token exchange failed:", e);
		return c.redirect("/channels?oauth=error");
	}
	return c.redirect("/channels?oauth=ok");
});

channels.get("/channels/:key/edit", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("key");
	const value = await channelsRepo.formByOwner(owner.id, key);
	if (!value) {
		return c.html(
			<Layout title="Channel not found">
				<p>No channel with that id.</p>
			</Layout>,
			404,
		);
	}
	return c.html(
		<Layout title={`Edit channel · ${key}`}>
			<p>
				YouTube: {value.hasGoogleTokens ? "connected · " : "not connected · "}
				<a href={`/channels/${key}/oauth/start`}>
					{value.hasGoogleTokens ? "reconnect" : "connect"} via Google
				</a>
			</p>
			<ChannelForm action={`/channels/${key}`} value={value} errors={{}} isEdit={true} />
		</Layout>,
	);
});

channels.post("/channels/:key", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("key");
	const body = await c.req.parseBody();
	const { raw, input, error } = buildInput(body);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title={`Edit channel · ${key}`}>
				<ChannelForm action={`/channels/${key}`} value={{ ...raw, channelKey: key }} errors={errors} isEdit={true} />
			</Layout>,
		);
	if (error || !input) return render(error ?? {});
	await channelsRepo.update(owner.id, key, input);
	return c.redirect("/channels");
});

channels.post("/channels/:key/delete", async (c) => {
	const owner = await currentOwner(c);
	await channelsRepo.delete(owner.id, c.req.param("key"));
	return c.redirect("/channels");
});
