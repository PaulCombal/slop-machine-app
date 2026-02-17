import myPexelsClient from "../clients/pexels.mts";
import type { ScriptSentence } from "../types/app";
import type { PersonaConfig } from "../personae.mts";
import { parseAiJson, promptLlm } from "../utils/llm.mts";
import type { FullTopicContext } from "./generate_topic.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";

function dummy(): ScriptSentence[] {
	return [
		{
			sentence:
				"With a soft and whispery American accent, I'm the ideal choice for creating ASMR content, meditative guides, or adding an intimate feel to your narrative projects.",
			stance: "talking",
			illustration: "Microphone",
			wordsAlignment: [],
			personaId: "debug",
			posXRange: 0.2,
			posXOffset: 0.7,
		},
		{
			sentence:
				"Do people forget we have lives outside our screens? Jobs, sleep, just... breathing?!",
			stance: "talking",
			illustration: "clock",
			wordsAlignment: [],
			personaId: "redneck",
			posXRange: 0.2,
			posXOffset: 0.3,
		},
	];
}

async function addIllustrationLink(sentences: ScriptSentence[]) {
	const usedVideoIds = new Set<number>();

	for (const sentence of sentences) {
		const response = await myPexelsClient.videos.search({
			query: sentence.illustration,
			per_page: 10,
		});

		if (!("videos" in response)) {
			throw new Error("FAILED TO SEARCH FOR VIDEOS");
		}

		if (response.videos.length > 0) {
			const bestVideo = response.videos.find((video) => {
				if (usedVideoIds.has(video.id)) return false;

				return video.video_files.some(
					(file) => (file.width || 0) >= 540 && (file.height || 0) >= 960,
				);
			});

			const selectedVideo = bestVideo || response.videos[0];

			if (!selectedVideo) {
				throw new Error("No available video!!!");
			}

			// Filter for files meeting the minimum, then sort ascending (smallest first)
			const validFile = selectedVideo.video_files
				.filter((file) => (file.width || 0) >= 540 && (file.height || 0) >= 960)
				.sort((a, b) => (a.width || 0) - (b.width || 0))[0];

			sentence.illustrationVideo = validFile!;
			usedVideoIds.add(selectedVideo.id);
		}
	}
}

function addPersonaPosition(
	sentence: ScriptSentence,
	personaGroup: PersonaGroupConfig,
) {
	const persona = personaGroup.personae.find(
		(p) => p.id === sentence.personaId,
	);
	if (!persona) {
		throw new Error("Persona not found");
	}

	if (personaGroup.personae.length > 1) {
		sentence.posXRange = persona.groupPosXRange;
		sentence.posXOffset = persona.groupPosXOffset;
	} else {
		sentence.posXRange = persona.posXRange;
		sentence.posXOffset = persona.posXOffset;
	}
}

function addPersonaPositionToSentences(
	sentences: ScriptSentence[],
	personaGroup: PersonaGroupConfig,
) {
	for (const sentence of sentences) {
		addPersonaPosition(sentence, personaGroup);
	}
}

// export async function generateScript(
// 	persona: PersonaConfig,
// ): Promise<ScriptSentence[]> {
// 	if (process.env.DEBUG !== "false") {
// 		return dummy();
// 	}
//
// 	const text = await promptLlm(`Your task is to generate a punchy, engaging script for a short-form social media video (10-35 seconds).
// You are performing as a PNG-tuber with the following personality: ${persona.promptPersonality}
//
// ### Script Guidelines:
// 1. Format: Script must be broken down sentence-by-sentence.
// 2. Length: Each sentence must be under 12 words to maintain a fast, "snackable" pace.
// 3. Arc:
//    - Hook: Immediately state a spicy or controversial topic.
//    - Conflict: Express a strong emotional critique (anger, disbelief, or feigned outrage).
//    - Vibe: Prioritize character voice and emotion over dry facts.
//
// ### Output Format:
// Return ONLY a raw JSON array of objects. Each object must contain:
// - "sentence": (string) The spoken line.
// - "stance": (string) Must be one of: ${persona.stances.join(", ")}.
// - "illustration": (string) A 1-3 word search term for Pexels stock footage (focus on concrete visuals, e.g., "broken clock" instead of "wasted time").
//
// JSON Structure:
// [
//   {
//     "sentence": "",
//     "stance": "",
//     "illustration": ""
//   }
// ]
// `, 'gemini');
//
// 	const sentences: ScriptSentence[] = parseAiJson(text);
// 	await addIllustrationLink(sentences);
// 	return sentences;
// }

