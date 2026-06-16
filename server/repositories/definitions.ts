import { sql } from "../../db/client.ts";
import { pgArray } from "../../db/pgArray.ts";
import { groupRepo } from "../../repositories/groupRepo.ts";
import { personaRepo } from "../../repositories/personaRepo.ts";
import { publishInvalidate } from "../../repositories/registryCache.ts";
import { showRepo } from "../../repositories/showRepo.ts";
import type { CurrentOwner } from "../currentOwner.ts";
import {
	type GroupDTO,
	type PersonaDTO,
	type ShowDTO,
	toGroupDTO,
	toPersonaDTO,
	toShowDTO,
} from "../dto.ts";
import type { ShowStatus } from "../../show.mts";
import type { GroupInput, PersonaInput, ShowInput } from "../validation.ts";

/**
 * The only place the server reads and writes definitions, scoped to the owner.
 * Writes publish `definitions:invalidate` so every process reloads its cache.
 * `*Form` readers return the full editable shape (DTOs are lossy for display).
 */

/** A write rejected by a DB-level rule (uniqueness, missing reference, in-use). */
export class DefinitionError extends Error {
	fields: Record<string, string>;
	constructor(fields: Record<string, string>) {
		super(Object.values(fields).join("; "));
		this.name = "DefinitionError";
		this.fields = fields;
	}
}

const num = (v: unknown): number => Number(v);

