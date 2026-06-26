import { STANCE_MODELS } from "../../steps/generate_image.mts";
import type { LocationRow } from "../repositories/definitions.ts";

/** One Pexels search hit, pre-shaped by the route for the picker grid. */
export type PexelsPick = {
	thumb: string; // small preview image URL (grid)
	big: string; // larger preview to open in a new tab on click
	url: string; // the asset URL we'd download
	ext: string; // "jpg" | "mp4" | …
	kind: "image" | "video";
	w: number; // resolution the renderer will actually use
	h: number;
	meetsMin: boolean; // video file clears the renderer's ≥540×960 minimum
};

// Hover-zoom + click-to-open styling for the Pexels result grid.
const PEXELS_STYLE = `
.pexels-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:1rem; overflow:visible; }
.pexels-card { display:flex; flex-direction:column; gap:.4rem; overflow:visible; margin:0; }
.pexels-thumb { display:block; overflow:visible; line-height:0; }
.pexels-thumb img { width:100%; height:140px; object-fit:cover; border-radius:6px; background:#0001; transition:transform .15s ease, box-shadow .15s ease; }
.pexels-thumb:hover img { transform:scale(2.2); position:relative; z-index:30; box-shadow:0 8px 30px #0008; }
.pexels-meta { display:flex; justify-content:space-between; align-items:center; gap:.5rem; font-size:.78rem; opacity:.85; }
.pexels-meta .warn { color:#b9770e; cursor:help; }
`;

/** Gallery of a show's locations: a thumbnail per room, plus add/edit/delete. */
export function LocationGallery({
	showKey,
	locations,
	saved,
	deleted,
}: {
	showKey: string;
	locations: LocationRow[];
	saved?: string;
	deleted?: string;
}) {
	const base = `/shows/${encodeURIComponent(showKey)}/locations`;
	return (
		<div>
			<p>
				<a href={`/shows/${encodeURIComponent(showKey)}`}>← back to {showKey}</a>
			</p>
			<h2>Locations</h2>
			<p class="hint">
				Rooms a scene can happen in. Pick a background image or video for each —
				Phase 2 will let the writer tag each line with the room it happens in. Use
				“Generate locations from prose” on the show page to extract them automatically.
			</p>
			{saved ? <p style="color:#2e7d32">✅ saved “{saved}”.</p> : null}
			{deleted ? <p style="color:#8a6d3b">🗑️ deleted “{deleted}”.</p> : null}

			{locations.length === 0 ? (
				<p class="hint">No locations yet — add one below or generate them from the prose.</p>
			) : null}
			<div class="stance-grid">
				{locations.map((loc) => (
					<div class="stance-card">
						<a href={`${base}/${encodeURIComponent(loc.key)}/edit`}>
							{loc.assetKind === "video" ? (
								<video
									src={`${base}/${encodeURIComponent(loc.key)}/asset`}
									style="width:100%;aspect-ratio:1;object-fit:cover;background:#8881;border-radius:6px;display:block"
									muted
									loop
									autoplay
									playsinline
									preload="metadata"
								/>
							) : loc.assetKind === "image" ? (
								<img
									src={`${base}/${encodeURIComponent(loc.key)}/asset`}
									alt={loc.name}
									loading="lazy"
								/>
							) : (
								<span class="hint" style="display:grid;place-items:center;aspect-ratio:1;background:#0001">
									no background yet
								</span>
							)}
						</a>
						<div class="stance-card-meta">
							<strong>{loc.name || loc.key}</strong>
							<span class="hint">
								{loc.assetKind ? `${loc.source} · ${loc.assetKind}` : "empty"}
							</span>
						</div>
						<div class="actions">
							<a class="linkbtn" href={`${base}/${encodeURIComponent(loc.key)}/edit`}>
								edit
							</a>
							<form
								method="post"
								action={`${base}/${encodeURIComponent(loc.key)}/delete`}
								style="display:contents"
								onsubmit={`return confirm('Delete location ${loc.key}? This removes its background.')`}
							>
								<button type="submit" class="linkbtn">
									delete
								</button>
							</form>
						</div>
					</div>
				))}
			</div>

			<h3 style="margin-top:1.5rem">Add a room</h3>
			<form method="post" action={base} class="def">
				<label>
					key
					<input name="key" placeholder="kitchen (letters, digits, _ or -)" required />
				</label>
				<label>
					name
					<input name="name" placeholder="Kitchen" />
				</label>
				<div class="actions">
					<button type="submit">Add room</button>
				</div>
			</form>
		</div>
	);
}

