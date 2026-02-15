import type { PersonaConfig } from "../personae.mts";

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
	sentence: string;
	stance: string;
	illustration: string;
	illustrationVideo?: PexelsVideoFile;
	wordsAlignment: object[];
};

export type OutputConfig = {
	seed: number,
	persona: PersonaConfig;
	sentences: ScriptSentence[];
	satisfyingVideo: string;
};
