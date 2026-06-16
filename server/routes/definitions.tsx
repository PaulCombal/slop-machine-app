import { type Context, Hono } from "hono";
import { mediaRepo } from "../../repositories/media.ts";
import type { EpisodePlan } from "../../steps/generate_series.mts";
import { deleteManifest, loadManifest } from "../../utils/seriesManifest.ts";
import { isShowLocked } from "../../show.mts";
import { currentOwner } from "../currentOwner.ts";
import { type Body, arr, bool, str } from "../formBody.ts";
import { DefinitionError, definitionsRepo } from "../repositories/definitions.ts";
import { jobsRepo } from "../repositories/jobs.ts";
import {
	fieldErrors,
	groupSchema,
	isSafeSegment,
	personaSchema,
	showSchema,
	type PersonaInput,
} from "../validation.ts";
import { GroupForm, PersonaForm, ShowForm } from "../views/forms.tsx";
import { StanceGallery, StanceStudio } from "../views/stanceStudio.tsx";
import { Layout } from "../views/layout.tsx";
import {
	buildStancePrompt,
	generateStanceImage,
	type ImageReference,
	type StanceModel,
	STANCE_MODELS,
} from "../../steps/generate_image.mts";
import { removeBackground } from "../../steps/remove_background.ts";
import {
	type CharacterDraft,
	generateCastFromProse,
	writePlaceholderStances,
} from "../../steps/generate_personae.mts";

export const definitions = new Hono();

/** Saved theme keys for the theme combobox on persona/group/show forms. */
async function listThemeKeys(ownerId: string): Promise<string[]> {
	return (await mediaRepo.list(ownerId, "theme")).map((m) => m.assetKey);
}

