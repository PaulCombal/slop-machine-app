import { listSeedPersonaGroups } from "../persona_group.mts";
import { listSeedPersonae } from "../personae.mts";
import { extractEtaTemplate } from "../repositories/promptTemplates.ts";
import { listSeedShows } from "../show.mts";
import { sql } from "./client.ts";
import { pgArray } from "./pgArray.ts";
import { ensureAdminUser } from "./users.ts";

/**
 * First-boot import of the seed-fixture personae / groups / shows into Postgres,
 * owned by the admin. The two prompt functions are converted to Eta templates
 * (see promptTemplates.ts). A `seed_meta` row claimed inside the transaction
 * guards against concurrent boots double-seeding; a crash rolls it all back.
 */
export async function seedDefinitions(ownerId: string): Promise<void> {
	await sql.begin(async (tx) => {
		const claim = await tx`
			insert into seed_meta (key) values ('definitions')
			on conflict (key) do nothing
			returning key
		`;
		if (!claim.length) return; // already seeded by a previous boot

		const personaIdByKey = new Map<string, string>();
		for (const p of listSeedPersonae()) {
			const metaTmpl = extractEtaTemplate(
				p.promptVideoMetaGivenNews.toString(),
				"newsItem",
			);
			const guideTmpl = extractEtaTemplate(
				p.promptScriptGuidelines.toString(),
				"topic",
			);
			const rows = await tx`
				insert into personae (
					user_id, persona_key, asset_id, persona_name, language, theme, theme_volume,
					tts_provider, elevenlabs_voice_id, kokoro_voice_id, kokoro_language,
					qwen_voice_id, pocket_voice_id, pocket_use_voice_sample,
					size, pos_x_range, pos_x_offset, group_pos_x_range, group_pos_x_offset,
					news_region, news_topics, yt_category_code, prompt_personality, prompt_video_meta,
					prompt_video_meta_given_news_tmpl, prompt_script_guidelines_tmpl, stances
				) values (
					${ownerId}, ${p.id}, ${p.assetId ?? null}, ${p.personaName}, ${p.language}, ${p.theme}, ${p.themeVolume},
					${p.ttsProvider}, ${p.elevenLabsVoiceId}, ${p.kokoroVoiceId}, ${p.kokoroLanguage},
					${p.qwenVoiceId}, ${p.pocketVoiceId}, ${Boolean(p.pocketUseVoiceSample)},
					${p.size}, ${p.posXRange}, ${p.posXOffset}, ${p.groupPosXRange}, ${p.groupPosXOffset},
					${p.newsRegion}, ${pgArray(p.newsTopics.map(String))}::text[], ${p.ytCategoryCode}, ${p.promptPersonality}, ${p.promptVideoMeta},
					${metaTmpl}, ${guideTmpl}, ${JSON.stringify(p.stances)}::jsonb
				) returning id
			`;
			personaIdByKey.set(p.id, rows[0].id);
		}

		for (const { name, config: g } of listSeedPersonaGroups()) {
			const grows = await tx`
				insert into persona_groups (
					user_id, group_key, prompt, channel_id, platforms, theme, theme_volume,
					satisfying_video_category, end_padding_duration_ms
				) values (
					${ownerId}, ${name}, ${g.prompt}, ${g.channelId}, ${pgArray(g.platforms)}::text[], ${g.theme}, ${g.themeVolume},
					${g.satisfyingVideoCategory}, ${g.endPaddingDurationMs}
				) returning id
			`;
			const groupId = grows[0].id;
			let pos = 0;
			for (const member of g.personae) {
				const pid = personaIdByKey.get(member.id);
				if (!pid)
					throw new Error(
						`group ${name} references unknown persona ${member.id}`,
					);
				await tx`
					insert into persona_group_members (group_id, persona_id, position)
					values (${groupId}, ${pid}, ${pos++})
				`;
			}
		}

		for (const s of listSeedShows()) {
			const srows = await tx`
				insert into shows (
					user_id, show_key, prose, prompt, split, max_cast_per_episode,
					channel_id, platforms, theme, theme_volume,
					satisfying_video_category, end_padding_duration_ms, yt_category_code
				) values (
					${ownerId}, ${s.id}, ${s.prose}, ${s.prompt ?? ""}, ${JSON.stringify(s.split)}::jsonb, ${s.maxCastPerEpisode},
					${s.channelId}, ${pgArray(s.platforms)}::text[], ${s.theme}, ${s.themeVolume},
					${s.satisfyingVideoCategory}, ${s.endPaddingDurationMs}, ${s.ytCategoryCode}
				) returning id
			`;
			const showId = srows[0].id;
			let pos = 0;
			for (const member of s.roster) {
				const pid = personaIdByKey.get(member.id);
				if (!pid)
					throw new Error(
						`show ${s.id} references unknown persona ${member.id}`,
					);
				await tx`
					insert into show_roster (show_id, persona_id, position)
					values (${showId}, ${pid}, ${pos++})
				`;
			}
		}

		console.log("🌱 Seeded definitions (personae / groups / shows) from code");
	});
}

// `bun run seed` — ensures the admin then seeds (idempotent).
if (import.meta.main) {
	const admin = await ensureAdminUser();
	await seedDefinitions(admin.id);
	await sql.end();
}
