import { getPersona, type PersonaConfig } from "./personae.mts";

export type PersonaGroupConfig = {
	prompt: string;
	theme: string;
	themeVolume: number;
	personae: PersonaConfig[];
};

const PERSONA_GROUPS: Record<string, PersonaGroupConfig> = {
	peterBffDebug: {
		prompt:
			"Peter (Griffin) and Razmo are good friends. Peter explains the news to the viewers and comments smugly on it, he leads the conversation. Razmo sometimes makes a joke or asks a question to Peter, while keeping her light hearted spirit. Their dialog MUST create engagement at all cost, even if that means giving approximate informations or using reasoning shortcuts.",
		theme: "debug",
		themeVolume: 0.05,
		personae: [getPersona("razmo"), getPersona("peter")],
	},
	peterBffDebugFr: {
		prompt: "Peter (Griffin) et Razmo sont amis. Peter explique l'article aux téléspectateurs, menant la conversation. Razmo, de temps à autre, fait une blague ou pose une question à Peter. Leur dialogue DOIT absolument susciter l'intérêt, quitte à donner des informations approximatives ou à utiliser des raccourcis de raisonnement.",
		theme: "debug",
		themeVolume: 0.05,
		personae: [getPersona("razmoFr"), getPersona("peterFr")],
	},
	techNormal: {
		prompt: 'Julian and Clara are tech reviewers for a Youtube tech channel. They are presenting the latest tech topic right now.',
		theme: 'jazz',
		themeVolume: 0.05,
		personae: [getPersona('techguy'), getPersona('techgirl')]
	}
};

export function getPersonaGroup(name: keyof typeof PERSONA_GROUPS) {
	const personaGroup = PERSONA_GROUPS[name];
	if (!personaGroup) {
		throw new Error("NO PERSONA GROUP WITH THIS NAME");
	}

	return personaGroup;
}