/** Render a label/value grid for a detail page. */
function Fields({ rows }: { rows: [string, unknown][] }) {
	return (
		<table>
			<tbody>
				{rows.map(([k, v]) => (
					<tr>
						<th style="width:14rem">{k}</th>
						<td>
							{typeof v === "string" && v.length > 80 ? (
								<pre style="white-space:pre-wrap;margin:0">{v}</pre>
							) : Array.isArray(v) ? (
								v.length ? (
									v.join(", ")
								) : (
									"—"
								)
							) : v && typeof v === "object" ? (
								v
							) : (
								String(v)
							)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function NotFound(kind: string) {
	return (
		<Layout title={`${kind} not found`}>
			<p>No {kind} with that id.</p>
		</Layout>
	);
}

/** A small POST form rendering a single danger button (for deletes). */
function DeleteButton({ action }: { action: string }) {
	return (
		<form
			method="post"
			action={action}
			style="display:inline"
			onsubmit="return confirm('Delete this definition?')"
		>
			<button type="submit" class="linkbtn">
				delete
			</button>
		</form>
	);
}

/** Reopen-a-locked-show button (used on both the edit and detail pages). */
function ReopenShowForm({ showId }: { showId: string }) {
	return (
		<form
			method="post"
			action={`/shows/${showId}/reopen`}
			style="display:inline"
			onsubmit="return confirm('Reopen for editing? This discards the generated episode manifest and its render/publish progress.')"
		>
			<button type="submit">Reopen for editing</button>
		</form>
	);
}

// ---- Personae ----------------------------------------------------------

definitions.get("/personae", async (c) => {
	const rows = await definitionsRepo.personae(await currentOwner(c));
	return c.html(
		<Layout title="Personae">
			<p>
				<a href="/personae/new">+ new persona</a>
			</p>
			<table>
				<thead>
					<tr>
						<th>id</th>
						<th>name</th>
						<th>lang</th>
						<th>TTS</th>
						<th>voice</th>
						<th>stances</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{rows.map((p) => (
						<tr>
							<td>
								<a href={`/personae/${p.id}`}>{p.id}</a>
							</td>
							<td>{p.personaName}</td>
							<td>{p.language}</td>
							<td>{p.ttsProvider}</td>
							<td>
								<code>{p.voiceId}</code>
							</td>
							<td>{p.stances.length}</td>
							<td>
								<a href={`/personae/${p.id}/edit`}>edit</a>{" "}
								<DeleteButton action={`/personae/${p.id}/delete`} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Layout>,
	);
});

definitions.get("/personae/new", async (c) => {
	const owner = await currentOwner(c);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title="New persona">
			<PersonaForm action="/personae" value={{}} errors={{}} isEdit={false} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/personae", async (c) => {
	const owner = await currentOwner(c);
	const body = await c.req.parseBody({ all: true });
	const raw = buildPersonaRaw(body);
	const themeKeys = await listThemeKeys(owner.id);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title="New persona">
				<PersonaForm action="/personae" value={raw} errors={errors} isEdit={false} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = personaSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.createPersona(owner, parsed.data);
		await saveVoiceSample(body, parsed.data.assetId ?? parsed.data.key);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect("/personae");
});

definitions.get("/personae/:id/edit", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const value = await definitionsRepo.personaForm(owner, key);
	if (!value) return c.html(NotFound("persona"), 404);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title={`Edit persona · ${key}`}>
			<PersonaForm action={`/personae/${key}`} value={value} errors={{}} isEdit={true} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/personae/:id", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const body = await c.req.parseBody({ all: true });
	const raw = buildPersonaRaw(body);
	const themeKeys = await listThemeKeys(owner.id);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title={`Edit persona · ${key}`}>
				<PersonaForm action={`/personae/${key}`} value={raw} errors={errors} isEdit={true} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = personaSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.updatePersona(owner, key, parsed.data);
		await saveVoiceSample(body, parsed.data.assetId ?? key);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect(`/personae/${key}`);
});

definitions.post("/personae/:id/delete", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	try {
		await definitionsRepo.deletePersona(owner, key);
	} catch (e) {
		if (e instanceof DefinitionError) {
			return c.html(
				<Layout title="Cannot delete persona">
					<p class="err">{e.message}</p>
					<p>
						<a href="/personae">← back to personae</a>
					</p>
				</Layout>,
			);
		}
		throw e;
	}
	return c.redirect("/personae");
});

// Stream a stance's PNG from S3 so the editor can preview existing artwork.
// Auth is the page gate; the persona must belong to the current owner.
definitions.get("/personae/:id/stances/:stance/png", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const assetId = await definitionsRepo.personaAssetId(owner, key);
	if (assetId === null) return c.body(null, 404);
	const stance = c.req.param("stance");
	if (!isSafeSegment(stance)) return c.body(null, 404);
	try {
		const buf = await Bun.s3.file(`personae/${assetId}/${stance}.png`).arrayBuffer();
		return c.body(buf, 200, {
			"content-type": "image/png",
			"cache-control": "no-store",
		});
	} catch {
		return c.body(null, 404);
	}
});

// Stream the persona's voice-cloning sample so the editor can preview it.
definitions.get("/personae/:id/voice-sample", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const assetId = await definitionsRepo.personaAssetId(owner, key);
	if (assetId === null) return c.body(null, 404);
	try {
		const buf = await Bun.s3.file(`personae/${assetId}/voiceSample.mp3`).arrayBuffer();
		return c.body(buf, 200, {
			"content-type": "audio/mpeg",
			"cache-control": "no-store",
		});
	} catch {
		return c.body(null, 404);
	}
});

// ---- Stance gallery + studio --------------------------------------------

/** Load the persona's assetId + existing stances (name + facing) for the studio. */
async function stanceContext(c: Context) {
	const owner = await currentOwner(c);
	const key = c.req.param("id") ?? "";
	const form = await definitionsRepo.personaForm(owner, key);
	if (!form) return null;
	const assetId = form.assetId || key;
	const stances = (Array.isArray(form.stances) ? form.stances : []) as {
		name: string;
		facing?: string;
		animations?: { in?: { preset?: string } };
	}[];
	const stanceNames = stances.map((s) => s.name);
	return { owner, key, form, assetId, stances, stanceNames };
}

type StudioCtx = NonNullable<Awaited<ReturnType<typeof stanceContext>>>;

/** Render the add/edit stance studio page (shared by GET pages and POST re-renders). */
function studioPage(
	c: Context,
	ctx: StudioCtx,
	props: Partial<Parameters<typeof StanceStudio>[0]>,
) {
	return c.html(
		<Layout
			title={props.stanceName ? `Edit stance · ${props.stanceName}` : `New stance · ${ctx.key}`}
		>
			<StanceStudio
				personaKey={ctx.key}
				personaName={ctx.form.personaName}
				stanceNames={ctx.stanceNames}
				{...props}
			/>
		</Layout>,
	);
}

// Gallery: every stance with a thumbnail, plus add/edit/delete.
definitions.get("/personae/:id/stances", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	return c.html(
		<Layout title={`Stances · ${ctx.key}`}>
			<StanceGallery
				personaKey={ctx.key}
				personaName={ctx.form.personaName}
				stances={ctx.stances}
				defaultPrompt={ctx.form.stanceDefaultPrompt ?? ""}
				mirrorable={Boolean(ctx.form.mirrorable)}
				saved={c.req.query("saved")}
				deleted={c.req.query("deleted")}
				settingsSaved={c.req.query("settings") === "saved"}
			/>
		</Layout>,
	);
});

// Save the persona's stance settings (default prompt + mirrorable).
definitions.post("/personae/:id/stances/settings", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const body = await c.req.parseBody();
	await definitionsRepo.setStanceSettings(ctx.owner, ctx.key, {
		defaultPrompt: str(body, "defaultPrompt").trim(),
		mirrorable: bool(body, "mirrorable"),
	});
	return c.redirect(`/personae/${ctx.key}/stances?settings=saved`);
});

// Add a new stance — prefill the generate box with the persona's default prompt.
definitions.get("/personae/:id/stances/new", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	return studioPage(c, ctx, { prompt: ctx.form.stanceDefaultPrompt ?? "" });
});

// Edit an existing stance (replace image / change facing).
definitions.get("/personae/:id/stances/:stance/edit", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const stanceName = c.req.param("stance");
	const existing = ctx.stances.find((s) => s.name === stanceName);
	if (!existing) return c.html(NotFound("stance"), 404);
	return studioPage(c, ctx, {
		stanceName,
		facing: existing.facing ?? "camera",
		animationIn: existing.animations?.in?.preset ?? "",
		prompt: ctx.form.stanceDefaultPrompt ?? "",
	});
});

definitions.post("/personae/:id/stances/generate", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const body = await c.req.parseBody({ all: true });
	const prompt = str(body, "prompt").trim();
	const referenceStance = str(body, "referenceStance").trim();
	const modelInput = str(body, "model").trim();
	const model: StanceModel = (STANCE_MODELS.some((m) => m.id === modelInput)
		? modelInput
		: "flux2") as StanceModel;
	// In edit mode the form carries the stance name being replaced.
	const stanceName = str(body, "stanceName").trim() || undefined;
	const editStance = stanceName
		? ctx.stances.find((s) => s.name === stanceName)
		: undefined;
	const facing = editStance?.facing ?? "camera";
	const animationIn = editStance?.animations?.in?.preset ?? "";

	const render = (props: {
		prompt?: string;
		referenceStance?: string;
		draftToken?: string;
		error?: string;
	}) => studioPage(c, ctx, { model, stanceName, facing, animationIn, ...props });

	if (!prompt) return render({ referenceStance, error: "Enter a prompt." });

	// Reference: an uploaded image wins, else a chosen existing stance PNG.
	const references: ImageReference[] = [];
	const upload = body["referenceUpload"];
	if (upload instanceof File && upload.size > 0) {
		references.push({
			data: new Uint8Array(await upload.arrayBuffer()),
			mediaType: upload.type || "image/png",
		});
	} else if (referenceStance) {
		if (!isSafeSegment(referenceStance)) {
			return render({ prompt, error: "Reference stance not found." });
		}
		try {
			const buf = await Bun.s3
				.file(`personae/${ctx.assetId}/${referenceStance}.png`)
				.arrayBuffer();
			references.push({ data: new Uint8Array(buf), mediaType: "image/png" });
		} catch {
			return render({ prompt, referenceStance, error: "Reference stance not found." });
		}
	}

	let png: Uint8Array;
	try {
		png = await generateStanceImage(
			buildStancePrompt(prompt, references.length > 0),
			references,
			model,
		);
		png = await removeBackground(png);
	} catch (e) {
		console.error("stance generation failed:", e);
		return render({
			prompt,
			referenceStance,
			error: "Generation failed: " + (e instanceof Error ? e.message : String(e)),
		});
	}

	const token = crypto.randomUUID();
	await Bun.s3.write(`personae/${ctx.assetId}/_drafts/${token}.png`, png, {
		type: "image/png",
	});
	return render({ prompt, referenceStance, draftToken: token });
});

