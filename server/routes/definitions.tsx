import { Hono } from "hono";
import { mediaRepo } from "../../repositories/media.ts";
import type { EpisodePlan } from "../../steps/generate_series.mts";
import { loadManifest } from "../../utils/seriesManifest.ts";
import { currentOwner } from "../currentOwner.ts";
import { type Body, arr, bool, str } from "../formBody.ts";
import { DefinitionError, definitionsRepo } from "../repositories/definitions.ts";
import { jobsRepo } from "../repositories/jobs.ts";
import {
	fieldErrors,
	groupSchema,
	personaSchema,
	showSchema,
} from "../validation.ts";
import { GroupForm, PersonaForm, ShowForm } from "../views/forms.tsx";
import { Layout } from "../views/layout.tsx";

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
		await saveStancePngs(body, parsed.data.assetId ?? parsed.data.key);
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
		await saveStancePngs(body, parsed.data.assetId ?? key);
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
	const form = await definitionsRepo.personaForm(owner, key);
	if (!form) return c.body(null, 404);
	const assetId = form.assetId || key;
	const stance = c.req.param("stance");
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

definitions.get("/personae/:id", async (c) => {
	const p = await definitionsRepo.persona(await currentOwner(c), c.req.param("id"));
	if (!p) return c.html(NotFound("persona"), 404);
	return c.html(
		<Layout title={`Persona · ${p.personaName}`}>
			<p>
				<a href="/personae">← all personae</a> ·{" "}
				<a href={`/personae/${p.id}/edit`}>edit</a>
			</p>
			<Fields
				rows={[
					["owner", p.owner],
					["id", p.id],
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
	const personaOptions = await definitionsRepo.personaOptions(owner);
	const themeKeys = await listThemeKeys(owner.id);
	return c.html(
		<Layout title={`Edit show · ${key}`}>
			<ShowForm action={`/shows/${key}`} value={value} errors={{}} isEdit={true} personaOptions={personaOptions} themeKeys={themeKeys} />
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
	const render = (errors: Record<string, string>) =>
		c.html(
			<Layout title={`Edit show · ${key}`}>
				<ShowForm action={`/shows/${key}`} value={raw} errors={errors} isEdit={true} personaOptions={personaOptions} themeKeys={themeKeys} />
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
	if (!(await definitionsRepo.show(owner, id)))
		return c.html(NotFound("show"), 404);
	await jobsRepo.triggerShowBreakdown(id);
	return c.redirect(`/shows/${id}?breakdown=queued`);
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
					<th>render</th>
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
						<th>persona</th>
						<th>stance</th>
						<th>illustration</th>
						<th>line</th>
					</tr>
				</thead>
				<tbody>
					{ep.sentences.map((line, i) => (
						<tr>
							<td>{i + 1}</td>
							<td>
								<code>{line.personaId}</code>
							</td>
							<td>{line.stance}</td>
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
	return c.html(
		<Layout title={`Show · ${s.id}`}>
			<p>
				<a href="/shows">← all shows</a> ·{" "}
				<a href={`/shows/${s.id}/edit`}>edit</a>
			</p>

			<h2>Episodes</h2>
			{queued ? (
				<p style="color:#2e7d32">
					✅ Breakdown queued — refresh in a moment to review the episodes.
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
						{manifest.createdAt}. Render them via a show tick on the{" "}
						<a href="/runs">Runs</a> page or a schedule.
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

/**
 * Reassemble the stances array from the editor's `stance_*_<n>` field groups.
 * Indices are sparse (rows can be removed client-side), so collect whatever
 * `stance_name_<n>` keys exist, drop blank rows, and keep stable order.
 */
function parseStances(body: Body): Record<string, unknown>[] {
	const indices = new Set<number>();
	for (const k of Object.keys(body)) {
		const m = /^stance_name_(\d+)$/.exec(k);
		if (m) indices.add(Number(m[1]));
	}
	return [...indices]
		.sort((a, b) => a - b)
		.map((i) => {
			const name = str(body, `stance_name_${i}`).trim();
			if (!name) return null;
			const preset = str(body, `stance_anim_in_${i}`).trim();
			const stance: Record<string, unknown> = { name };
			if (preset) stance.animations = { in: { preset } };
			return stance;
		})
		.filter((st): st is Record<string, unknown> => st !== null);
}

/** Persist any chosen stance PNGs to `personae/<assetId>/<stance>.png` in S3. */
async function saveStancePngs(body: Body, assetId: string): Promise<void> {
	for (const k of Object.keys(body)) {
		const m = /^stance_png_(\d+)$/.exec(k);
		if (!m) continue;
		const file = body[k];
		if (!(file instanceof File) || file.size === 0) continue;
		const name = str(body, `stance_name_${m[1]}`).trim();
		if (!name) continue;
		await Bun.s3.write(`personae/${assetId}/${name}.png`, file, {
			type: "image/png",
		});
	}
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
		newsRegion: str(body, "newsRegion"),
		newsTopics: arr(body, "newsTopics"),
		ytCategoryCode: str(body, "ytCategoryCode"),
		promptPersonality: str(body, "promptPersonality"),
		promptVideoMeta: str(body, "promptVideoMeta"),
		promptVideoMetaGivenNewsTmpl: str(body, "promptVideoMetaGivenNewsTmpl"),
		promptScriptGuidelinesTmpl: str(body, "promptScriptGuidelinesTmpl"),
		stances: parseStances(body),
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
