import { STANCE_MODELS } from "../../steps/generate_image.mts";
import { Area, Checkbox } from "./forms.tsx";

const FACINGS = ["camera", "left", "right"];

// Entrance-animation presets, mirrored from the renderer's registry
// (remotion-app/src/animations/registry.ts). Only the `in` phase has presets today.
const STANCE_IN_PRESETS = ["pop-default", "shake"];

export type StanceStudioProps = {
	personaKey: string;
	personaName: string;
	stanceNames: string[];
	prompt?: string;
	referenceStance?: string;
	model?: string;
	draftToken?: string;
	error?: string;
	/** Set when editing an existing stance: the name is fixed and its image is replaced. */
	stanceName?: string;
	facing?: string;
	/** The stance's current entrance-animation preset ("" = none). */
	animationIn?: string;
};

/** Per-stance gallery: a thumbnail + edit/delete per stance, plus add. */
export function StanceGallery({
	personaKey,
	personaName,
	stances,
	defaultPrompt,
	mirrorable,
	saved,
	deleted,
	settingsSaved,
}: {
	personaKey: string;
	personaName: string;
	stances: { name: string; facing?: string }[];
	defaultPrompt: string;
	mirrorable: boolean;
	saved?: string;
	deleted?: string;
	settingsSaved?: boolean;
}) {
	const base = `/personae/${encodeURIComponent(personaKey)}/stances`;
	return (
		<div>
			<p>
				<a href={`/personae/${encodeURIComponent(personaKey)}/edit`}>← back to {personaName}</a>
			</p>
			<h2>Stances</h2>
			{saved ? <p style="color:#2e7d32">✅ saved “{saved}”.</p> : null}
			{deleted ? <p style="color:#8a6d3b">🗑️ deleted “{deleted}”.</p> : null}
			{settingsSaved ? <p style="color:#2e7d32">✅ stance settings saved.</p> : null}

			<form method="post" action={`${base}/settings`} class="def">
				<Area
					name="defaultPrompt"
					label="default stance prompt"
					value={{ defaultPrompt }}
					errors={{}}
					rows={4}
					placeholder="The character's look, reused for every stance — e.g. 'a stout chestnut-brown bolete mushroom character, big friendly eyes, cartoon style'. Pre-fills the generate box."
				/>
				<Checkbox
					name="mirrorable"
					label="mirrorable (the character may be flipped horizontally)"
					value={{ mirrorable }}
				/>
				<div class="actions">
					<button type="submit">Save stance settings</button>
				</div>
			</form>
			{stances.length === 0 ? (
				<p class="hint">
					No stances yet — add one. A persona needs at least one stance to render.
				</p>
			) : null}
			<div class="stance-grid">
				{stances.map((st) => (
					<div class="stance-card">
						<a href={`${base}/${encodeURIComponent(st.name)}/edit`}>
							<img
								src={`${base}/${encodeURIComponent(st.name)}/png`}
								alt={st.name}
								loading="lazy"
							/>
						</a>
						<div class="stance-card-meta">
							<strong>{st.name}</strong>
							<span class="hint">{st.facing ?? "camera"}</span>
						</div>
						<div class="actions">
							<a class="linkbtn" href={`${base}/${encodeURIComponent(st.name)}/edit`}>
								edit
							</a>
							<form
								method="post"
								action={`${base}/${encodeURIComponent(st.name)}/delete`}
								style="display:contents"
								onsubmit={`return confirm('Delete stance ${st.name}? This removes its image.')`}
							>
								<button type="submit" class="linkbtn">
									delete
								</button>
							</form>
						</div>
					</div>
				))}
			</div>
			<p style="margin-top:1rem">
				<a class="linkbtn" href={`${base}/new`}>+ Add stance</a>
			</p>
		</div>
	);
}

/**
 * Add/replace a single stance. Server-rendered: a Generate form posts back and,
 * when a draft exists, shows a preview + Save; a separate form uploads a final
 * PNG directly. In edit mode the name is fixed, the current image is shown, and
 * facing can be changed on its own. No client fetch — each step is a plain POST.
 */