definitions.get("/personae/:id/stances/draft/:token/png", async (c) => {
	const owner = await currentOwner(c);
	const assetId = await definitionsRepo.personaAssetId(owner, c.req.param("id"));
	if (assetId === null) return c.body(null, 404);
	const token = c.req.param("token") ?? "";
	if (!isSafeSegment(token)) return c.body(null, 404);
	try {
		const buf = await Bun.s3
			.file(`personae/${assetId}/_drafts/${token}.png`)
			.arrayBuffer();
		return c.body(buf, 200, {
			"content-type": "image/png",
			"cache-control": "no-store",
		});
	} catch {
		return c.body(null, 404);
	}
});

definitions.post("/personae/:id/stances/save", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const body = await c.req.parseBody();
	const token = str(body, "token").trim();
	const name = str(body, "name").trim();
	const facing = str(body, "facing").trim() || "camera";
	// Edit mode submits the fixed stance name; preserve mode on error re-render.
	const stanceName = str(body, "stanceName").trim() || undefined;

	const render = (error: string) =>
		studioPage(c, ctx, { draftToken: token, error, stanceName, facing });

	if (!isSafeSegment(name)) {
		return render("Stance name must be letters, digits, _ or - only.");
	}
	if (!isSafeSegment(token)) {
		return render("Draft expired — please generate again.");
	}

	const draftPath = `personae/${ctx.assetId}/_drafts/${token}.png`;
	let buf: ArrayBuffer;
	try {
		buf = await Bun.s3.file(draftPath).arrayBuffer();
	} catch {
		return render("Draft expired — please generate again.");
	}

	await Bun.s3.write(`personae/${ctx.assetId}/${name}.png`, buf, {
		type: "image/png",
	});
	await definitionsRepo.addStance(ctx.owner, ctx.key, { name, facing });
	await Bun.s3.file(draftPath).delete().catch(() => {});
	return c.redirect(`/personae/${ctx.key}/stances?saved=${encodeURIComponent(name)}`);
});

// Direct PNG upload (no AI) — add or replace a stance image.
definitions.post("/personae/:id/stances/upload", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const body = await c.req.parseBody({ all: true });
	const name = str(body, "name").trim();
	const facing = str(body, "facing").trim() || "camera";
	const stanceName = str(body, "stanceName").trim() || undefined;
	const file = body["image"];
	const fail = (error: string) => studioPage(c, ctx, { stanceName, facing, error });
	if (!isSafeSegment(name)) {
		return fail("Stance name must be letters, digits, _ or - only.");
	}
	if (!(file instanceof File) || file.size === 0) {
		return fail("Choose a PNG to upload.");
	}
	await Bun.s3.write(`personae/${ctx.assetId}/${name}.png`, file, {
		type: "image/png",
	});
	await definitionsRepo.addStance(ctx.owner, ctx.key, { name, facing });
	return c.redirect(`/personae/${ctx.key}/stances?saved=${encodeURIComponent(name)}`);
});

