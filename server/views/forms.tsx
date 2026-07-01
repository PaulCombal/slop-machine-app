import { NEWS_CATEGORIES, NEWS_REGIONS } from "../../steps/news/currents.ts";
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

export function Area({
	name,
	label,
	value,
	errors,
	rows,
	placeholder,
}: {
	name: string;
	label: string;
	value: Vals;
	errors: Errs;
	rows?: number;
	placeholder?: string;
}) {
	return (
		<label>
			<span>{label}</span>
			<textarea name={name} rows={rows ?? 4} placeholder={placeholder}>
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

export function Checkbox({
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

/** Currents news region as a dropdown of valid codes (plus a blank "any" option). */
function RegionField({ value, errors }: { value: Vals; errors: Errs }) {
	const cur = s(value.newsRegion);
	// Keep an unknown current value selectable in case the API's list shifts.
	const opts =
		cur && !(NEWS_REGIONS as readonly string[]).includes(cur)
			? [cur, ...NEWS_REGIONS]
			: [...NEWS_REGIONS];
	return (
		<label>
			<span>news region (Currents)</span>
			<select name="newsRegion">
				<option value="" selected={cur === ""}>
					— any region —
				</option>
				{opts.map((k) => (
					<option value={k} selected={k === cur}>
						{k}
					</option>
				))}
			</select>
			<Err errors={errors} name="newsRegion" />
		</label>
	);
}

/** YouTube videoCategoryId codes (label + numeric code), in the API's listing. */
const YT_CATEGORIES: { code: string; label: string }[] = [
	{ code: "2", label: "Autos & Vehicles" },
	{ code: "1", label: "Film & Animation" },
	{ code: "10", label: "Music" },
	{ code: "15", label: "Pets & Animals" },
	{ code: "17", label: "Sports" },
	{ code: "18", label: "Short Movies" },
	{ code: "19", label: "Travel & Events" },
	{ code: "20", label: "Gaming" },
	{ code: "21", label: "Videoblogging" },
	{ code: "22", label: "People & Blogs" },
	{ code: "23", label: "Comedy" },
	{ code: "24", label: "Entertainment" },
	{ code: "25", label: "News & Politics" },
	{ code: "26", label: "Howto & Style" },
	{ code: "27", label: "Education" },
	{ code: "28", label: "Science & Technology" },
	{ code: "29", label: "Nonprofits & Activism" },
	{ code: "30", label: "Movies" },
	{ code: "31", label: "Anime/Animation" },
	{ code: "32", label: "Action/Adventure" },
	{ code: "33", label: "Classics" },
	{ code: "34", label: "Comedy" },
	{ code: "35", label: "Documentary" },
	{ code: "36", label: "Drama" },
	{ code: "37", label: "Family" },
	{ code: "38", label: "Foreign" },
	{ code: "39", label: "Horror" },
	{ code: "40", label: "Sci-Fi/Fantasy" },
	{ code: "41", label: "Thriller" },
	{ code: "42", label: "Shorts" },
	{ code: "43", label: "Shows" },
	{ code: "44", label: "Trailers" },
];

/** YouTube category as a dropdown of "code - name" (plus a blank "none" option). */
function YtCategoryField({ value, errors }: { value: Vals; errors: Errs }) {
	const cur = s(value.ytCategoryCode);
	const known = YT_CATEGORIES.some((c) => c.code === cur);
	return (
		<label>
			<span>YouTube category code</span>
			<select name="ytCategoryCode">
				<option value="" selected={cur === ""}>
					— none —
				</option>
				{!known && cur ? (
					<option value={cur} selected>
						{cur}
					</option>
				) : null}
				{YT_CATEGORIES.map((c) => (
					<option value={c.code} selected={c.code === cur}>
						{c.code} - {c.label}
					</option>
				))}
			</select>
			<Err errors={errors} name="ytCategoryCode" />
		</label>
	);
}

/** Theme key as a dropdown of saved themes (plus a blank "no theme" option). */
function ThemeField({
	value,
	errors,
	themeKeys,
}: {
	value: Vals;
	errors: Errs;
	themeKeys: string[];
}) {
	const cur = s(value.theme);
	// Keep the current value selectable even if it's no longer a saved theme,
	// so editing an old definition doesn't silently drop its theme.
	const keys = cur && !themeKeys.includes(cur) ? [cur, ...themeKeys] : themeKeys;
	return (
		<label>
			<span>base theme (default music; plays on un-themed lines)</span>
			<select name="theme">
				<option value="" selected={cur === ""}>
					— no theme —
				</option>
				{keys.map((k) => (
					<option value={k} selected={k === cur}>
						{k}
					</option>
				))}
			</select>
			<Err errors={errors} name="theme" />
		</label>
	);
}

/**
 * The palette of themes the scriptwriter may switch to per sentence — a curated
 * subset of the theme library. Checkbox group over the saved theme keys; any
 * currently-selected key that's no longer in the library is still shown so an
 * old definition doesn't silently drop it.
 */
function ThemePalette({
	value,
	errors,
	themeKeys,
}: {
	value: Vals;
	errors: Errs;
	themeKeys: string[];
}) {
	const selected = (value.themes as string[] | undefined) ?? [];
	const keys = [...new Set([...themeKeys, ...selected])];
	return (
		<label>
			<span>mood themes (scriptwriter may switch per line)</span>
			<span class="checkgroup">
				{keys.length ? (
					keys.map((k) => (
						<label class="inline">
							<input
								type="checkbox"
								name="themes"
								value={k}
								checked={selected.includes(k)}
							/>
							<span>{k}</span>
						</label>
					))
				) : (
					<span class="hint">no themes in the library yet — add some under Themes</span>
				)}
			</span>
			<Err errors={errors} name="themes" />
		</label>
	);
}

/** Channel id as a dropdown of the owner's saved channels (by channel key). */
function ChannelField({
	value,
	errors,
	channelKeys,
}: {
	value: Vals;
	errors: Errs;
	channelKeys: string[];
}) {
	const cur = s(value.channelId);
	// Keep an unknown current value selectable so editing an old definition whose
	// channel was renamed/removed doesn't silently blank the field.
	const keys = cur && !channelKeys.includes(cur) ? [cur, ...channelKeys] : channelKeys;
	return (
		<label>
			<span>channel id</span>
			<select name="channelId">
				<option value="" selected={cur === ""} disabled>
					— pick a channel —
				</option>
				{keys.map((k) => (
					<option value={k} selected={k === cur}>
						{k}
					</option>
				))}
			</select>
			<Err errors={errors} name="channelId" />
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

// ---- Persona -----------------------------------------------------------

/** Default pocket TTS voices; the id must be one of these unless it's a voice copy. */
const POCKET_VOICES = [
	"alba",
	"marius",
	"javert",
	"jean",
	"fantine",
	"cosette",
	"eponine",
	"azelma",
];

/**
 * Preset mode: a dropdown of the default voices. Voice-cloning mode: the voice
 * comes from an uploaded sample (`voiceSample` → S3, see saveVoiceSample), so the
 * dropdown is swapped for a file upload + audio preview, edit-only. A script
 * toggles the halves off the checkbox.
 */
function PocketVoiceField({
	value,
	errors,
	personaKey,
	isEdit,
}: {
	value: Vals;
	errors: Errs;
	personaKey: string;
	isEdit: boolean;
}) {
	const cur = s(value.pocketVoiceId);
	const useSample = Boolean(value.pocketUseVoiceSample);
	// Keep an unknown current value selectable so editing doesn't silently drop it.
	const opts = cur && !POCKET_VOICES.includes(cur) ? [cur, ...POCKET_VOICES] : POCKET_VOICES;
	const existingSrc =
		isEdit && personaKey && useSample
			? `/personae/${encodeURIComponent(personaKey)}/voice-sample`
			: "";
	return (
		<label>
			<span>pocket voice id</span>
			<select
				name="pocketVoiceId"
				id="pocket-voice-select"
				disabled={useSample}
				style={useSample ? "display:none" : ""}
			>
				{opts.map((o) => (
					<option value={o} selected={o === cur}>
						{o}
					</option>
				))}
			</select>
			<span id="pocket-custom-wrap" class="pocket-custom" style={useSample ? "" : "display:none"}>
				{isEdit ? (
					<>
						<input
							type="file"
							name="voiceSample"
							id="voice-sample-file"
							accept=".mp3,audio/mpeg"
							disabled={!useSample}
						/>
						<audio
							id="voice-sample-prev"
							controls
							src={existingSrc || undefined}
							style={existingSrc ? "" : "display:none"}
						/>
					</>
				) : (
					<span class="hint">save the persona, then upload a voice sample by editing it</span>
				)}
			</span>
			<Err errors={errors} name="pocketVoiceId" />
			<script dangerouslySetInnerHTML={{ __html: POCKET_VOICE_SCRIPT }} />
		</label>
	);
}

const POCKET_VOICE_SCRIPT = `
(function () {
  var cb = document.querySelector('input[name="pocketUseVoiceSample"]');
  var sel = document.getElementById('pocket-voice-select');
  var wrap = document.getElementById('pocket-custom-wrap');
  var file = document.getElementById('voice-sample-file');
  var prev = document.getElementById('voice-sample-prev');
  if (!cb || !sel || !wrap) return;
  function sync() {
    var custom = cb.checked;
    sel.disabled = custom; sel.style.display = custom ? 'none' : '';
    wrap.style.display = custom ? '' : 'none';
    if (file) file.disabled = !custom;
  }
  if (file && prev) file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (f) { prev.src = URL.createObjectURL(f); prev.style.display = ''; }
  });
  cb.addEventListener('change', sync);
  sync();
})();
`;

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
			<ThemePalette value={v} errors={errors} themeKeys={themeKeys} />
			<Select name="ttsProvider" label="TTS provider" value={v} errors={errors} options={["elevenlabs", "kokoro", "qwen", "pocket"]} />
			<Text name="elevenLabsVoiceId" label="elevenlabs voice id" value={v} errors={errors} />
			<Text name="kokoroVoiceId" label="kokoro voice id" value={v} errors={errors} />
			<Text name="kokoroLanguage" label="kokoro language" value={v} errors={errors} />
			<Text name="qwenVoiceId" label="qwen voice id" value={v} errors={errors} />
			<Checkbox name="pocketUseVoiceSample" label="pocket: use voice sample" value={v} />
			<PocketVoiceField value={v} errors={errors} personaKey={s(v.key)} isEdit={isEdit} />
			<Num name="size" label="size" value={v} errors={errors} />
			<Num name="posXRange" label="posX range" value={v} errors={errors} />
			<Num name="posXOffset" label="posX offset" value={v} errors={errors} />
			<Num name="groupPosXRange" label="group posX range" value={v} errors={errors} />
			<Num name="groupPosXOffset" label="group posX offset" value={v} errors={errors} />
			<RegionField value={v} errors={errors} />
			<CheckGroup
				name="newsTopics"
				label="news topics"
				value={v}
				errors={errors}
				options={NEWS_CATEGORIES.map((c) => ({ key: c, label: c }))}
			/>
			<YtCategoryField value={v} errors={errors} />
			<Area name="promptPersonality" label="prompt: personality" value={v} errors={errors} rows={4} />
			<Area name="promptVideoMeta" label="prompt: video meta (no news)" value={v} errors={errors} rows={4} />
			<Area name="promptVideoMetaGivenNewsTmpl" label="template: video meta given news (Eta)" value={v} errors={errors} rows={6} />
			<Area name="promptScriptGuidelinesTmpl" label="template: script guidelines (Eta)" value={v} errors={errors} rows={6} />
			{isEdit ? (
				<p>
					<a class="linkbtn" href={`/personae/${encodeURIComponent(s(v.key))}/stances`}>
						🎭 Manage stances →
					</a>
				</p>
			) : (
				<span class="hint">save the persona, then add stances from its stance gallery</span>
			)}
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
			<ThemePalette value={v} errors={errors} themeKeys={themeKeys} />
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
	locked = false,
	personaOptions,
	themeKeys = [],
	channelKeys = [],
}: {
	action: string;
	value: Partial<ShowInput> | Vals;
	errors: Errs;
	isEdit: boolean;
	locked?: boolean;
	personaOptions: { key: string; name: string }[];
	themeKeys?: string[];
	channelKeys?: string[];
}) {
	const v = value as Vals;
	const split = (v.split ?? {}) as Record<string, unknown>;
	const splitVals: Vals = {
		splitType: split.type ?? "episodeCount",
		count: split.count,
		wordsPerEpisode: split.wordsPerEpisode,
		targetSeconds: split.targetSeconds,
	};
	const rosterKeys = Array.isArray((v as Vals).rosterKeys)
		? ((v as Vals).rosterKeys as unknown as string[])
		: [];
	// Prose, prompt, cast and split are what the episode manifest is derived from,
	// so they're shown read-only once the show is locked; the route also re-grafts
	// the stored values on submit, so nothing here can desync the manifest.
	const breakdownInputs = locked ? (
		<div class="ro">
			<p class="hint">🔒 breakdown inputs are locked — reopen the show to edit</p>
			<label><span>max cast per episode</span><div>{s(v.maxCastPerEpisode)}</div></label>
			<label><span>split</span><div>{JSON.stringify(v.split ?? splitVals)}</div></label>
			<label><span>roster</span><div>{rosterKeys.join(", ") || "—"}</div></label>
			<label><span>prompt</span><pre>{s(v.prompt)}</pre></label>
			<label><span>prose</span><pre>{s(v.prose)}</pre></label>
		</div>
	) : (
		<>
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
		</>
	);
	return (
		<form method="post" action={action} class="def">
			<Err errors={errors} name="_" />
			<Text name="key" label="key" value={v} errors={errors} readonly={isEdit} />
			<ChannelField value={v} errors={errors} channelKeys={channelKeys} />
			<CheckGroup name="platforms" label="platforms" value={v} errors={errors} options={PLATFORMS} />
			<ThemeField value={v} errors={errors} themeKeys={themeKeys} />
			<Num name="themeVolume" label="theme volume (0–1)" value={v} errors={errors} />
			<ThemePalette value={v} errors={errors} themeKeys={themeKeys} />
			<Select name="satisfyingVideoCategory" label="satisfying video category" value={v} errors={errors} options={["satisfying", "gameplay", "america"]} />
			<Num name="endPaddingDurationMs" label="end padding (ms)" value={v} errors={errors} />
			<YtCategoryField value={v} errors={errors} />
			{breakdownInputs}
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
.hint { font-size: .8rem; opacity: .7; }
.ro { display: flex; flex-direction: column; gap: .9rem; border: 1px dashed #8886;
	border-radius: 6px; padding: .75rem; opacity: .85; }
.ro label > span:first-child { font-size: .8rem; opacity: .85; }
.ro pre { margin: 0; max-height: 14rem; overflow: auto; white-space: pre-wrap;
	font-family: ui-monospace, monospace; font-size: .85rem; }
.pocket-custom { display: flex; flex-direction: column; gap: .4rem; }
.stances { display: flex; flex-direction: column; gap: .5rem; }
.stances-label { font-size: .8rem; opacity: .85; }
.stance-grid { display: grid; gap: .9rem; margin-top: .5rem;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
.stance-card { display: flex; flex-direction: column; gap: .35rem;
	border: 1px solid #8884; border-radius: 8px; padding: .5rem; }
.stance-card img { width: 100%; aspect-ratio: 1; object-fit: contain;
	background: #8881; border-radius: 6px; }
.stance-card-meta { display: flex; justify-content: space-between; align-items: baseline; gap: .4rem; }
.stance-card .actions { gap: .9rem; margin-top: auto; padding-top: .35rem;
	border-top: 1px solid #8883; }
.stance-card .actions button.linkbtn { color: #c0392b; }
.media-prev { max-width: 320px; border: 1px solid #8884; border-radius: 4px; }
audio { width: 100%; max-width: 320px; }
`;
