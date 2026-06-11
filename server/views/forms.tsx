import { NEWS_CATEGORIES } from "../../steps/news/currents.ts";
import type { GroupInput, PersonaInput, ShowInput } from "../validation.ts";

/**
 * Form views for definition CRUD. Components render just the <form>; routes wrap
 * them in the Layout. `value` prefills (edit, or repopulate after a validation
 * error) and `errors` is the `{ field: message }` map from zod / DefinitionError.
 */

type Vals = Record<string, unknown>;
type Errs = Record<string, string>;

const s = (v: unknown): string => (v == null ? "" : String(v));

function Err({ errors, name }: { errors: Errs; name: string }) {
	return errors[name] ? <span class="err">{errors[name]}</span> : null;
}

function Text({
	name,
	label,
	value,
	errors,
	readonly,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	readonly?: boolean;
}) {
	return (
		<label>
			<span>{label}</span>
			<input name={name} value={s(value[name])} readonly={readonly} />
			<Err errors={errors} name={name} />
		</label>
	);
}

function Num({
	name,
	label,
	value,
	errors,
	step,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	step?: string;
}) {
	return (
		<label>
			<span>{label}</span>
			<input type="number" step={step ?? "any"} name={name} value={s(value[name])} />
			<Err errors={errors} name={name} />
		</label>
	);
}

function Area({
	name,
	label,
	value,
	errors,
	rows,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	rows?: number;
}) {
	return (
		<label>
			<span>{label}</span>
			<textarea name={name} rows={rows ?? 4}>
				{s(value[name])}
			</textarea>
			<Err errors={errors} name={name} />
		</label>
	);
}

function Select({
	name,
	label,
	value,
	errors,
	options,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	options: string[];
}) {
	const cur = s(value[name]);
	return (
		<label>
			<span>{label}</span>
			<select name={name}>
				{options.map((o) => (
					<option value={o} selected={o === cur}>
						{o}
					</option>
				))}
			</select>
			<Err errors={errors} name={name} />
		</label>
	);
}

function Checkbox({
	name,
	label,
	value,
}: {
	name: string;
	label: string;
	value: Vals;
}) {
	return (
		<label class="inline">
			<input type="checkbox" name={name} checked={Boolean(value[name])} />
			<span>{label}</span>
		</label>
	);
}

/** Repeated checkboxes → parseBody({ all: true }) yields an array under `name`. */
function CheckGroup({
	name,
	label,
	value,
	errors,
	options,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	options: { key: string; label: string }[];
}) {
	const selected = new Set((value[name] as string[] | undefined) ?? []);
	return (
		<label>
			<span>{label}</span>
			<span class="checkgroup">
				{options.map((o) => (
					<label class="inline">
						<input
							type="checkbox"
							name={name}
							value={o.key}
							checked={selected.has(o.key)}
						/>
						<span>{o.label}</span>
					</label>
				))}
			</span>
			<Err errors={errors} name={name} />
		</label>
	);
}

/** Theme key as a combobox: free text + a datalist of saved themes. */
function ThemeField({
	value,
	errors,
	themeKeys,
}: {
	value: Vals;
	errors: Errs;
	themeKeys: string[];
}) {
	return (
		<label>
			<span>theme (background music — pick a saved one or type a key)</span>
			<input name="theme" value={s(value.theme)} list="theme-keys" />
			{themeKeys.length ? (
				<datalist id="theme-keys">
					{themeKeys.map((k) => (
						<option value={k} />
					))}
				</datalist>
			) : null}
			<Err errors={errors} name="theme" />
		</label>
	);
}

function Actions({ cancelHref }: { cancelHref: string }) {
	return (
		<div class="actions">
			<button type="submit">Save</button>
			<a href={cancelHref}>Cancel</a>
		</div>
	);
}

// ---- Stance editor -----------------------------------------------------

/**
 * Entrance-animation presets a stance can pick, mirrored from the renderer's
 * registry (`remotion-app/src/animations/registry.ts`). Only the `in` phase has
 * presets today; `active`/`out` are intentionally omitted until ones exist.
 */
const STANCE_IN_PRESETS = ["pop-default", "shake"];

