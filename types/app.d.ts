import type { PersonaConfig } from "../personae.mts";
import type { FullTopicContext } from "../steps/generate_topic.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";

type PexelsVideoFile = {
	id: number;
	quality: "hd" | "sd" | "hls";
	file_type: "string";
	width: number | null;
	height: number | null;
	link: string;
	fps: number | null;
};

export type ScriptSentence = {
	personaId?: string;
	sentence: string;
	stance: string;
	illustration: string;
	illustrationVideo?: PexelsVideoFile;
	wordsAlignment: object[];
	posXRange: number;
	posXOffset: number;
};

export type OutputConfig = {
	seed: number;
	video: {
		fps: number;
		width: number;
		height: number;
	};
	personae: PersonaGroupConfig;
	sentences: ScriptSentence[];
	topic: FullTopicContext;
	satisfyingVideo: string;
};