// Change a stance's facing + entrance animation without touching its image.
definitions.post("/personae/:id/stances/:stance/meta", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const stance = c.req.param("stance");
	if (!isSafeSegment(stance)) return c.body(null, 404);
	const body = await c.req.parseBody();
	const facing = str(body, "facing").trim() || "camera";
	const animationInPreset = str(body, "animationIn").trim(); // "" clears it
	await definitionsRepo.addStance(ctx.owner, ctx.key, {
		name: stance,
		facing,
		animationInPreset,
	});
	return c.redirect(`/personae/${ctx.key}/stances?saved=${encodeURIComponent(stance)}`);
});

// Delete a stance (JSONB entry + its S3 PNG).
definitions.post("/personae/:id/stances/:stance/delete", async (c) => {
	const ctx = await stanceContext(c);
	if (!ctx) return c.html(NotFound("persona"), 404);
	const stance = c.req.param("stance");
	if (!isSafeSegment(stance)) return c.body(null, 404);
	await definitionsRepo.removeStance(ctx.owner, ctx.key, stance);
	await Bun.s3.file(`personae/${ctx.assetId}/${stance}.png`).delete().catch(() => {});
	return c.redirect(`/personae/${ctx.key}/stances?deleted=${encodeURIComponent(stance)}`);
});

definitions.get("/personae/:id", async (c) => {
	const owner = await currentOwner(c);
	const p = await definitionsRepo.persona(owner, c.req.param("id"));
	if (!p) return c.html(NotFound("persona"), 404);
	const memberships = await definitionsRepo.membershipsForPersona(owner, p.id);
	const linkList = (items: string[], hrefBase: string) =>
		items.length ? (
			<>
				{items.map((k, i) => (
					<>
						{i > 0 ? ", " : ""}
						<a href={`${hrefBase}/${encodeURIComponent(k)}`}>{k}</a>
					</>
				))}
			</>
		) : (
			<span style="opacity:.6">none</span>
		);
	return c.html(
		<Layout title={`Persona · ${p.personaName}`}>
			<p>
				<a href="/personae">← all personae</a> ·{" "}
				<a href={`/personae/${p.id}/edit`}>edit</a> ·{" "}
				<a href={`/personae/${p.id}/stances`}>stances</a>
			</p>
			<Fields
				rows={[
					["owner", p.owner],
					["id", p.id],
					["groups", linkList(memberships.groups, "/groups")],
					["shows", linkList(memberships.shows, "/shows")],
					["assetId", p.assetId],
					["personaName", p.personaName],
					["language", p.language],
					["theme", p.theme],
					["themeVolume", p.themeVolume],
					["ttsProvider", p.ttsProvider],
					["voiceId", p.voiceId],
					["hasVoiceSample", p.hasVoiceSample],
					["stances", p.stances],
					["newsRegion", p.newsRegion],
					["newsTopics", p.newsTopics],
					["ytCategoryCode", p.ytCategoryCode],
					["promptPersonality", p.promptPersonality],
					["promptVideoMeta", p.promptVideoMeta],
				]}
			/>
		</Layout>,
	);
});

// ---- Groups ------------------------------------------------------------

