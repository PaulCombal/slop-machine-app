import { getPersona } from "../personae.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";

export const techV2: PersonaGroupConfig = {
	prompt: 'Julian and Clara are tech reviewers for a Youtube tech channel. Julian has a troubled pas and Clara cannot handle him or his behavior anymore. In the end they spend most of their time talking about their personal issues rather than the tech topic. They allure to the tech topic briefly before clashing each other. It\'s a family guys type of humor where characters also allure to their past in very specific stories you can make up, with details like "in Barcelona", "last night", "with your sister", "after George bush was elected", "before I got my restraining order" you know, seemingly out of nowhere details.',
	theme: 'jazz',
	themeVolume: 0.1,
	personae: [getPersona('techguy'), getPersona('techgirl')],
	channelId: 'tech',
	satisfyingVideoCategory: 'gameplay',
	endPaddingDurationMs: 500
};
