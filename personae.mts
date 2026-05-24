import type {FullTopicContext, SummarizedNewsArticle} from "./steps/generate_topic.mts";
import type { Category as CurrentsCategory } from "./steps/news/currents.ts"
import { razmo } from "./personae/razmo.ts";
import { peter } from "./personae/peter.ts";
import { peterFr } from "./personae/peterFr.ts";
import { razmoFr } from "./personae/razmoFr.ts";
import { techguy } from "./personae/techguy.ts";
import { techgirl } from "./personae/techgirl.ts";
import { lois } from "./personae/lois.ts";

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
	id: string;
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

const PERSONAE: Record<string, PersonaConfig> = {
	razmo,
	peter,
	peterFr,
	razmoFr,
	techguy,
	techgirl,
	lois,
};

export function getPersona(name: keyof typeof PERSONAE) {
	const persona = PERSONAE[name];
	if (!persona) {
		throw new Error("NO PERSONA WITH THIS NAME: " + name);
	}

	return persona;
}
