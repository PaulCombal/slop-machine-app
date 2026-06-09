import type { PersonaConfig } from "./personae.mts";
import type { DistributionConfig } from "./distribution.mts";
import { peterLoisPolitics } from "./persona_group/peterLoisPolitics.ts";
import { techNormal } from "./persona_group/techNormal.ts";
import { techV2 } from "./persona_group/techV2.ts";

// Re-exported for back-compat with existing importers.
export type { UploadPlatform } from "./distribution.mts";

export type PersonaGroupConfig = DistributionConfig & {
	prompt: string;
	personae: PersonaConfig[];
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

export function getKnownChannelIds(): string[] {
	return [...new Set(Object.values(PERSONA_GROUPS).map(g => g.channelId))];
}