export const definitionsRepo = {
	// ---- reads ----------------------------------------------------------
	async personae(owner: CurrentOwner): Promise<PersonaDTO[]> {
		const list = await personaRepo.listByOwner(owner.id);
		return list.map((p) => toPersonaDTO(p, owner.name));
	},
	async persona(
		owner: CurrentOwner,
		id: string,
	): Promise<PersonaDTO | undefined> {
		return (await this.personae(owner)).find((p) => p.id === id);
	},
	async groups(owner: CurrentOwner): Promise<GroupDTO[]> {
		const list = await groupRepo.listByOwner(owner.id);
		return list.map(({ name, config }) => toGroupDTO(name, config, owner.name));
	},
	async group(
		owner: CurrentOwner,
		name: string,
	): Promise<GroupDTO | undefined> {
		return (await this.groups(owner)).find((g) => g.name === name);
	},
	async shows(owner: CurrentOwner): Promise<ShowDTO[]> {
		const list = await showRepo.listByOwner(owner.id);
		return list.map((s) => toShowDTO(s, owner.name));
	},
	async show(owner: CurrentOwner, id: string): Promise<ShowDTO | undefined> {
		return (await this.shows(owner)).find((s) => s.id === id);
	},

	/** Keys + display names of the owner's personae (for membership selects). */
	async personaOptions(
		owner: CurrentOwner,
	): Promise<{ key: string; name: string }[]> {
		const rows = await sql`
			select persona_key, persona_name from personae
			where user_id = ${owner.id} order by persona_key
		`;
		return rows.map((r: { persona_key: string; persona_name: string }) => ({
			key: r.persona_key,
			name: r.persona_name,
		}));
	},

	/** Effective S3 asset id (asset_id ?? key) for a persona, or null if absent. Cheap single-column read. */
	async personaAssetId(owner: CurrentOwner, key: string): Promise<string | null> {
		const rows = await sql`
			select asset_id from personae where user_id = ${owner.id} and persona_key = ${key} limit 1
		`;
		return rows.length ? rows[0].asset_id || key : null;
	},

	/** A show's lifecycle status, or undefined if absent. Cheap single-column read. */
	async showStatus(owner: CurrentOwner, key: string): Promise<ShowStatus | undefined> {
		const rows = await sql`
			select status from shows where user_id = ${owner.id} and show_key = ${key} limit 1
		`;
		return rows.length ? ((rows[0].status ?? "draft") as ShowStatus) : undefined;
	},

	/** Group + show keys this persona is a member of (owner-scoped), for its detail page. */
	async membershipsForPersona(
		owner: CurrentOwner,
		key: string,
	): Promise<{ groups: string[]; shows: string[] }> {
		const [groups, shows] = await Promise.all([
			sql`
				select g.group_key from persona_group_members m
				join personae p on p.id = m.persona_id
				join persona_groups g on g.id = m.group_id
				where p.user_id = ${owner.id} and p.persona_key = ${key}
				order by g.group_key
			`,
			sql`
				select s.show_key from show_roster r
				join personae p on p.id = r.persona_id
				join shows s on s.id = r.show_id
				where p.user_id = ${owner.id} and p.persona_key = ${key}
				order by s.show_key
			`,
		]);
		return {
			groups: groups.map((r: { group_key: string }) => r.group_key),
			shows: shows.map((r: { show_key: string }) => r.show_key),
		};
	},

	// ---- edit-form prefill (full editable shape) ------------------------
	async personaForm(
		owner: CurrentOwner,
		key: string,
	): Promise<PersonaInput | undefined> {
		const rows = await sql`
			select * from personae where user_id = ${owner.id} and persona_key = ${key} limit 1
		`;
		if (!rows.length) return undefined;
		const r = rows[0];
		return {
			key: r.persona_key,
			assetId: r.asset_id ?? null,
			personaName: r.persona_name,
			language: r.language,
			theme: r.theme,
			themeVolume: num(r.theme_volume),
			ttsProvider: r.tts_provider,
			elevenLabsVoiceId: r.elevenlabs_voice_id,
			kokoroVoiceId: r.kokoro_voice_id,
			kokoroLanguage: r.kokoro_language,
			qwenVoiceId: r.qwen_voice_id,
			pocketVoiceId: r.pocket_voice_id,
			pocketUseVoiceSample: Boolean(r.pocket_use_voice_sample),
			size: num(r.size),
			posXRange: num(r.pos_x_range),
			posXOffset: num(r.pos_x_offset),
			groupPosXRange: num(r.group_pos_x_range),
			groupPosXOffset: num(r.group_pos_x_offset),
			mirrorable: Boolean(r.mirrorable),
			newsRegion: r.news_region,
			newsTopics: r.news_topics ?? [],
			ytCategoryCode: r.yt_category_code,
			promptPersonality: r.prompt_personality,
			promptVideoMeta: r.prompt_video_meta,
			promptVideoMetaGivenNewsTmpl: r.prompt_video_meta_given_news_tmpl,
			promptScriptGuidelinesTmpl: r.prompt_script_guidelines_tmpl,
			stanceDefaultPrompt: r.stance_default_prompt ?? "",
			stances:
				typeof r.stances === "string" ? JSON.parse(r.stances) : r.stances,
		};
	},

	async groupForm(
		owner: CurrentOwner,
		key: string,
	): Promise<GroupInput | undefined> {
		const rows = await sql`
			select * from persona_groups where user_id = ${owner.id} and group_key = ${key} limit 1
		`;
		if (!rows.length) return undefined;
		const g = rows[0];
		const members = await sql`
			select p.persona_key from persona_group_members m
			join personae p on p.id = m.persona_id
			where m.group_id = ${g.id} order by m.position
		`;
		return {
			key: g.group_key,
			prompt: g.prompt,
			channelId: g.channel_id,
			platforms: g.platforms,
			theme: g.theme,
			themeVolume: num(g.theme_volume),
			satisfyingVideoCategory: g.satisfying_video_category,
			endPaddingDurationMs: num(g.end_padding_duration_ms),
			personaKeys: members.map((m: { persona_key: string }) => m.persona_key),
		};
	},

	async showForm(
		owner: CurrentOwner,
		key: string,
	): Promise<ShowInput | undefined> {
		const rows = await sql`
			select * from shows where user_id = ${owner.id} and show_key = ${key} limit 1
		`;
		if (!rows.length) return undefined;
		const s = rows[0];
		const roster = await sql`
			select p.persona_key from show_roster r
			join personae p on p.id = r.persona_id
			where r.show_id = ${s.id} order by r.position
		`;
		return {
			key: s.show_key,
			prose: s.prose,
			prompt: s.prompt,
			split: typeof s.split === "string" ? JSON.parse(s.split) : s.split,
			maxCastPerEpisode: num(s.max_cast_per_episode),
			channelId: s.channel_id,
			platforms: s.platforms,
			theme: s.theme,
			themeVolume: num(s.theme_volume),
			satisfyingVideoCategory: s.satisfying_video_category,
			endPaddingDurationMs: num(s.end_padding_duration_ms),
			ytCategoryCode: s.yt_category_code,
			rosterKeys: roster.map((r: { persona_key: string }) => r.persona_key),
		};
	},

	// ---- persona writes -------------------------------------------------
	async createPersona(owner: CurrentOwner, input: PersonaInput): Promise<void> {
		await assertKeyFree("personae", "persona_key", owner.id, input.key);
		await sql`
			insert into personae (
				user_id, persona_key, asset_id, persona_name, language, theme, theme_volume,
				tts_provider, elevenlabs_voice_id, kokoro_voice_id, kokoro_language,
				qwen_voice_id, pocket_voice_id, pocket_use_voice_sample,
				size, pos_x_range, pos_x_offset, group_pos_x_range, group_pos_x_offset, mirrorable,
				news_region, news_topics, yt_category_code, prompt_personality, prompt_video_meta,
				prompt_video_meta_given_news_tmpl, prompt_script_guidelines_tmpl, stance_default_prompt, stances
			) values (
				${owner.id}, ${input.key}, ${input.assetId}, ${input.personaName}, ${input.language}, ${input.theme}, ${input.themeVolume},
				${input.ttsProvider}, ${input.elevenLabsVoiceId}, ${input.kokoroVoiceId}, ${input.kokoroLanguage},
				${input.qwenVoiceId}, ${input.pocketVoiceId}, ${input.pocketUseVoiceSample},
				${input.size}, ${input.posXRange}, ${input.posXOffset}, ${input.groupPosXRange}, ${input.groupPosXOffset}, ${input.mirrorable},
				${input.newsRegion}, ${pgArray(input.newsTopics)}::text[], ${input.ytCategoryCode}, ${input.promptPersonality}, ${input.promptVideoMeta},
				${input.promptVideoMetaGivenNewsTmpl}, ${input.promptScriptGuidelinesTmpl}, ${input.stanceDefaultPrompt}, ${JSON.stringify(input.stances)}::jsonb
			)
		`;
		await publishInvalidate();
	},

	// `mirrorable`, `stances` and `stance_default_prompt` are managed on the stance
	// gallery (setStanceSettings/addStance), so the edit form must NOT write them —
	// the narrowed type makes that contract compiler-enforced, not just convention.
	async updatePersona(
		owner: CurrentOwner,
		key: string,
		input: Omit<PersonaInput, "mirrorable" | "stances" | "stanceDefaultPrompt">,
	): Promise<void> {
		const res = await sql`
			update personae set
				asset_id = ${input.assetId}, persona_name = ${input.personaName},
				language = ${input.language}, theme = ${input.theme}, theme_volume = ${input.themeVolume},
				tts_provider = ${input.ttsProvider}, elevenlabs_voice_id = ${input.elevenLabsVoiceId},
				kokoro_voice_id = ${input.kokoroVoiceId}, kokoro_language = ${input.kokoroLanguage},
				qwen_voice_id = ${input.qwenVoiceId}, pocket_voice_id = ${input.pocketVoiceId},
				pocket_use_voice_sample = ${input.pocketUseVoiceSample},
				size = ${input.size}, pos_x_range = ${input.posXRange}, pos_x_offset = ${input.posXOffset},
				group_pos_x_range = ${input.groupPosXRange}, group_pos_x_offset = ${input.groupPosXOffset},
				news_region = ${input.newsRegion}, news_topics = ${pgArray(input.newsTopics)}::text[],
				yt_category_code = ${input.ytCategoryCode}, prompt_personality = ${input.promptPersonality},
				prompt_video_meta = ${input.promptVideoMeta},
				prompt_video_meta_given_news_tmpl = ${input.promptVideoMetaGivenNewsTmpl},
				prompt_script_guidelines_tmpl = ${input.promptScriptGuidelinesTmpl}
			where user_id = ${owner.id} and persona_key = ${key}
		`;
		if (res.count === 0) throw new DefinitionError({ key: "persona not found" });
		await publishInvalidate();
	},

	/** Add (or update by name) a single stance, preserving its other props (e.g. animations). */
	async addStance(
		owner: CurrentOwner,
		key: string,
		stance: { name: string; facing: string; animationInPreset?: string | null },
	): Promise<void> {
		const current = await readStances(owner, key);
		const existing = current.find((s) => s.name === stance.name);
		const next = current.filter((s) => s.name !== stance.name);
		const merged: StanceRow = { ...(existing ?? {}), name: stance.name, facing: stance.facing };
		// undefined → leave the animation as-is; "" → clear it; a preset → set the entrance animation.
		if (stance.animationInPreset !== undefined) {
			if (stance.animationInPreset) merged.animations = { in: { preset: stance.animationInPreset } };
			else delete merged.animations;
		}
		next.push(merged);
		await writeStances(owner, key, next);
	},

	/** Remove a stance by name from a persona's stances JSONB. */
	async removeStance(
		owner: CurrentOwner,
		key: string,
		name: string,
	): Promise<void> {
		const current = await readStances(owner, key);
		await writeStances(owner, key, current.filter((s) => s.name !== name));
	},

	/** Set the persona's stance-level settings (default prompt + mirrorable), managed on the gallery. */
	async setStanceSettings(
		owner: CurrentOwner,
		key: string,
		settings: { defaultPrompt: string; mirrorable: boolean },
	): Promise<void> {
		const res = await sql`
			update personae set
				stance_default_prompt = ${settings.defaultPrompt},
				mirrorable = ${settings.mirrorable}
			where user_id = ${owner.id} and persona_key = ${key}
		`;
		if (res.count === 0) throw new DefinitionError({ key: "persona not found" });
		await publishInvalidate();
	},

	async deletePersona(owner: CurrentOwner, key: string): Promise<void> {
		try {
			await sql`delete from personae where user_id = ${owner.id} and persona_key = ${key}`;
		} catch (e) {
			throw new DefinitionError({
				_: "persona is still used by a group or show — remove it there first",
			});
		}
		await publishInvalidate();
	},

	// ---- group writes ---------------------------------------------------
	async createGroup(owner: CurrentOwner, input: GroupInput): Promise<void> {
		await assertKeyFree("persona_groups", "group_key", owner.id, input.key);
		await sql.begin(async (tx) => {
			const rows = await tx`
				insert into persona_groups (
					user_id, group_key, prompt, channel_id, platforms, theme, theme_volume,
					satisfying_video_category, end_padding_duration_ms
				) values (
					${owner.id}, ${input.key}, ${input.prompt}, ${input.channelId}, ${pgArray(input.platforms)}::text[], ${input.theme}, ${input.themeVolume},
					${input.satisfyingVideoCategory}, ${input.endPaddingDurationMs}
				) returning id
			`;
			await replaceMembers(
				tx,
				"persona_group_members",
				"group_id",
				rows[0].id,
				owner.id,
				input.personaKeys,
			);
		});
		await publishInvalidate();
	},

	async updateGroup(
		owner: CurrentOwner,
		key: string,
		input: GroupInput,
	): Promise<void> {
		await sql.begin(async (tx) => {
			const rows = await tx`
				update persona_groups set
					prompt = ${input.prompt}, channel_id = ${input.channelId},
					platforms = ${pgArray(input.platforms)}::text[], theme = ${input.theme},
					theme_volume = ${input.themeVolume},
					satisfying_video_category = ${input.satisfyingVideoCategory},
					end_padding_duration_ms = ${input.endPaddingDurationMs}
				where user_id = ${owner.id} and group_key = ${key}
				returning id
			`;
			if (!rows.length) throw new DefinitionError({ key: "group not found" });
			await replaceMembers(
				tx,
				"persona_group_members",
				"group_id",
				rows[0].id,
				owner.id,
				input.personaKeys,
			);
		});
		await publishInvalidate();
	},

	async deleteGroup(owner: CurrentOwner, key: string): Promise<void> {
		await sql`delete from persona_groups where user_id = ${owner.id} and group_key = ${key}`;
		await publishInvalidate();
	},

	// ---- show writes ----------------------------------------------------
	async createShow(owner: CurrentOwner, input: ShowInput): Promise<void> {
		await assertKeyFree("shows", "show_key", owner.id, input.key);
		await sql.begin(async (tx) => {
			const rows = await tx`
				insert into shows (
					user_id, show_key, prose, prompt, split, max_cast_per_episode,
					channel_id, platforms, theme, theme_volume,
					satisfying_video_category, end_padding_duration_ms, yt_category_code
				) values (
					${owner.id}, ${input.key}, ${input.prose}, ${input.prompt}, ${JSON.stringify(input.split)}::jsonb, ${input.maxCastPerEpisode},
					${input.channelId}, ${pgArray(input.platforms)}::text[], ${input.theme}, ${input.themeVolume},
					${input.satisfyingVideoCategory}, ${input.endPaddingDurationMs}, ${input.ytCategoryCode}
				) returning id
			`;
			await replaceMembers(
				tx,
				"show_roster",
				"show_id",
				rows[0].id,
				owner.id,
				input.rosterKeys,
			);
		});
		await publishInvalidate();
	},

	async updateShow(
		owner: CurrentOwner,
		key: string,
		input: ShowInput,
	): Promise<void> {
		await sql.begin(async (tx) => {
			const rows = await tx`
				update shows set
					prose = ${input.prose}, prompt = ${input.prompt},
					split = ${JSON.stringify(input.split)}::jsonb, max_cast_per_episode = ${input.maxCastPerEpisode},
					channel_id = ${input.channelId}, platforms = ${pgArray(input.platforms)}::text[],
					theme = ${input.theme}, theme_volume = ${input.themeVolume},
					satisfying_video_category = ${input.satisfyingVideoCategory},
					end_padding_duration_ms = ${input.endPaddingDurationMs}, yt_category_code = ${input.ytCategoryCode}
				where user_id = ${owner.id} and show_key = ${key}
				returning id
			`;
			if (!rows.length) throw new DefinitionError({ key: "show not found" });
			await replaceMembers(
				tx,
				"show_roster",
				"show_id",
				rows[0].id,
				owner.id,
				input.rosterKeys,
			);
		});
		await publishInvalidate();
	},

	async deleteShow(owner: CurrentOwner, key: string): Promise<void> {
		await sql`delete from shows where user_id = ${owner.id} and show_key = ${key}`;
		await publishInvalidate();
	},

	/** Flip a show's lifecycle status (owner-scoped). */
	async setShowStatus(
		owner: CurrentOwner,
		key: string,
		status: ShowStatus,
	): Promise<void> {
		const res = await sql`
			update shows set status = ${status}
			where user_id = ${owner.id} and show_key = ${key}
		`;
		if (res.count === 0) throw new DefinitionError({ key: "show not found" });
		await publishInvalidate();
	},
};