/** One stance: name + entrance animation + PNG (live preview, existing thumb). */
function StanceRow({
	i,
	name,
	animIn,
	previewSrc,
}: {
	i: number | string;
	name: string;
	animIn: string;
	previewSrc?: string;
}) {
	return (
		<div class="stance-row">
			<input name={`stance_name_${i}`} value={name} placeholder="stance name" />
			<select name={`stance_anim_in_${i}`}>
				<option value="" selected={animIn === ""}>
					(no entrance animation)
				</option>
				{STANCE_IN_PRESETS.map((p) => (
					<option value={p} selected={p === animIn}>
						{p}
					</option>
				))}
			</select>
			<span class="stance-png">
				<img
					class="stance-prev"
					src={previewSrc}
					alt=""
					style={previewSrc ? "" : "display:none"}
				/>
				<input
					type="file"
					name={`stance_png_${i}`}
					accept="image/png"
					class="stance-file"
				/>
			</span>
			<button type="button" class="linkbtn stance-del">
				remove
			</button>
		</div>
	);
}

/**
 * Dynamic list of stance rows. Existing rows render their current PNG (served by
 * `GET /personae/:id/stances/:stance/png`); the `<template>` + inline script add
 * blank rows client-side and show a local preview the moment a file is chosen.
 * The `__I__` placeholder is reindexed per added row so each input name is unique;
 * the route reassembles stances from the `stance_*_<n>` field groups.
 */
function StanceEditor({
	stances,
	personaKey,
	isEdit,
}: {
	stances: unknown;
	personaKey: string;
	isEdit: boolean;
}) {
	const list = (Array.isArray(stances) ? stances : []) as Vals[];
	const rows = list.length ? list : [{}];
	const previewFor = (name: string) =>
		isEdit && personaKey && name
			? `/personae/${encodeURIComponent(personaKey)}/stances/${encodeURIComponent(name)}/png`
			: undefined;
	return (
		<div class="stances">
			<span class="stances-label">stances — name · entrance animation · PNG</span>
			<div id="stances-list">
				{rows.map((st, i) => {
					const name = s(st.name);
					const anim = st.animations as Vals | undefined;
					const animIn = anim ? s((anim.in as Vals | undefined)?.preset) : "";
					return (
						<StanceRow i={i} name={name} animIn={animIn} previewSrc={previewFor(name)} />
					);
				})}
			</div>
			<button type="button" id="stance-add" class="linkbtn">
				+ add stance
			</button>
			<template id="stance-row-tmpl">
				<StanceRow i="__I__" name="" animIn="" />
			</template>
			<script dangerouslySetInnerHTML={{ __html: STANCE_SCRIPT }} />
		</div>
	);
}

const STANCE_SCRIPT = `
(function () {
  var list = document.getElementById('stances-list');
  var tmpl = document.getElementById('stance-row-tmpl');
  var add = document.getElementById('stance-add');
  if (!list || !tmpl || !add) return;
  var idx = list.querySelectorAll('.stance-row').length;
  function wire(row) {
    var del = row.querySelector('.stance-del');
    if (del) del.addEventListener('click', function () { row.remove(); });
    var file = row.querySelector('.stance-file');
    var img = row.querySelector('.stance-prev');
    if (file && img) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (f) { img.src = URL.createObjectURL(f); img.style.display = ''; }
    });
  }
  Array.prototype.forEach.call(list.querySelectorAll('.stance-row'), wire);
  add.addEventListener('click', function () {
    var tmp = document.createElement('div');
    tmp.innerHTML = tmpl.innerHTML.replace(/__I__/g, String(idx++)).trim();
    var row = tmp.firstElementChild;
    if (!row) return;
    list.appendChild(row);
    wire(row);
  });
})();
`;

// ---- Persona -----------------------------------------------------------