definitions.get("/groups", async (c) => {
	const rows = await definitionsRepo.groups(await currentOwner(c));
	return c.html(
		<Layout title="Persona Groups">
			<p>
				<a href="/groups/new">+ new group</a>
			</p>
			<table>
				<thead>
					<tr>
						<th>name</th>
						<th>channel</th>
						<th>platforms</th>
						<th>personae</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{rows.map((g) => (
						<tr>
							<td>
								<a href={`/groups/${g.name}`}>{g.name}</a>
							</td>
							<td>
								<code>{g.channelId}</code>
							</td>
							<td>{g.platforms.join(", ")}</td>
							<td>{g.personae.join(", ")}</td>
							<td>
								<a href={`/groups/${g.name}/edit`}>edit</a>{" "}
								<DeleteButton action={`/groups/${g.name}/delete`} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Layout>,
	);
});

definitions.get("/groups/new", async (c) => {
	const owner = await currentOwner(c);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title="New group">
			<GroupForm action="/groups" value={{}} errors={{}} isEdit={false} personaOptions={personaOptions} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/groups", async (c) => {
	const owner = await currentOwner(c);
	const body = await c.req.parseBody({ all: true });
	const raw = buildGroupRaw(body);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title="New group">
				<GroupForm action="/groups" value={raw} errors={errors} isEdit={false} personaOptions={personaOptions} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = groupSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.createGroup(owner, parsed.data);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect("/groups");
});

definitions.get("/groups/:name/edit", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("name");
	const value = await definitionsRepo.groupForm(owner, key);
	if (!value) return c.html(NotFound("group"), 404);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title={`Edit group · ${key}`}>
			<GroupForm action={`/groups/${key}`} value={value} errors={{}} isEdit={true} personaOptions={personaOptions} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/groups/:name", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("name");
	const body = await c.req.parseBody({ all: true });
	const raw = buildGroupRaw(body);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title={`Edit group · ${key}`}>
				<GroupForm action={`/groups/${key}`} value={raw} errors={errors} isEdit={true} personaOptions={personaOptions} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = groupSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.updateGroup(owner, key, parsed.data);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect(`/groups/${key}`);
});

definitions.post("/groups/:name/delete", async (c) => {
	const owner = await currentOwner(c);
	await definitionsRepo.deleteGroup(owner, c.req.param("name"));
	return c.redirect("/groups");
});

definitions.get("/groups/:name", async (c) => {
	const g = await definitionsRepo.group(await currentOwner(c), c.req.param("name"));
	if (!g) return c.html(NotFound("group"), 404);
	return c.html(
		<Layout title={`Group · ${g.name}`}>
			<p>
				<a href="/groups">← all groups</a> ·{" "}
				<a href={`/groups/${g.name}/edit`}>edit</a>
			</p>
			<Fields
				rows={[
					["owner", g.owner],
					["name", g.name],
					["channelId", g.channelId],
					["platforms", g.platforms],
					["theme", g.theme],
					["themeVolume", g.themeVolume],
					["satisfyingVideoCategory", g.satisfyingVideoCategory],
					["endPaddingDurationMs", g.endPaddingDurationMs],
					["personae", g.personae],
					["prompt", g.prompt],
				]}
			/>
		</Layout>,
	);
});

// ---- Shows -------------------------------------------------------------

definitions.get("/shows", async (c) => {
	const rows = await definitionsRepo.shows(await currentOwner(c));
	return c.html(
		<Layout title="Shows">
			<p>
				<a href="/shows/new">+ new show</a>
			</p>
			<table>
				<thead>
					<tr>
						<th>id</th>
						<th>channel</th>
						<th>split</th>
						<th>cast/ep</th>
						<th>roster</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{rows.map((s) => (
						<tr>
							<td>
								<a href={`/shows/${s.id}`}>{s.id}</a>
							</td>
							<td>
								<code>{s.channelId}</code>
							</td>
							<td>
								{s.split.type === "episodeCount"
									? `${s.split.count} eps`
									: s.split.type}
							</td>
							<td>{s.maxCastPerEpisode}</td>
							<td>{s.roster.join(", ")}</td>
							<td>
								<a href={`/shows/${s.id}/edit`}>edit</a>{" "}
								<DeleteButton action={`/shows/${s.id}/delete`} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Layout>,
	);
});

definitions.get("/shows/new", async (c) => {
	const owner = await currentOwner(c);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title="New show">
			<ShowForm action="/shows" value={{}} errors={{}} isEdit={false} personaOptions={personaOptions} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/shows", async (c) => {
	const owner = await currentOwner(c);
	const body = await c.req.parseBody({ all: true });
	const raw = buildShowRaw(body);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title="New show">
				<ShowForm action="/shows" value={raw} errors={errors} isEdit={false} personaOptions={personaOptions} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = showSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.createShow(owner, parsed.data);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect("/shows");
});

definitions.get("/shows/:id/edit", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const value = await definitionsRepo.showForm(owner, key);
	if (!value) return c.html(NotFound("show"), 404);
	const status = await definitionsRepo.showStatus(owner, key);
	const locked = isShowLocked(status);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title={`Edit show · ${key}`}>
			{locked ? (
				<p style="color:#8a6d3b">
					🔒 This show is <strong>{status}</strong> — prose, cast and breakdown
					settings are locked. Distribution settings below are still editable.{" "}
					<ReopenShowForm showId={key} />
				</p>
			) : null}
			<ShowForm action={`/shows/${key}`} value={value} errors={{}} isEdit={true} locked={locked} personaOptions={personaOptions} themeKeys={themeKeys} />
		</Layout>,
	);
});

definitions.post("/shows/:id", async (c) => {
	const owner = await currentOwner(c);
	const key = c.req.param("id");
	const body = await c.req.parseBody({ all: true });
	const raw = buildShowRaw(body);
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	const locked = isShowLocked(await definitionsRepo.showStatus(owner, key));
	if (locked) {
		// Breakdown inputs are frozen — keep the stored values no matter what was
		// submitted, so only distribution fields can change without a reopen.
		const cur = await definitionsRepo.showForm(owner, key);
		if (cur) {
			raw.prose = cur.prose;
			raw.prompt = cur.prompt;
			raw.split = cur.split;
			raw.rosterKeys = cur.rosterKeys;
			raw.maxCastPerEpisode = cur.maxCastPerEpisode;
		}
	}
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title={`Edit show · ${key}`}>
				<ShowForm action={`/shows/${key}`} value={raw} errors={errors} isEdit={true} locked={locked} personaOptions={personaOptions} themeKeys={themeKeys} />
			</Layout>,
		);
	const parsed = showSchema.safeParse(raw);
	if (!parsed.success) return render(fieldErrors(parsed.error));
	try {
		await definitionsRepo.updateShow(owner, key, parsed.data);
	} catch (e) {
		if (e instanceof DefinitionError) return render(e.fields);
		throw e;
	}
	return c.redirect(`/shows/${key}`);
});

definitions.post("/shows/:id/delete", async (c) => {
	const owner = await currentOwner(c);
	await definitionsRepo.deleteShow(owner, c.req.param("id"));
	return c.redirect("/shows");
});

// Break the whole prose into an episode manifest (no rendering) for review.
definitions.post("/shows/:id/breakdown", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	const show = await definitionsRepo.show(owner, id);
	if (!show) return c.html(NotFound("show"), 404);
	// Roster is optional on the show itself, but you can't break a cast-less show.
	if (!show.roster.length)
		return c.redirect(`/shows/${id}?breakdown=noroster`);
	if (show.status === "breaking_down")
		return c.redirect(`/shows/${id}?breakdown=inprogress`);
	// Lock the breakdown inputs while the job runs; the worker flips this to
	// in_production on success (or back to draft on failure).
	await definitionsRepo.setShowStatus(owner, id, "breaking_down");
	await jobsRepo.triggerShowBreakdown(id);
	return c.redirect(`/shows/${id}?breakdown=queued`);
});

// Reopen a broken-down show for editing: unlock the inputs and discard the
// manifest (and its episode render/publish progress).
definitions.post("/shows/:id/reopen", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	if (!(await definitionsRepo.show(owner, id)))
		return c.html(NotFound("show"), 404);
	await definitionsRepo.setShowStatus(owner, id, "draft");
	await deleteManifest(id);
	return c.redirect(`/shows/${id}?reopened=1`);
});

