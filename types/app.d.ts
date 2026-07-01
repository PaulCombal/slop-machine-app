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
	/** Show location this line happens in (set by the breakdown), if any. */
	locationKey?: string;
	/** Theme/mood track that starts on this line (from the config palette), if any. */
	theme?: string;
	/** Resolved background file name in the render folder (Pexels clip or room asset). */
	illustrationFile?: string;
	/** Whether the resolved background is a still image or a video. */
	illustrationKind?: "image" | "video";
	/** Transient: set when the background came from a show location (skips Pexels). */
	illustrationRoom?: boolean;
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
	/** Filename (in the render folder) of a still shown as frame 0 — the Shorts thumbnail. */
	firstFrameImage?: string;
};
