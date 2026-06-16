import type { Job, JobSchedulerJson } from "bullmq";
import type { PersonaGroupConfig } from "../persona_group.mts";
import type { PersonaConfig } from "../personae.mts";
import type { ShowConfig, ShowStatus, SplitStrategy } from "../show.mts";

/**
 * Serializable, per-owner views of the runtime configs. The mappers pick only
 * JSON-safe fields explicitly — the configs embed function fields and an
 * ArrayBuffer voice sample that must never be stringified.
 */

export type Owner = string;

export type PersonaDTO = {
	owner: Owner;
	id: string;
	assetId: string;
	personaName: string;
	language: PersonaConfig["language"];
	theme: string;
	themeVolume: number;
	ttsProvider: PersonaConfig["ttsProvider"];
	voiceId: string;
	/** The raw ArrayBuffer is dropped — we only expose whether a sample exists. */
	hasVoiceSample: boolean;
	stances: string[];
	newsRegion: string;
	newsTopics: string[];
	ytCategoryCode: string;
	promptPersonality: string;
	promptVideoMeta: string;
	stanceDefaultPrompt: string;
};

export type GroupDTO = {
	owner: Owner;
	name: string;
	prompt: string;
	channelId: string;
	platforms: string[];
	theme: string;
	themeVolume: number;
	satisfyingVideoCategory: string;
	endPaddingDurationMs: number;
	personae: string[];
};

export type ShowDTO = {
	owner: Owner;
	id: string;
	status: ShowStatus;
	prompt: string;
	prose: string;
	split: SplitStrategy;
	maxCastPerEpisode: number;
	channelId: string;
	platforms: string[];
	theme: string;
	themeVolume: number;
	satisfyingVideoCategory: string;
	endPaddingDurationMs: number;
	ytCategoryCode: string;
	roster: string[];
};

const ADMIN: Owner = "admin";

// ---- Schedules ---------------------------------------------------------

/** Job names a scheduler template can carry, decoded into a friendly target. */
export type ScheduleTarget =
	| { kind: "news"; personaGroupName: string; carryingPersona: string }
	| { kind: "show"; showId: string }
	| { kind: "system"; reason: string }
	| { kind: "unknown"; jobName: string };

export type ScheduleDTO = {
	owner: Owner;
	/** Scheduler id (BullMQ `key`) — the handle used to delete it. */
	id: string;
	jobName: string;
	cron?: string;
	everyMs?: number;
	/** Next fire time, epoch ms. */
	nextRun?: number;
	target: ScheduleTarget;
	/** System schedulers (e.g. clean-s3) are ensured in code, not UI-editable. */
	editable: boolean;
};

/** Job names that the worker always re-ensures, so the UI must not own them. */
const SYSTEM_JOB_NAMES = new Set(["clean-s3"]);

export function isSystemJob(name: string): boolean {
	return SYSTEM_JOB_NAMES.has(name);
}

function decodeTarget(name: string, data: unknown): ScheduleTarget {
	const d = (data ?? {}) as Record<string, unknown>;
	switch (name) {
		case "trigger-video-flow":
			return {
				kind: "news",
				personaGroupName: String(d.personaGroupName ?? ""),
				carryingPersona: String(d.carryingPersona ?? ""),
			};
		case "show-tick":
			return { kind: "show", showId: String(d.showId ?? "") };
		case "clean-s3":
			return { kind: "system", reason: String(d.reason ?? "") };
		default:
			return { kind: "unknown", jobName: name };
	}
}

export function toScheduleDTO(s: JobSchedulerJson): ScheduleDTO {
	return {
		owner: ADMIN,
		id: s.key,
		jobName: s.name,
		cron: s.pattern,
		everyMs: s.every,
		nextRun: s.next,
		target: decodeTarget(s.name, s.template?.data),
		editable: !isSystemJob(s.name),
	};
}

// ---- Jobs --------------------------------------------------------------

export type JobDTO = {
	id: string;
	name: string;
	state: string;
	createdAt?: number;
	finishedAt?: number;
	attemptsMade: number;
	failedReason?: string;
	/** Short human-readable label derived from the job's data. */
	summary: string;
};

function jobSummary(name: string, data: unknown): string {
	const d = (data ?? {}) as Record<string, unknown>;
	if (d.showId !== undefined) {
		const ep =
			d.episodeIndex !== undefined ? ` ep ${Number(d.episodeIndex) + 1}` : "";
		return `${d.showId}${ep}`;
	}
	if (d.personaGroupName) {
		return `${d.personaGroupName}${d.carryingPersona ? ` / ${d.carryingPersona}` : ""}`;
	}
	if (d.renderId) return `render ${d.renderId}`;
	return name;
}

export function toJobDTO(job: Job, state: string): JobDTO {
	return {
		id: String(job.id ?? ""),
		name: job.name,
		state,
		createdAt: job.timestamp,
		finishedAt: job.finishedOn,
		attemptsMade: job.attemptsMade,
		failedReason: job.failedReason || undefined,
		summary: jobSummary(job.name, job.data),
	};
}

/** Pick the voice id the persona's chosen provider actually uses. */
function voiceIdFor(p: PersonaConfig): string {
	switch (p.ttsProvider) {
		case "elevenlabs":
			return p.elevenLabsVoiceId;
		case "kokoro":
			return p.kokoroVoiceId;
		case "qwen":
			return p.qwenVoiceId;
		case "pocket":
			return p.pocketVoiceId;
	}
}

export function toPersonaDTO(p: PersonaConfig, owner: Owner): PersonaDTO {
	return {
		owner,
		id: p.id,
		assetId: p.assetId ?? p.id,
		personaName: p.personaName,
		language: p.language,
		theme: p.theme,
		themeVolume: p.themeVolume,
		ttsProvider: p.ttsProvider,
		voiceId: voiceIdFor(p),
		hasVoiceSample: Boolean(p.pocketUseVoiceSample),
		stances: p.stances.map((s) => s.name),
		newsRegion: p.newsRegion,
		newsTopics: p.newsTopics.map(String),
		ytCategoryCode: p.ytCategoryCode,
		promptPersonality: p.promptPersonality,
		promptVideoMeta: p.promptVideoMeta,
		stanceDefaultPrompt: p.stanceDefaultPrompt ?? "",
	};
}

export function toGroupDTO(
	name: string,
	g: PersonaGroupConfig,
	owner: Owner,
): GroupDTO {
	return {
		owner,
		name,
		prompt: g.prompt,
		channelId: g.channelId,
		platforms: g.platforms,
		theme: g.theme,
		themeVolume: g.themeVolume,
		satisfyingVideoCategory: g.satisfyingVideoCategory,
		endPaddingDurationMs: g.endPaddingDurationMs,
		personae: g.personae.map((p) => p.id),
	};
}

export function toShowDTO(s: ShowConfig, owner: Owner): ShowDTO {
	return {
		owner,
		id: s.id,
		status: s.status ?? "draft",
		prompt: s.prompt ?? "",
		prose: s.prose,
		split: s.split,
		maxCastPerEpisode: s.maxCastPerEpisode,
		channelId: s.channelId,
		platforms: s.platforms,
		theme: s.theme,
		themeVolume: s.themeVolume,
		satisfyingVideoCategory: s.satisfyingVideoCategory,
		endPaddingDurationMs: s.endPaddingDurationMs,
		ytCategoryCode: s.ytCategoryCode,
		roster: s.roster.map((p) => p.id),
	};
}
