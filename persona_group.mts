import type { PersonaConfig } from "./personae.mts";
import type { DistributionConfig } from "./distribution.mts";
import { peterLoisPolitics } from "./persona_group/peterLoisPolitics.ts";
import { techNormal } from "./persona_group/techNormal.ts";
import { techV2 } from "./persona_group/techV2.ts";
import {
	getKnownChannelIdsFromCache,
	getPersonaGroupFromCache,
	listPersonaGroupsFromCache,
} from "./repositories/registryCache.ts";

// Re-exported for back-compat with existing importers.
export type { UploadPlatform } from "./distribution.mts";

export type PersonaGroupConfig = DistributionConfig & {
	prompt: string;
	personae: PersonaConfig[];
};

/**
 * Code-defined groups. Seed fixtures only (imported by `db/seed.ts`); runtime
 * reads go through the DB-backed registry cache below.
 */
const SEED_PERSONA_GROUPS: Record<string, PersonaGroupConfig> = {
	peterLoisPolitics,
	techNormal,
	techV2,
};

export function listSeedPersonaGroups(): {
	name: string;
	config: PersonaGroupConfig;
}[] {
	return Object.entries(SEED_PERSONA_GROUPS).map(([name, config]) => ({
		name,
		config,
	}));
}

// Runtime accessors — DB-backed via the registry cache.
export function getPersonaGroup(name: string): PersonaGroupConfig {
	return getPersonaGroupFromCache(name);
}

export function getKnownChannelIds(): string[] {
	return getKnownChannelIdsFromCache();
}

export function listPersonaGroups(): {
	name: string;
	config: PersonaGroupConfig;
}[] {
	return listPersonaGroupsFromCache();
}
