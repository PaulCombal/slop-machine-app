import type { PersonaConfig, AnimationSet } from "../personae.mts";
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

export type Slot = "far-left" | "left" | "center" | "right" | "far-right";

export type Appearance = {
	personaId: string;
	stance: string;
	slot?: Slot;
	/** Explicit 0..1 ratio of width; overrides slot (single-speaker flows). */
	posX?: number;
	isEntrance?: boolean;
	mirror?: boolean;
	animations?: AnimationSet;
};

export type ScriptSentence = {
	/** The speaker; also present in `appearances`. */
	personaId?: string;
	appearances: Appearance[];
	sentence: string;
	stance: string;
	illustration: string;
	illustrationVideo?: PexelsVideoFile;
	wordsAlignment: {start: number | null | undefined; end: number | undefined; text: string;}[];
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
