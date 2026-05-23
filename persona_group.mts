import type { PersonaConfig } from "./personae.mts";
import type {SatisfyingVideoCategory} from "./steps/download_satisfying.mts";
import { peterLoisPolitics } from "./persona_group/peterLoisPolitics.ts";
import { techNormal } from "./persona_group/techNormal.ts";
import { techV2 } from "./persona_group/techV2.ts";

export type PersonaGroupConfig = {
	prompt: string;
	theme: string;
	themeVolume: number;
	personae: PersonaConfig[];
	channelId: string;
	satisfyingVideoCategory: SatisfyingVideoCategory;
	endPaddingDurationMs: number;
};

const PERSONA_GROUPS: Record<string, PersonaGroupConfig> = {
	peterLoisPolitics,
	techNormal,
	techV2,
};

export function getPersonaGroup(name: keyof typeof PERSONA_GROUPS) {
	const personaGroup = PERSONA_GROUPS[name];
	if (!personaGroup) {
		throw new Error("NO PERSONA GROUP WITH THIS NAME");
	}

	return personaGroup;
}