// Read the prose, draft one persona per named character (LLM), and add them to
// the show's roster. Stances get a placeholder image a human replaces later.
definitions.post("/shows/:id/generate-personae", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	const show = await definitionsRepo.show(owner, id);
	if (!show) return c.html(NotFound("show"), 404);

	let cast: CharacterDraft[];
	try {
		cast = await generateCastFromProse(show.prose, show.prompt);
	} catch (e) {
		console.error("persona generation failed:", e);
		return c.redirect(`/shows/${id}?personae=error`);
	}

	const existing = new Set(
		(await definitionsRepo.personaOptions(owner)).map((o) => o.key),
	);
	const created: string[] = [];
	let skipped = 0;
	// generateCastFromProse already returns unique keys, so we only skip ones that
	// already exist as personae.
	for (const ch of cast) {
		if (existing.has(ch.key)) {
			skipped++;
			continue;
		}
		try {
			await definitionsRepo.createPersona(
				owner,
				generatedPersonaInput(ch.key, ch, show.theme),
			);
			await writePlaceholderStances(ch.key, ch.stances);
			created.push(ch.key);
		} catch (e) {
			console.error(`failed to create persona ${ch.key}:`, e);
			skipped++;
		}
	}

	if (created.length) {
		const form = await definitionsRepo.showForm(owner, id);
		if (form) {
			const rosterKeys = Array.from(
				new Set([...form.rosterKeys, ...created]),
			);
			await definitionsRepo.updateShow(owner, id, { ...form, rosterKeys });
		}
	}

	return c.redirect(`/shows/${id}?personae=${created.length}&skipped=${skipped}`);
});

/** A ready-to-create persona from an LLM character draft, with safe defaults. */
function generatedPersonaInput(
	key: string,
	ch: CharacterDraft,
	theme: string,
): PersonaInput {
	return {
		key,
		assetId: null,
		personaName: ch.personaName,
		language: "en-US",
		theme,
		themeVolume: 0.2,
		ttsProvider: "pocket",
		elevenLabsVoiceId: "",
		kokoroVoiceId: "",
		kokoroLanguage: "",
		qwenVoiceId: "",
		pocketVoiceId: "alba",
		pocketUseVoiceSample: false,
		size: 1000,
		posXRange: 0.6,
		posXOffset: 0.2,
		groupPosXRange: 0.2,
		groupPosXOffset: 0.5,
		mirrorable: false,
		newsRegion: "",
		newsTopics: [],
		ytCategoryCode: "",
		promptPersonality: ch.promptPersonality,
		promptVideoMeta: "",
		promptVideoMetaGivenNewsTmpl: "",
		promptScriptGuidelinesTmpl: "",
		stanceDefaultPrompt: ch.stanceDefaultPrompt,
		stances: ch.stances.map((name) => ({ name, facing: "camera" as const })),
	};
}

// Render a single episode now (no upload).
definitions.post("/shows/:id/episodes/:index/render", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	if (!(await definitionsRepo.show(owner, id)))
		return c.html(NotFound("show"), 404);
	const idx = Number(c.req.param("index"));
	const ep = (await loadManifest(id))?.episodes[idx];
	if (!ep) return c.html(NotFound("episode"), 404);
	await jobsRepo.triggerEpisodeRender(id, idx);
	return c.redirect(`/shows/${id}?episode=${idx + 1}&action=render`);
});

// Publish a single already-rendered episode to the show's platforms.
definitions.post("/shows/:id/episodes/:index/publish", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	if (!(await definitionsRepo.show(owner, id)))
		return c.html(NotFound("show"), 404);
	const idx = Number(c.req.param("index"));
	const ep = (await loadManifest(id))?.episodes[idx];
	if (!ep) return c.html(NotFound("episode"), 404);
	if (!ep.renderId)
		return c.redirect(`/shows/${id}?episode=${idx + 1}&action=notrendered`);
	await jobsRepo.triggerEpisodePublish(id, idx);
	return c.redirect(`/shows/${id}?episode=${idx + 1}&action=publish`);
});

