import { getPersona, type PersonaConfig } from "./personae.mts";

export type PersonaGroupConfig = {
	prompt: string;
	theme: string;
	themeVolume: number;
	personae: PersonaConfig[];
};

const PERSONA_GROUPS: Record<string, PersonaGroupConfig> = {
	redneckBffDebug: {
		prompt:
			"Redneck and Debug are very good friends. Debug often asks questions to Redneck about her opinionated political views, and keeps her light hearted spirit.",
		theme: "debug",
		themeVolume: 0.1,
		personae: [getPersona("debug"), getPersona("redneck")],
	},
};

export function getPersonaGroup(name: keyof typeof PERSONA_GROUPS) {
	const personaGroup = PERSONA_GROUPS[name];
	if (!personaGroup) {
		throw new Error("NO PERSONA GROUP WITH THIS NAME");
	}

	return personaGroup;
}