export function PersonaForm({
	action,
	value,
	errors,
	isEdit,
	themeKeys = [],
}: {
	action: string;
	value: Partial<PersonaInput> | Vals;
	errors: Errs;
	isEdit: boolean;
	themeKeys?: string[];
}) {
	const v = value as Vals;
	return (
		<form method="post" action={action} class="def" enctype="multipart/form-data">
			<Err errors={errors} name="_" />
			<Text name="key" label="key" value={v} errors={errors} readonly={isEdit} />
			<Text name="personaName" label="display name" value={v} errors={errors} />
			<Text name="assetId" label="asset id (blank = key)" value={v} errors={errors} />
			<Select name="language" label="language" value={v} errors={errors} options={["en-US", "fr-FR"]} />
			<ThemeField value={v} errors={errors} themeKeys={themeKeys} />
			<Num name="themeVolume" label="theme volume (0–1)" value={v} errors={errors} />
			<Select name="ttsProvider" label="TTS provider" value={v} errors={errors} options={["elevenlabs", "kokoro", "qwen", "pocket"]} />
			<Text name="elevenLabsVoiceId" label="elevenlabs voice id" value={v} errors={errors} />
			<Text name="kokoroVoiceId" label="kokoro voice id" value={v} errors={errors} />
			<Text name="kokoroLanguage" label="kokoro language" value={v} errors={errors} />
			<Text name="qwenVoiceId" label="qwen voice id" value={v} errors={errors} />
			<Text name="pocketVoiceId" label="pocket voice id" value={v} errors={errors} />
			<Checkbox name="pocketUseVoiceSample" label="pocket: use voice sample" value={v} />
			<Num name="size" label="size" value={v} errors={errors} />
			<Num name="posXRange" label="posX range" value={v} errors={errors} />
			<Num name="posXOffset" label="posX offset" value={v} errors={errors} />
			<Num name="groupPosXRange" label="group posX range" value={v} errors={errors} />
			<Num name="groupPosXOffset" label="group posX offset" value={v} errors={errors} />
			<Text name="newsRegion" label="news region" value={v} errors={errors} />
			<CheckGroup
				name="newsTopics"
				label="news topics"
				value={v}
				errors={errors}
				options={NEWS_CATEGORIES.map((c) => ({ key: c, label: c }))}
			/>
			<Text name="ytCategoryCode" label="YouTube category code" value={v} errors={errors} />
			<Area name="promptPersonality" label="prompt: personality" value={v} errors={errors} rows={4} />
			<Area name="promptVideoMeta" label="prompt: video meta (no news)" value={v} errors={errors} rows={4} />
			<Area name="promptVideoMetaGivenNewsTmpl" label="template: video meta given news (Eta)" value={v} errors={errors} rows={6} />
			<Area name="promptScriptGuidelinesTmpl" label="template: script guidelines (Eta)" value={v} errors={errors} rows={6} />
			<StanceEditor stances={v.stances} personaKey={s(v.key)} isEdit={isEdit} />
			<Err errors={errors} name="stances" />
			<Actions cancelHref="/personae" />
		</form>
	);
}

// ---- Group -------------------------------------------------------------

export function GroupForm({
	action,
	value,
	errors,
	isEdit,
	personaOptions,
	themeKeys = [],
}: {
	action: string;
	value: Partial<GroupInput> | Vals;
	errors: Errs;
	isEdit: boolean;
	personaOptions: { key: string; name: string }[];
	themeKeys?: string[];
}) {
	const v = value as Vals;
	return (
		<form method="post" action={action} class="def">
			<Err errors={errors} name="_" />
			<Text name="key" label="key" value={v} errors={errors} readonly={isEdit} />
			<Text name="channelId" label="channel id" value={v} errors={errors} />
			<CheckGroup name="platforms" label="platforms" value={v} errors={errors} options={PLATFORMS} />
			<ThemeField value={v} errors={errors} themeKeys={themeKeys} />
			<Num name="themeVolume" label="theme volume (0–1)" value={v} errors={errors} />
			<Select name="satisfyingVideoCategory" label="satisfying video category" value={v} errors={errors} options={["satisfying", "gameplay", "america"]} />
			<Num name="endPaddingDurationMs" label="end padding (ms)" value={v} errors={errors} />
			<CheckGroup
				name="personaKeys"
				label="personae (order = on-screen order)"
				value={v}
				errors={errors}
				options={personaOptions.map((p) => ({ key: p.key, label: `${p.key} — ${p.name}` }))}
			/>
			<Area name="prompt" label="prompt" value={v} errors={errors} rows={6} />
			<Actions cancelHref="/groups" />
		</form>
	);
}

// ---- Show --------------------------------------------------------------

