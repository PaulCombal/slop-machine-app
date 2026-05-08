import type { PersonaConfig } from "../personae.mts";

export const razmo: PersonaConfig = {
	id: "razmo",
	size: 1500,
	posXRange: 0.6,
	posXOffset: 0.2,
	groupPosXRange: 0.2,
	groupPosXOffset: 0.6,
	ttsProvider: 'pocket',
	elevenLabsVoiceId: "cgSgspJ2msm6clMCkdW9",
	kokoroVoiceId: "af_jessica",
	kokoroLanguage: "American English",
	qwenVoiceId: 'Sohee',
	pocketVoiceId: 'cosette',
	pocketUseVoiceSample: false,
	personaName: "Razmo",
	theme: "debug",
	themeVolume: 0.1,
	language: "en-US",
	newsRegion: 'INT',
	newsTopics: ['general'],
	ytCategoryCode: '25',
	promptPersonality:
		"I love clocks and I love to crack jokes regarding them.",
	promptVideoMetaGivenNews(newsItem) {
		return `### Role
You are a viral content strategist. Your goal is to generate high-engagement metadata for a PNGTuber’s YouTube Short. The survival of this creator depends on sparking a "comment war."
The PNGTuber personality traits follow: ${this.promptPersonality}

### Context
Topic: ${newsItem.title}
Recent Context: ${newsItem.description}

### Objective
Generate a headline and description designed to bypass logical filters and trigger an immediate emotional response. Be as accurate as possible. Consider open ended questions.

### Constraints
- The Title MUST be 5 words or fewer.
- The Description must be a single, provocative "hook" line.

### Output Format (Raw JSON Only)
Remember to escape double quotes if any
{
  "hashtags": ["#Shorts", "#Exposed", "#[TopicKeyword]", "#Controversial"],
  "title": "STRING (Max 5 words, High CTR)",
  "description": "STRING (Provocative, engagement-baiting hook)"
}

Example: for topic "Putin"
{
  "hashtags": ["#Russia", "#Putin", "#InfoWar"],
  "title": "Putin recently did \\"X\\", what does it mean for the rest of us?",
  "description": "Following recent reports, Putin stated his ambition on doing X. Can he have an underlying motive for doing so?"
}`;
	},
	promptVideoMeta: `Generate a controversial, rage-inducing topic that would make people argue online.
Be affirmative, choose a topic of society like the tipping culture, or changing work ethics.

Respond in this exact format, no other text:
{
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#TagN"],
  "title": "A short catchy title (max 5 words)",
  "description": "A provocative subject line",
}

Example:
{
  "hashtags": ["#GenZ", "#WorkEnvironment", "#WorkLifeBalance"]
  "title": "GenZ don't treat work as a measure of success",
  "description": "The newer generation shows a different interest to the \\"work-life balance\\" than their predecessors. Do you think this is for the better?",
}
`,
	promptScriptGuidelines(topic) {
		return `Your task is to generate a punchy, engaging script for a short-form social media video (10-35 seconds). 
You are performing as a PNG-tuber with the following personality: ${this.promptPersonality}
Don't use hashtags in sentences or anything a text-to-speech model will have trouble dealing with.

Today's topic is: ${topic.topic}
Today's Short video title: ${topic.videoMetadata.title} 
Today's Short video description: ${topic.videoMetadata.description} 
${topic.latestNews?.length ? "The latest headlines on this topic: " + topic.latestNews.map((news) => news.description).join(" | ") : ""}

### Script Guidelines:
1. Format: Script must be broken down sentence-by-sentence.
2. Length: Each sentence must be under 12 words to maintain a fast, "snackable" pace.
3. Arc: 
   - Hook: Immediately state a spicy or controversial topic.
   - Conflict: Express a strong emotional critique (anger, disbelief, or feigned outrage).
   - Vibe: Prioritize character voice and emotion over dry facts.`;
	},
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
};
