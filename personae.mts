export type PersonaConfig = {
	personaName: string;
	theme: string;
	promptPersonality: string;
	stances: string[];
	elevenLabsVoiceId: string;
	kokoroVoiceId: string;
};

const PERSONAE: Record<string, PersonaConfig> = {
	debug: {
		elevenLabsVoiceId: "cgSgspJ2msm6clMCkdW9",
		kokoroVoiceId: "af_bella",
		personaName: "debug",
		theme: "debug",
		promptPersonality:
			"I love clocks and I love to crack jokes regarding them.",
		stances: [
			"cracking_up",
			"excited",
			"mastermind",
			"mischievous",
			"shocked",
			"starstruck",
			"stupid",
			"talking",
			"thinking",
		],
	},
};

export function getPersona(name: keyof typeof PERSONAE) {
	const persona = PERSONAE[name];
	if (!persona) {
		throw new Error("NO PERSONA WITH THIS NAME");
	}

	return persona;
}
