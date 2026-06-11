import type {FullTopicContext, SummarizedNewsArticle} from "./steps/generate_topic.mts";
import type { Category as CurrentsCategory } from "./steps/news/currents.ts"
import { razmo } from "./personae/razmo.ts";
import { peter } from "./personae/peter.ts";
import { peterFr } from "./personae/peterFr.ts";
import { razmoFr } from "./personae/razmoFr.ts";
import { techguy } from "./personae/techguy.ts";
import { techgirl } from "./personae/techgirl.ts";
import { lois } from "./personae/lois.ts";
import {
	getPersonaFromCache,
	listPersonaeFromCache,
} from "./repositories/registryCache.ts";

export type AnimationSpec = {
	preset: string;
	params?: Record<string, number | string | boolean>;
};

export type AnimationSet = {
	in?: AnimationSpec;
	active?: AnimationSpec;
	out?: AnimationSpec;
};

export type StanceConfig = {
	name: string;
	animations?: AnimationSet;
};

export type PersonaConfig = {
	/** Unique logical id (used in scripts, manifests, casting). */
	id: string;
	/**
	 * Key for this persona's S3 assets (`personae/<assetId>/<stance>.png`,
	 * `voiceSample.mp3`). Defaults to `id`. Lets variants (e.g. a French dub)
	 * keep a distinct `id` while reusing another persona's artwork/voice.
	 */
	assetId?: string;
	size: number;
	posXRange: number;
	posXOffset: number;
	groupPosXRange: number;
	groupPosXOffset: number;
	personaName: string;
	theme: string;
	themeVolume: number;
	language: "en-US" | "fr-FR";
	promptPersonality: string;
	promptVideoMetaGivenNews: (newsItem: SummarizedNewsArticle) => string;
	promptVideoMeta: string;
	promptScriptGuidelines: (topic: FullTopicContext) => string;
	stances: StanceConfig[];
	ttsProvider: 'elevenlabs' | 'kokoro' | 'qwen' | 'pocket';
	elevenLabsVoiceId: string;
	kokoroVoiceId: string;
	kokoroLanguage: string;
	qwenVoiceId: string;
	pocketVoiceId: string;
	pocketUseVoiceSample: boolean | ArrayBuffer;
	newsRegion: string;
	newsTopics: CurrentsCategory[];
	ytCategoryCode: string;
};

/** Seed fixtures (imported once by db/seed.ts) — not the runtime source. */
const SEED_PERSONAE: Record<string, PersonaConfig> = {
	razmo,
	peter,
	peterFr,
	razmoFr,
	techguy,
	techgirl,
	lois,
};

/** Static (code) persona, used by group/show seed fixtures and `db/seed.ts`. */
export function getSeedPersona(name: keyof typeof SEED_PERSONAE): PersonaConfig {
	const persona = SEED_PERSONAE[name];
	if (!persona) {
		throw new Error("NO SEED PERSONA WITH THIS NAME: " + name);
	}

	return persona;
}

export function listSeedPersonae(): PersonaConfig[] {
	return Object.values(SEED_PERSONAE);
}

// Runtime accessors — DB-backed via the registry cache (init it first at boot).
export function getPersona(name: string): PersonaConfig {
	return getPersonaFromCache(name);
}

export function listPersonae(): PersonaConfig[] {
	return listPersonaeFromCache();
}