export function ShowForm({
	action,
	value,
	errors,
	isEdit,
	personaOptions,
	themeKeys = [],
}: {
	action: string;
	value: Partial<ShowInput> | Vals;
	errors: Errs;
	isEdit: boolean;
	personaOptions: { key: string; name: string }[];
	themeKeys?: string[];
}) {
	const v = value as Vals;
	const split = (v.split ?? {}) as Record<string, unknown>;
	const splitVals: Vals = {
		splitType: split.type ?? "episodeCount",
		count: split.count,
		wordsPerEpisode: split.wordsPerEpisode,
		targetSeconds: split.targetSeconds,
	};
	return (
		<form method="post" action={action} class="def">
			<Err errors={errors} name="_" />
			<Text name="key" label="key" value={v} errors={errors} readonly={isEdit} />
			<Text name="channelId" label="channel id" value={v} errors={errors} />
			<CheckGroup name="platforms" label="platforms" value={v} errors={errors} options={PLATFORMS} />
			<ThemeField value={v} errors={errors} themeKeys={themeKeys} />
			<Num name="themeVolume" label="theme volume (0–1)" value={v} errors={errors} />
			<Select name="satisfyingVideoCategory" label="satisfying video category" value={v} errors={errors} options={["satisfying", "gameplay", "america"]} />
			<Num name="endPaddingDurationMs" label="end padding (ms)" value={v} errors={errors} />
			<Text name="ytCategoryCode" label="YouTube category code" value={v} errors={errors} />
			<Num name="maxCastPerEpisode" label="max cast per episode" value={v} errors={errors} />
			<Select name="splitType" label="split type" value={splitVals} errors={errors} options={["episodeCount", "wordBudget", "length"]} />
			<Num name="count" label="split: episode count" value={splitVals} errors={errors} />
			<Num name="wordsPerEpisode" label="split: words per episode" value={splitVals} errors={errors} />
			<Num name="targetSeconds" label="split: target seconds" value={splitVals} errors={errors} />
			<Err errors={errors} name="split" />
			<CheckGroup
				name="rosterKeys"
				label="roster"
				value={v}
				errors={errors}
				options={personaOptions.map((p) => ({ key: p.key, label: `${p.key} — ${p.name}` }))}
			/>
			<Area name="prompt" label="prompt (tone / dynamics)" value={v} errors={errors} rows={4} />
			<Area name="prose" label="prose (the long script to break into episodes)" value={v} errors={errors} rows={10} />
			<Actions cancelHref="/shows" />
		</form>
	);
}

// ---- Channel -----------------------------------------------------------

export function ChannelForm({
	action,
	value,
	errors,
	isEdit,
}: {
	action: string;
	value: Vals;
	errors: Errs;
	isEdit: boolean;
}) {
	const v = value;
	const hasGoogle = Boolean(v.hasGoogleTokens);
	const hasIgPw = Boolean(v.hasIgPassword);
	return (
		<form method="post" action={action} class="def">
			<Err errors={errors} name="_" />
			<Text name="channelKey" label="channel id (key used in groups/shows)" value={v} errors={errors} readonly={isEdit} />
			<Text name="displayName" label="display name (optional)" value={v} errors={errors} />
			<Text name="igUsername" label="Instagram username (optional)" value={v} errors={errors} />
			<label>
				<span>
					Instagram password — {hasIgPw ? "set" : "not set"} (leave blank to keep current)
				</span>
				<input type="password" name="igPassword" value="" autocomplete="new-password" />
				<Err errors={errors} name="igPassword" />
			</label>
			<label>
				<span>
					Google tokens JSON — {hasGoogle ? "set" : "not set"} (leave blank to keep current; paste a tokens object to replace)
				</span>
				<textarea name="googleTokens" rows={6} placeholder="{ &quot;access_token&quot;: ..., &quot;refresh_token&quot;: ... }" />
				<Err errors={errors} name="googleTokens" />
			</label>
			<Actions cancelHref="/channels" />
		</form>
	);
}

// ---- Media library -----------------------------------------------------

/**
 * Describes one media library (themes, satisfying videos, ...). Drives the
 * generic CRUD routes and this form: where bytes live in S3, what to accept,
 * and whether to preview as audio or video. One descriptor per `kind`.
 */
