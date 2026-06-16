import { Hono } from "hono";
import { currentOwner } from "../currentOwner.ts";
import { type Body, str } from "../formBody.ts";
import { type MediaWrite, mediaRepo } from "../../repositories/media.ts";
import {
	SATISFYING_CATEGORIES,
	fieldErrors,
	isSafeSegment,
	mediaSchema,
} from "../validation.ts";
import { MediaForm, type MediaKind } from "../views/forms.tsx";
import { Layout } from "../views/layout.tsx";

/**
 * Generic CRUD + upload/preview routes for one media library (themes,
 * satisfying videos, ...). The `MediaKind` descriptor supplies the S3 location,
 * accepted file type and audio/video preview, so every library shares this code.
 * Mounted instances are exported at the bottom (e.g. `themes`).
 */
export function createMediaRoutes(desc: MediaKind): Hono {
	const r = new Hono();
	const s3Key = (key: string) => `${desc.s3Dir}/${key}.${desc.ext}`;
	const fileUrl = (key: string) => `${desc.base}/${encodeURIComponent(key)}/file`;

	/**
	 * Persist an uploaded file (optional: blank keeps the current one). Any file
	 * type is accepted; it is stored at the canonical key the renderer reads.
	 */
	async function saveUpload(body: Body, key: string): Promise<void> {
		const file = body.file;
		if (!(file instanceof File) || file.size === 0) return;
		await Bun.s3.write(s3Key(key), file, { type: desc.contentType });
	}

	function parse(body: Body): {
		raw: Record<string, unknown>;
		write?: MediaWrite;
		error?: Record<string, string>;
	} {
		const category = desc.categories ? str(body, "category") : "";
		const durationRaw = desc.hasDuration ? str(body, "durationSeconds") : "";
		const raw: Record<string, unknown> = {
			assetKey: str(body, "assetKey"),
			displayName: str(body, "displayName"),
			category,
			durationSeconds: durationRaw,
		};
		const parsed = mediaSchema.safeParse(raw);
		if (!parsed.success) return { raw, error: fieldErrors(parsed.error) };

		if (desc.categories && !desc.categories.includes(category)) {
			return { raw, error: { category: "pick a category" } };
		}
		let durationSeconds: number | null = null;
		if (desc.hasDuration) {
			const n = Number(durationRaw);
			if (!Number.isFinite(n) || n <= 0) {
				return { raw, error: { durationSeconds: "enter a positive number of seconds" } };
			}
			durationSeconds = Math.floor(n);
		}
		return {
			raw,
			write: {
				assetKey: parsed.data.assetKey,
				displayName: parsed.data.displayName,
				category: desc.categories ? category : null,
				durationSeconds,
			},
		};
	}

	r.get(desc.base, async (c) => {
		const owner = await currentOwner(c);
		const rows = await mediaRepo.list(owner.id, desc.kind);
		const present = await Promise.all(
			rows.map((m) => Bun.s3.exists(s3Key(m.assetKey)).catch(() => false)),
		);
		return c.html(
			<Layout title={desc.title}>
				<p>
					<a href={`${desc.base}/new`}>+ new {desc.unit}</a>
				</p>
				<p style="opacity:.8">{desc.blurb}</p>
				<table>
					<thead>
						<tr>
							<th>key</th>
							<th>name</th>
							{desc.categories ? <th>category</th> : null}
							<th>preview</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.map((m, i) => (
							<tr>
								<td>
									<code>{m.assetKey}</code>
								</td>
								<td>{m.displayName || "—"}</td>
								{desc.categories ? <td>{m.category || "—"}</td> : null}
								<td>
									{present[i] ? (
										desc.preview === "audio" ? (
											<audio controls preload="none" src={fileUrl(m.assetKey)} />
										) : (
											<video
												controls
												preload="none"
												src={fileUrl(m.assetKey)}
												class="media-prev"
											/>
										)
									) : (
										<span class="err">no file</span>
									)}
								</td>
								<td>
									<a href={`${desc.base}/${m.assetKey}/edit`}>edit</a>{" "}
									<form
										method="post"
										action={`${desc.base}/${m.assetKey}/delete`}
										style="display:inline"
										onsubmit={`return confirm('Delete this ${desc.unit} and its file?')`}
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

	r.get(`${desc.base}/new`, async (c) => {
		await currentOwner(c);
		return c.html(
			<Layout title={`New ${desc.unit}`}>
				<MediaForm action={desc.base} value={{}} errors={{}} isEdit={false} desc={desc} />
			</Layout>,
		);
	});

	r.post(desc.base, async (c) => {
		const owner = await currentOwner(c);
		const body = await c.req.parseBody();
		const { raw, write, error } = parse(body);
		const render = (errors: Record<string, string>) =>
			c.html(
				<Layout title={`New ${desc.unit}`}>
					<MediaForm action={desc.base} value={raw} errors={errors} isEdit={false} desc={desc} />
				</Layout>,
			);
		if (error || !write) return render(error ?? {});
		if (await mediaRepo.exists(owner.id, desc.kind, write.assetKey)) {
			return render({ assetKey: `"${write.assetKey}" already exists` });
		}
		await saveUpload(body, write.assetKey);
		await mediaRepo.create(owner.id, desc.kind, write);
		return c.redirect(desc.base);
	});

	r.get(`${desc.base}/:key/edit`, async (c) => {
		const owner = await currentOwner(c);
		const key = c.req.param("key");
		if (!isSafeSegment(key)) return c.body(null, 404);
		const row = await mediaRepo.get(owner.id, desc.kind, key);
		if (!row) {
			return c.html(
				<Layout title={`${desc.unit} not found`}>
					<p>No {desc.unit} with that id.</p>
				</Layout>,
				404,
			);
		}
		const has = await Bun.s3.exists(s3Key(key)).catch(() => false);
		return c.html(
			<Layout title={`Edit ${desc.unit} · ${key}`}>
				<MediaForm
					action={`${desc.base}/${key}`}
					value={{
						assetKey: row.assetKey,
						displayName: row.displayName,
						category: row.category ?? "",
						durationSeconds: row.durationSeconds ?? "",
						fileUrl: has ? fileUrl(key) : undefined,
					}}
					errors={{}}
					isEdit={true}
					desc={desc}
				/>
			</Layout>,
		);
	});

	r.post(`${desc.base}/:key`, async (c) => {
		const owner = await currentOwner(c);
		const key = c.req.param("key");
		if (!isSafeSegment(key)) return c.body(null, 404);
		const body = await c.req.parseBody();
		const { raw, write, error } = parse(body);
		const has = await Bun.s3.exists(s3Key(key)).catch(() => false);
		const render = (errors: Record<string, string>) =>
			c.html(
				<Layout title={`Edit ${desc.unit} · ${key}`}>
					<MediaForm
						action={`${desc.base}/${key}`}
						value={{ ...raw, assetKey: key, fileUrl: has ? fileUrl(key) : undefined }}
						errors={errors}
						isEdit={true}
						desc={desc}
					/>
				</Layout>,
			);
		if (error || !write) return render(error ?? {});
		await saveUpload(body, key);
		await mediaRepo.update(owner.id, desc.kind, key, { ...write, assetKey: key });
		return c.redirect(desc.base);
	});

	r.post(`${desc.base}/:key/delete`, async (c) => {
		const owner = await currentOwner(c);
		const key = c.req.param("key");
		if (!isSafeSegment(key)) return c.body(null, 404);
		await mediaRepo.delete(owner.id, desc.kind, key);
		await Bun.s3
			.file(s3Key(key))
			.delete()
			.catch(() => {});
		return c.redirect(desc.base);
	});

	// Stream the asset's bytes from S3 for the in-page preview.
	r.get(`${desc.base}/:key/file`, async (c) => {
		await currentOwner(c);
		const key = c.req.param("key");
		if (!isSafeSegment(key)) return c.body(null, 404);
		try {
			const buf = await Bun.s3.file(s3Key(key)).arrayBuffer();
			return c.body(buf, 200, {
				"content-type": desc.contentType,
				"cache-control": "no-store",
			});
		} catch {
			return c.body(null, 404);
		}
	});

	return r;
}

export const THEME_KIND: MediaKind = {
	kind: "theme",
	base: "/themes",
	title: "Themes",
	unit: "theme",
	blurb:
		"Background music tracks. Personae, groups and shows reference one by its key via their `theme` field",
	fileLabel: "Audio track",
	contentType: "audio/ogg",
	ext: "ogg",
	s3Dir: "assets/themes",
	preview: "audio",
};

export const themes = createMediaRoutes(THEME_KIND);

export const SATISFYING_KIND: MediaKind = {
	kind: "satisfying",
	base: "/satisfying",
	title: "Satisfying videos",
	unit: "clip",
	blurb:
		"Filler video clips shown under the content. Each belongs to a category; at render time a group/show's `satisfying video category` seed-picks one of its clips.",
	fileLabel: "Video clip",
	contentType: "video/mp4",
	ext: "mp4",
	s3Dir: "assets/satisfying",
	preview: "video",
	categories: [...SATISFYING_CATEGORIES],
	hasDuration: true,
};

export const satisfying = createMediaRoutes(SATISFYING_KIND);