export async function generateScriptOnTopic(
	persona: PersonaConfig,
	topic: FullTopicContext,
): Promise<ScriptSentence[]> {
	if (process.env.DEBUG !== "false") {
		return dummy();
	}

	const text = await promptLlm(
		`${persona.promptScriptGuidelines(topic)}

### Output Format:
Return ONLY a raw JSON array of objects. Each object must contain:
- "sentence": (string) The spoken line.
- "stance": (string) Must be one of: ${persona.stances.join(", ")}.
- "illustration": (string) A 1-3 word search term for Pexels stock footage (focus on concrete visuals, e.g., "broken clock" instead of "wasted time").

JSON Structure:
[
  {
    "sentence": "",
    "stance": "",
    "illustration": ""
  }
]
`,
		"gemini",
	);

	const sentences: ScriptSentence[] = parseAiJson(text);

	for (const sentence of sentences) {
		sentence.personaId = persona.id;
		sentence.posXOffset = persona.posXOffset;
		sentence.posXRange = persona.posXRange;
	}

	await addIllustrationLink(sentences);
	return sentences;
}

export async function generateScriptOnTopicForGroup(
	personaGroup: PersonaGroupConfig,
	topic: FullTopicContext,
): Promise<ScriptSentence[]> {
	if (process.env.DEBUG !== "false") {
		return dummy();
	}

	const personaeDescription = personaGroup.personae.map(
		(p) => `(ID: '${p.id}') ${p.personaName}: ${p.promptPersonality}\n`,
	);
	const personaeStances = personaGroup.personae.map(
		(p) => `${p.personaName}: ${p.stances.join(", ")}\n`,
	);

	const text = await promptLlm(
		`# ROLE
You are an expert Scriptwriter for "PNGTuber" YouTube Shorts. You specialize in high-retention, fast-paced dialogue (snappy banter) between multiple characters.

# CAST & ASSETS
${personaeDescription}

# ANIMATION CONSTRAINTS
Each character MUST only use their specific available stances:
${personaeStances}

# CONTEXT
Video Topic: ${topic.topic}
Title: ${topic.videoMetadata.title}
Description: ${topic.videoMetadata.description}
${topic.latestNews?.length ? "Contextual News: " + topic.latestNews.map((news) => news.description).join(" | ") : ""}

# ADDITIONAL INSTRUCTIONS
- ${personaGroup.prompt}
- SCRIPTLENGTH: Keep sentences short (under 15 words) to maintain "Shorts" pacing.
- DYNAMICS: Ensure characters interrupt, agree, or clash with each other to create energy.
- VISUALS: The "illustration" must be a concrete noun for stock footage search (e.g., "coffee splash" not "morning vibes").

# OUTPUT REQUIREMENT
Return ONLY a valid JSON array of objects. Do not include markdown formatting or "json" code blocks.

[
  {
    "personaId": "Exact ID from Cast",
    "sentence": "The spoken line.",
    "stance": "Exact stance name from the character's list",
    "illustration": "Stock footage search term"
  }
]`,
		"gemini",
	);

	const sentences: ScriptSentence[] = parseAiJson(text);
	await addIllustrationLink(sentences);
	addPersonaPositionToSentences(sentences, personaGroup);
	return sentences;
}