export type MediaKind = {
	kind: string;
	base: string; // route + cancel href, e.g. "/themes"
	title: string; // page title, e.g. "Themes"
	unit: string; // singular noun, e.g. "theme"
	blurb: string; // one-line page description
	fileLabel: string; // upload field label, e.g. "Audio track"
	contentType: string; // served + written content-type
	ext: string; // file extension without dot, e.g. "ogg"
	s3Dir: string; // S3 prefix, e.g. "assets/themes"
	preview: "audio" | "video";
	// Optional kind-specific metadata (used by satisfying clips; themes omit).
	categories?: string[]; // if set → a required category <select>
	hasDuration?: boolean; // if set → a "source duration (seconds)" field
};

export function MediaForm({
	action,
	value,
	errors,
	isEdit,
	desc,
}: {
	action: string;
	value: Vals;
	errors: Errs;
	isEdit: boolean;
	desc: MediaKind;
}) {
	const v = value;
	const fileUrl = v.fileUrl ? s(v.fileUrl) : undefined;
	return (
		<form method="post" action={action} class="def" enctype="multipart/form-data">
			<Err errors={errors} name="_" />
			<Text
				name="assetKey"
				label={`key (referenced by personae/groups/shows)`}
				value={v}
				errors={errors}
				readonly={isEdit}
			/>
			<Text name="displayName" label="display name (optional)" value={v} errors={errors} />
			{desc.categories ? (
				<Select name="category" label="category" value={v} errors={errors} options={desc.categories} />
			) : null}
			{desc.hasDuration ? (
				<Num name="durationSeconds" label="source duration (seconds)" value={v} errors={errors} />
			) : null}
			<label>
				<span>
					{desc.fileLabel} — {fileUrl ? "uploaded" : "none"}
					{isEdit ? " (leave blank to keep current)" : ""}
				</span>
				<input type="file" name="file" />
				<Err errors={errors} name="file" />
			</label>
			{fileUrl ? (
				desc.preview === "audio" ? (
					<audio controls preload="none" src={fileUrl} />
				) : (
					<video controls preload="none" src={fileUrl} class="media-prev" />
				)
			) : null}
			<Actions cancelHref={desc.base} />
		</form>
	);
}

const PLATFORMS = [
	{ key: "yt", label: "YouTube" },
	{ key: "ig", label: "Instagram" },
	{ key: "tt", label: "TikTok" },
];

/** Shared form CSS — imported by Layout via the `FORM_CSS` export. */
export const FORM_CSS = `
form.def { display: flex; flex-direction: column; gap: .9rem; max-width: 640px; }
form.def label { display: flex; flex-direction: column; gap: .25rem; }
form.def label.inline { flex-direction: row; align-items: center; gap: .4rem; }
form.def label > span:first-child { font-size: .8rem; opacity: .85; }
form.def input, form.def select, form.def textarea {
	padding: .45rem; font: inherit; width: 100%; }
form.def input[type=checkbox] { width: auto; }
form.def textarea { font-family: ui-monospace, monospace; white-space: pre; }
.checkgroup { display: flex; flex-wrap: wrap; gap: .75rem; }
.actions { display: flex; gap: 1rem; align-items: center; margin-top: .5rem; }
.err { color: #c0392b; font-size: .8rem; }
.stances { display: flex; flex-direction: column; gap: .5rem; }
.stances-label { font-size: .8rem; opacity: .85; }
#stances-list { display: flex; flex-direction: column; gap: .5rem; }
.stance-row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
	border: 1px solid #8884; border-radius: 6px; padding: .5rem; }
.stance-row input[name^="stance_name"] { width: 11rem; }
.stance-row select { width: auto; }
.stance-png { display: inline-flex; align-items: center; gap: .4rem; }
.stance-file { width: auto; font-size: .8rem; }
.stance-prev { height: 56px; width: auto; max-width: 56px; object-fit: contain;
	border: 1px solid #8884; border-radius: 4px; background: #8881;
	cursor: zoom-in; transition: transform .15s ease; }
.stance-prev:hover { transform: scale(4.5); transform-origin: left center;
	position: relative; z-index: 10; }
.stance-del { margin-left: auto; color: #c0392b; }
#stance-add { align-self: flex-start; }
.media-prev { max-width: 320px; border: 1px solid #8884; border-radius: 4px; }
audio { width: 100%; max-width: 320px; }
`;
