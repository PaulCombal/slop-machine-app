import type {PersonaConfig} from "../personae.mts";

export type ScriptSentence = {
  sentence: string;
  stance: string;
  illustration: string;
  illustrationVideoUrl?: string;
  wordsAlignment: object[];
}

export type OutputConfig = {
  persona: PersonaConfig,
  sentences: ScriptSentence[]
}