/** Review table of a generated manifest's episodes. */
function Episodes({
	showId,
	episodes,
}: {
	showId: string;
	episodes: EpisodePlan[];
}) {
	return (
		<table>
			<thead>
				<tr>
					<th>#</th>
					<th>title</th>
					<th>cast</th>
					<th>lines</th>
					<th>status</th>
					<th>renderId</th>
						<th>actions</th>
				</tr>
			</thead>
			<tbody>
				{episodes.map((e) => (
					<tr>
						<td>{e.index + 1}</td>
						<td>
							<a href={`/shows/${showId}/episodes/${e.index}`}>{e.title}</a>
						</td>
						<td>{e.cast.join(", ")}</td>
						<td>{e.sentences.length}</td>
						<td>{e.status}</td>
						<td>{e.renderId ? <code>{e.renderId}</code> : "—"}</td>
						<td style="white-space:nowrap">
							<form
								method="post"
								action={`/shows/${showId}/episodes/${e.index}/render`}
								style="display:inline"
							>
								<button type="submit">render</button>
							</form>{" "}
							<form
								method="post"
								action={`/shows/${showId}/episodes/${e.index}/publish`}
								style="display:inline"
								onsubmit="return confirm('Publish this episode now?')"
							>
								<button type="submit" disabled={!e.renderId}>
									publish
								</button>
							</form>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

definitions.get("/shows/:id/episodes/:index", async (c) => {
	const owner = await currentOwner(c);
	const id = c.req.param("id");
	if (!(await definitionsRepo.show(owner, id)))
		return c.html(NotFound("show"), 404);
	const manifest = await loadManifest(id);
	const idx = Number(c.req.param("index"));
	const ep = manifest?.episodes.find((e) => e.index === idx);
	if (!ep) return c.html(NotFound("episode"), 404);
	return c.html(
		<Layout title={`Episode ${idx + 1} · ${id}`}>
			<p>
				<a href={`/shows/${id}`}>← {id}</a>
			</p>
			<Fields
				rows={[
					["title", ep.title],
					["status", ep.status],
					["renderId", ep.renderId ?? "—"],
					["cast", ep.cast],
					["hashtags", ep.hashtags],
					["description", ep.description],
				]}
			/>
			<h2>Script ({ep.sentences.length} lines)</h2>
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>speaker</th>
						<th>on screen</th>
						<th>illustration</th>
						<th>line</th>
					</tr>
				</thead>
				<tbody>
					{ep.sentences.map((line, i) => (
						<tr>
							<td>{i + 1}</td>
							<td>
								<code>{line.speakerId}</code>
							</td>
							<td>
								{line.appearances
									.map((a) => `${a.personaId}@${a.slot}:${a.stance}`)
									.join(", ")}
							</td>
							<td>{line.illustration}</td>
							<td>{line.sentence}</td>
						</tr>
					))}
				</tbody>
			</table>
		</Layout>,
	);
});

definitions.get("/shows/:id", async (c) => {
	const s = await definitionsRepo.show(await currentOwner(c), c.req.param("id"));
	if (!s) return c.html(NotFound("show"), 404);
	const manifest = await loadManifest(s.id);
	const queued = c.req.query("breakdown") === "queued";
	const personae = c.req.query("personae");
	const skipped = c.req.query("skipped");
	const personaeMsg =
		personae === "error"
			? "⚠️ Persona generation failed — check the server logs."
			: personae
				? `✅ Generated ${personae} persona(s)${
						skipped && skipped !== "0" ? `, skipped ${skipped} already-existing` : ""
					}. Open each one to draw its stances in the Stance Studio (they have placeholder art for now).`
				: null;
	const action = c.req.query("action");
	const epNo = c.req.query("episode");
	const actionMsg =
		action === "render"
			? `✅ Episode ${epNo} queued for rendering — refresh to watch its status.`
			: action === "publish"
				? `✅ Episode ${epNo} queued for publishing.`
				: action === "notrendered"
					? `⚠️ Episode ${epNo} hasn't been rendered yet — render it first.`
					: null;
	return c.html(
		<Layout title={`Show · ${s.id}`}>
			<p>
				<a href="/shows">← all shows</a> ·{" "}
				<a href={`/shows/${s.id}/edit`}>edit</a> · status:{" "}
				<strong>{s.status}</strong>
				{s.status === "in_production" ? (
					<>
						{" "}
						<ReopenShowForm showId={s.id} />
					</>
				) : null}
			</p>
			{c.req.query("reopened") ? (
				<p style="color:#8a6d3b">
					↩️ Reopened for editing — prose and cast are editable again; the
					previous episode manifest was discarded.
				</p>
			) : null}

			{personaeMsg ? (
				<p style={personae === "error" ? "color:#c0392b" : "color:#2e7d32"}>
					{personaeMsg}
				</p>
			) : null}
			<form
				method="post"
				action={`/shows/${s.id}/generate-personae`}
				style="margin:.5rem 0"
				onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Generating personae… (this can take a moment)';return true;"
			>
				<button type="submit">Generate personae from prose</button>
				<span style="font-size:.8rem;opacity:.7">
					{" "}
					reads the prose, drafts a persona per character, and adds them to the
					roster with placeholder art
				</span>
			</form>

			<h2>Episodes</h2>
			{queued || s.status === "breaking_down" ? (
				<p style="color:#2e7d32">
					✅ Breakdown running — prose and cast are locked until it finishes;
					refresh in a moment to review the episodes.
				</p>
			) : null}
			{c.req.query("breakdown") === "inprogress" ? (
				<p style="color:#8a6d3b">
					⏳ A breakdown is already running for this show — wait for it to finish.
				</p>
			) : null}
			{c.req.query("breakdown") === "noroster" ? (
				<p style="color:#c0392b">
					⚠️ This show has no personae in its roster — add some (or use “Generate
					personae from prose” above) before breaking it into episodes.
				</p>
			) : null}
			{actionMsg ? (
				<p style={action === "notrendered" ? "color:#c0392b" : "color:#2e7d32"}>
					{actionMsg}
				</p>
			) : null}
			<form
				method="post"
				action={`/shows/${s.id}/breakdown`}
				style="margin:.5rem 0"
				onsubmit="return confirm('Break the prose into episodes? This regenerates the manifest and resets episode progress.')"
			>
				<button type="submit">
					{manifest ? "Re-break into episodes" : "Break into episodes"}
				</button>
			</form>
			{manifest ? (
				<>
					<p style="opacity:.8">
						{manifest.episodes.length} episode(s), generated{" "}
						{manifest.createdAt}. Render an individual episode with its{" "}
						<strong>render</strong> button below, drip them via a show tick on
						the <a href="/runs">Runs</a> page, or schedule them.
					</p>
					<Episodes showId={s.id} episodes={manifest.episodes} />
				</>
			) : (
				<p style="opacity:.8">No manifest yet — break the prose into episodes to review them.</p>
			)}

			<h2>Definition</h2>
			<Fields
				rows={[
					["owner", s.owner],
					["id", s.id],
					["split", JSON.stringify(s.split)],
					["maxCastPerEpisode", s.maxCastPerEpisode],
					["channelId", s.channelId],
					["platforms", s.platforms],
					["theme", s.theme],
					["themeVolume", s.themeVolume],
					["satisfyingVideoCategory", s.satisfyingVideoCategory],
					["endPaddingDurationMs", s.endPaddingDurationMs],
					["ytCategoryCode", s.ytCategoryCode],
					["roster", s.roster],
					["prompt", s.prompt],
					["prose", s.prose],
				]}
			/>
		</Layout>,
	);
});

// ---- Form-body → schema-input normalisation ----------------------------

/** Persist an uploaded voice-cloning sample to `personae/<assetId>/voiceSample.mp3`. */
async function saveVoiceSample(body: Body, assetId: string): Promise<void> {
	const file = body["voiceSample"];
	if (!(file instanceof File) || file.size === 0) return;
	await Bun.s3.write(`personae/${assetId}/voiceSample.mp3`, file, {
		type: "audio/mpeg",
	});
}

/** Build the raw persona object zod validates. */
function buildPersonaRaw(body: Body): Record<string, unknown> {
	return {
		key: str(body, "key"),
		assetId: str(body, "assetId"),
		personaName: str(body, "personaName"),
		language: str(body, "language"),
		theme: str(body, "theme"),
		themeVolume: str(body, "themeVolume"),
		ttsProvider: str(body, "ttsProvider"),
		elevenLabsVoiceId: str(body, "elevenLabsVoiceId"),
		kokoroVoiceId: str(body, "kokoroVoiceId"),
		kokoroLanguage: str(body, "kokoroLanguage"),
		qwenVoiceId: str(body, "qwenVoiceId"),
		pocketVoiceId: str(body, "pocketVoiceId"),
		pocketUseVoiceSample: bool(body, "pocketUseVoiceSample"),
		size: str(body, "size"),
		posXRange: str(body, "posXRange"),
		posXOffset: str(body, "posXOffset"),
		groupPosXRange: str(body, "groupPosXRange"),
		groupPosXOffset: str(body, "groupPosXOffset"),
		mirrorable: bool(body, "mirrorable"),
		newsRegion: str(body, "newsRegion"),
		newsTopics: arr(body, "newsTopics"),
		ytCategoryCode: str(body, "ytCategoryCode"),
		promptPersonality: str(body, "promptPersonality"),
		promptVideoMeta: str(body, "promptVideoMeta"),
		promptVideoMetaGivenNewsTmpl: str(body, "promptVideoMetaGivenNewsTmpl"),
		promptScriptGuidelinesTmpl: str(body, "promptScriptGuidelinesTmpl"),
		// Stances are managed on the dedicated gallery, not this form.
		stances: [],
	};
}

function buildGroupRaw(body: Body): Record<string, unknown> {
	return {
		key: str(body, "key"),
		prompt: str(body, "prompt"),
		channelId: str(body, "channelId"),
		platforms: arr(body, "platforms"),
		theme: str(body, "theme"),
		themeVolume: str(body, "themeVolume"),
		satisfyingVideoCategory: str(body, "satisfyingVideoCategory"),
		endPaddingDurationMs: str(body, "endPaddingDurationMs"),
		personaKeys: arr(body, "personaKeys"),
	};
}

function buildShowRaw(body: Body): Record<string, unknown> {
	const type = str(body, "splitType");
	const split =
		type === "wordBudget"
			? { type, wordsPerEpisode: str(body, "wordsPerEpisode") }
			: type === "length"
				? { type, targetSeconds: str(body, "targetSeconds") }
				: { type: "episodeCount", count: str(body, "count") };
	return {
		key: str(body, "key"),
		prose: str(body, "prose"),
		prompt: str(body, "prompt"),
		split,
		maxCastPerEpisode: str(body, "maxCastPerEpisode"),
		channelId: str(body, "channelId"),
		platforms: arr(body, "platforms"),
		theme: str(body, "theme"),
		themeVolume: str(body, "themeVolume"),
		satisfyingVideoCategory: str(body, "satisfyingVideoCategory"),
		endPaddingDurationMs: str(body, "endPaddingDurationMs"),
		ytCategoryCode: str(body, "ytCategoryCode"),
		rosterKeys: arr(body, "rosterKeys"),
	};
}