export function StanceStudio({
	personaKey,
	personaName,
	stanceNames,
	prompt = "",
	referenceStance = "",
	model = "flux2",
	draftToken,
	error,
	stanceName,
	facing = "camera",
	animationIn = "",
}: StanceStudioProps) {
	const base = `/personae/${encodeURIComponent(personaKey)}/stances`;
	const editing = !!stanceName;
	const facingSelect = (
		<select name="facing">
			{FACINGS.map((f) => (
				<option value={f} selected={f === facing}>
					{f}
				</option>
			))}
		</select>
	);
	const nameField = editing ? (
		<input type="hidden" name="name" value={stanceName} />
	) : (
		<label>
			stance name
			<input name="name" placeholder="stance name (letters, digits, _ or -)" required />
		</label>
	);
	return (
		<div>
			<p>
				<a href={base}>← {personaName}'s stances</a>
			</p>
			<h2>{editing ? `Edit stance: ${stanceName}` : "New stance"}</h2>
			{error ? <p class="err">{error}</p> : null}

			{editing ? (
				<div class="stances">
					<span class="stances-label">current image</span>
					<img
						src={`${base}/${encodeURIComponent(stanceName)}/png`}
						alt={stanceName}
						style="max-width:240px;display:block;background:#0002"
					/>
					<form method="post" action={`${base}/${encodeURIComponent(stanceName)}/meta`} class="def">
						<label>
							facing
							{facingSelect}
						</label>
						<label>
							entrance animation
							<select name="animationIn">
								<option value="" selected={!animationIn}>
									(none)
								</option>
								{STANCE_IN_PRESETS.map((p) => (
									<option value={p} selected={p === animationIn}>
										{p}
									</option>
								))}
							</select>
						</label>
						<div class="actions">
							<button type="submit">Save facing &amp; animation</button>
						</div>
					</form>
				</div>
			) : null}

			<h3>{editing ? "Replace image with AI" : "Generate with AI"}</h3>
			<form method="post" action={`${base}/generate`} class="def" enctype="multipart/form-data">
				{editing ? <input type="hidden" name="stanceName" value={stanceName} /> : null}
				<label>
					prompt
					<textarea name="prompt" rows={5} placeholder="e.g. a red mushroom character pointing to the right, smug expression">
						{prompt}
					</textarea>
				</label>
				<label>
					reference stance (for a consistent character)
					<select name="referenceStance">
						<option value="" selected={referenceStance === ""}>
							(none)
						</option>
						{stanceNames.map((n) => (
							<option value={n} selected={n === referenceStance}>
								{n}
							</option>
						))}
					</select>
				</label>
				<label>
					or upload a reference image
					<input type="file" name="referenceUpload" accept="image/*" />
				</label>
				<label>
					model
					<select name="model" id="stance-model">
						{STANCE_MODELS.map((m) => (
							<option
								value={m.id}
								selected={m.id === model}
								data-ref={m.ref ? "1" : "0"}
								data-noref={m.noRef ? "1" : "0"}
							>
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
						src={`${base}/draft/${encodeURIComponent(draftToken)}/png`}
						alt="generated stance preview"
						style="max-width:320px;display:block;background:#0002"
					/>
					<form method="post" action={`${base}/save`} class="def">
						<input type="hidden" name="token" value={draftToken} />
						{editing ? <input type="hidden" name="stanceName" value={stanceName} /> : null}
						{nameField}
						<label>
							facing
							{facingSelect}
						</label>
						<div class="actions">
							<button type="submit">{editing ? "Replace image" : "Save as new stance"}</button>
						</div>
					</form>
				</div>
			) : null}

			<h3>{editing ? "Or upload a replacement PNG" : "Or upload a PNG directly"}</h3>
			<form method="post" action={`${base}/upload`} class="def" enctype="multipart/form-data">
				{editing ? <input type="hidden" name="stanceName" value={stanceName} /> : null}
				{nameField}
				<label>
					facing
					{facingSelect}
				</label>
				<label>
					PNG
					<input type="file" name="image" accept="image/png" required />
				</label>
				<div class="actions">
					<button type="submit">{editing ? "Replace image" : "Add stance"}</button>
				</div>
			</form>
			<script dangerouslySetInnerHTML={{ __html: MODEL_FILTER_SCRIPT }} />
		</div>
	);
}

// Show only models that fit the current mode: with a reference chosen we're
// editing (data-ref), otherwise generating from scratch (data-noref). Keeps the
// selection valid, switching to the first relevant option when it falls out.
const MODEL_FILTER_SCRIPT = `
(function () {
  var refSel = document.querySelector('select[name="referenceStance"]');
  var refFile = document.querySelector('input[name="referenceUpload"]');
  var modelSel = document.getElementById('stance-model');
  if (!refSel || !modelSel) return;
  function hasRef() {
    if (refSel.value) return true;
    return !!(refFile && refFile.files && refFile.files.length);
  }
  function sync() {
    var edit = hasRef(), first = null, opts = modelSel.options;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var ok = (edit ? o.getAttribute('data-ref') : o.getAttribute('data-noref')) === '1';
      o.hidden = !ok; o.disabled = !ok;
      if (ok && !first) first = o;
    }
    var sel = modelSel.selectedOptions[0];
    if (first && (!sel || sel.hidden)) first.selected = true;
  }
  refSel.addEventListener('change', sync);
  if (refFile) refFile.addEventListener('change', sync);
  sync();
})();
`;