type StanceRow = { name: string; [k: string]: unknown };

/** Read a persona's stances JSONB (owner-scoped), normalised to an array. */
async function readStances(
	owner: CurrentOwner,
	key: string,
): Promise<StanceRow[]> {
	const rows = await sql`
		select stances from personae where user_id = ${owner.id} and persona_key = ${key} limit 1
	`;
	if (!rows.length) throw new DefinitionError({ key: "persona not found" });
	return (
		typeof rows[0].stances === "string" ? JSON.parse(rows[0].stances) : rows[0].stances
	) as StanceRow[];
}

/** Overwrite a persona's stances JSONB and invalidate the registry cache. */
async function writeStances(
	owner: CurrentOwner,
	key: string,
	stances: StanceRow[],
): Promise<void> {
	await sql`
		update personae set stances = ${JSON.stringify(stances)}::jsonb
		where user_id = ${owner.id} and persona_key = ${key}
	`;
	await publishInvalidate();
}

/** Throw a field error if a per-tenant key is already taken. */
async function assertKeyFree(
	table: string,
	col: string,
	ownerId: string,
	key: string,
): Promise<void> {
	const rows = await sql`
		select 1 from ${sql.unsafe(table)}
		where user_id = ${ownerId} and ${sql.unsafe(col)} = ${key} limit 1
	`;
	if (rows.length) throw new DefinitionError({ key: `"${key}" already exists` });
}

