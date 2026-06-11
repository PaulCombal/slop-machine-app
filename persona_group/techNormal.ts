import { getSeedPersona } from "../personae.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";

export const techNormal: PersonaGroupConfig = {
	prompt: 'Julian and Clara are tech reviewers for a Youtube tech channel. They are presenting the latest tech topic right now.',
	theme: 'jazz',
	themeVolume: 0.1,
	personae: [getSeedPersona('techguy'), getSeedPersona('techgirl')],
	channelId: 'tech',
	satisfyingVideoCategory: 'gameplay',
	endPaddingDurationMs: 500,
	platforms: ['yt', 'ig'],
};