/** Per-room editor: current background + three ways to set it (Pexels / upload / AI). */
export function LocationStudio({
	showKey,
	locKey,
	name,
	description,
	asset,
	prompt = "",
	draftToken,
	model = "flux2",
	error,
	pexelsQuery = "",
	pexelsKind = "video",
	pexelsResults,
	pexelsError,
}: {
	showKey: string;
	locKey: string;
	name: string;
	description: string;
	asset?: { kind: "image" | "video"; ext: string } | null;
	prompt?: string;
	draftToken?: string;
	model?: string;
	error?: string;
	pexelsQuery?: string;
	pexelsKind?: "image" | "video";
	pexelsResults?: PexelsPick[];
	pexelsError?: string;
}) {
	const base = `/shows/${encodeURIComponent(showKey)}/locations`;
	const assetSrc = `${base}/${encodeURIComponent(locKey)}/asset`;
	return (
		<div>
			<p>
				<a href={base}>← {showKey}'s locations</a>
			</p>
			<h2>Location: {name || locKey}</h2>
			{description ? <p class="hint">{description}</p> : null}
			{error ? <p class="err">{error}</p> : null}

			<div class="stances">
				<span class="stances-label">current background</span>
				{asset ? (
					asset.kind === "video" ? (
						<video
							src={assetSrc}
							style="max-width:320px;display:block;background:#0002"
							muted
							loop
							autoplay
							controls
						/>
					) : (
						<img src={assetSrc} alt={locKey} style="max-width:320px;display:block;background:#0002" />
					)
				) : (
					<p class="hint">No background chosen yet.</p>
				)}
			</div>

			{/* 1. Pexels picker --------------------------------------------- */}
			<h3>Search Pexels</h3>
			<form method="get" action={`${base}/${encodeURIComponent(locKey)}/edit`} class="def">
				<label>
					query
					<input name="pq" value={pexelsQuery} placeholder="e.g. cozy kitchen interior" />
				</label>
				<label>
					type
					<select name="pkind">
						<option value="video" selected={pexelsKind === "video"}>
							video
						</option>
						<option value="image" selected={pexelsKind === "image"}>
							photo
						</option>
					</select>
				</label>
				<div class="actions">
					<button type="submit">Search</button>
				</div>
			</form>
			{pexelsError ? <p class="err">{pexelsError}</p> : null}
			{pexelsResults ? (
				pexelsResults.length ? (
					<>
						<style dangerouslySetInnerHTML={{ __html: PEXELS_STYLE }} />
						<p class="hint">
							Hover to enlarge · click to open full size in a new tab. “Renderer picks” is
							the exact resolution the prod renderer would use for this clip.
						</p>
						<div class="pexels-grid">
							{pexelsResults.map((r) => (
								<form
									method="post"
									action={`${base}/${encodeURIComponent(locKey)}/pexels`}
									class="pexels-card"
								>
									<input type="hidden" name="url" value={r.url} />
									<input type="hidden" name="kind" value={r.kind} />
									<input type="hidden" name="ext" value={r.ext} />
									<a class="pexels-thumb" href={r.big} target="_blank" rel="noopener noreferrer">
										<img src={r.thumb} alt="" loading="lazy" />
									</a>
									<div class="pexels-meta">
										<span>
											renderer picks: <strong>{r.w}×{r.h}</strong>
										</span>
										{!r.meetsMin ? (
											<span class="warn" title="Below the renderer's 540×960 minimum — it may be upscaled.">
												⚠ low-res
											</span>
										) : null}
									</div>
									<button type="submit" class="linkbtn">
										use this
									</button>
								</form>
							))}
						</div>
					</>
				) : (
					<p class="hint">No results — try another query.</p>
				)
			) : null}

			{/* 2. Direct upload --------------------------------------------- */}
			<h3>Or upload your own</h3>
			<form
				method="post"
				action={`${base}/${encodeURIComponent(locKey)}/upload`}
				class="def"
				enctype="multipart/form-data"
			>
				<label>
					image or video
					<input type="file" name="file" accept="image/*,video/*" required />
				</label>
				<div class="actions">
					<button type="submit">Upload background</button>
				</div>
			</form>

			{/* 3. AI generate ----------------------------------------------- */}
			<h3>Or generate with AI (still image)</h3>
			<form
				method="post"
				action={`${base}/${encodeURIComponent(locKey)}/generate`}
				class="def"
			>
				<label>
					prompt
					<textarea name="prompt" rows={4} placeholder="describe the empty room / setting">
						{prompt}
					</textarea>
				</label>
				<label>
					model
					<select name="model">
						{STANCE_MODELS.filter((m) => m.noRef).map((m) => (
							<option value={m.id} selected={m.id === model}>
								{m.label}
							</option>
						))}
					</select>
				</label>
				<div class="actions">
					<button type="submit">{draftToken ? "Regenerate" : "Generate"}</button>
				</div>
			</form>
			{draftToken ? (
				<div class="stances">
					<span class="stances-label">preview</span>
					<img
						src={`${base}/${encodeURIComponent(locKey)}/draft/${encodeURIComponent(draftToken)}/png`}
						alt="generated background preview"
						style="max-width:320px;display:block;background:#0002"
					/>
					<form method="post" action={`${base}/${encodeURIComponent(locKey)}/save`} class="def">
						<input type="hidden" name="token" value={draftToken} />
						<div class="actions">
							<button type="submit">Use this background</button>
						</div>
					</form>
				</div>
			) : null}
		</div>
	);
}