/**
 * Replace a membership/roster set inside a transaction: resolve the owner's
 * persona keys to ids (rejecting unknown keys), wipe the existing rows, then
 * re-insert in submitted order.
 */
async function replaceMembers(
	// biome-ignore lint/suspicious/noExplicitAny: tx is Bun.sql's transaction handle.
	tx: any,
	table: string,
	parentCol: string,
	parentId: string,
	ownerId: string,
	personaKeys: string[],
): Promise<void> {
	const rows = await tx`
		select id, persona_key from personae
		where user_id = ${ownerId} and persona_key = any(${pgArray(personaKeys)}::text[])
	`;
	const idByKey = new Map<string, string>(
		rows.map((r: { id: string; persona_key: string }) => [r.persona_key, r.id]),
	);
	const missing = personaKeys.filter((k) => !idByKey.has(k));
	if (missing.length) {
		throw new DefinitionError({
			personaKeys: `unknown persona(s): ${missing.join(", ")}`,
		});
	}

	await tx`delete from ${tx.unsafe(table)} where ${tx.unsafe(parentCol)} = ${parentId}`;
	let pos = 0;
	for (const key of personaKeys) {
		await tx`
			insert into ${tx.unsafe(table)} (${tx.unsafe(parentCol)}, persona_id, position)
			values (${parentId}, ${idByKey.get(key)}, ${pos++})
		`;
	}
}
