import { getSeedPersona } from "../personae.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";

export const peterLoisPolitics: PersonaGroupConfig = {
	prompt:
		"Peter and Lois Griffin are discussing the news. Peter presents and explains the news to the viewers and comments smugly on it, he leads the conversation. Lois sometimes try to confront or ask a question to Peter, while keeping her light hearted spirit. Ultimately, it is clear that Peter is always a winner in the argument. Their dialog MUST create engagement at all cost, even if that means giving approximate informations or using reasoning shortcuts.",
	theme: "debug",
	themeVolume: 0.05,
	personae: [getSeedPersona("lois"), getSeedPersona("peter")],
	channelId: "peterRazmo",
	satisfyingVideoCategory: 'america',
	endPaddingDurationMs: 500,
	platforms: ['yt', 'ig'],
};
