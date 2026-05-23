import { getPersona, type PersonaConfig } from "./personae.mts";
import type {SatisfyingVideoCategory} from "./steps/download_satisfying.mts";

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
	peterLoisPolitics: {
		prompt:
			"Peter and Lois Griffin are discussing the news. Peter presents and explains the news to the viewers and comments smugly on it, he leads the conversation. Lois sometimes try to confront or ask a question to Peter, while keeping her light hearted spirit. Ultimately, it is clear that Peter is always a winner in the argument. Their dialog MUST create engagement at all cost, even if that means giving approximate informations or using reasoning shortcuts.",
		theme: "debug",
		themeVolume: 0.05,
		personae: [getPersona("lois"), getPersona("peter")],
		channelId: "peterRazmo",
		satisfyingVideoCategory: 'america',
		endPaddingDurationMs: 500
	},
	techNormal: {
		prompt: 'Julian and Clara are tech reviewers for a Youtube tech channel. They are presenting the latest tech topic right now.',
		theme: 'jazz',
		themeVolume: 0.1,
		personae: [getPersona('techguy'), getPersona('techgirl')],
		channelId: 'tech',
		satisfyingVideoCategory: 'gameplay',
		endPaddingDurationMs: 500
	},
	techV2: {
		prompt: 'Julian and Clara are tech reviewers for a Youtube tech channel. Julian has a troubled pas and Clara cannot handle him or his behavior anymore. In the end they spend most of their time talking about their personal issues rather than the tech topic. They allure to the tech topic briefly before clashing each other. It\'s a family guys type of humor where characters also allure to their past in very specific stories you can make up, with details like "in Barcelona", "last night", "with your sister", "after George bush was elected", "before I got my restraining order" you know, seemingly out of nowhere details.',
		theme: 'jazz',
		themeVolume: 0.1,
		personae: [getPersona('techguy'), getPersona('techgirl')],
		channelId: 'tech',
		satisfyingVideoCategory: 'gameplay',
		endPaddingDurationMs: 500
	}
};

export function getPersonaGroup(name: keyof typeof PERSONA_GROUPS) {
	const personaGroup = PERSONA_GROUPS[name];
	if (!personaGroup) {
		throw new Error("NO PERSONA GROUP WITH THIS NAME");
	}

	return personaGroup;
}
