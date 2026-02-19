import { DOMParser, NodeList } from "linkedom";
import { parseAiJson, promptLlm } from "../utils/llm.mts";
import type { PersonaConfig } from "../personae.mts";

export type NewsItem = {
	title: string;
	description: string;
	pubDate: string;
};

export type VideoMetadata = {
	hashtags: string[];
	title: string;
	description: string;
};

export type FullTopicContext = {
	latestNews: NewsItem[];
	topic: string;
	videoMetadata: VideoMetadata;
};

function dummy() {
	return {
		topic: "Hillary Epstein coverup",
		latestNews: [
			{
				title:
					"Hillary Clinton accuses Trump administration of Epstein files cover-up - FilmoGaz",
				description:
					'<a href="https://news.google.com/rss/articles/CBMiRkFVX3lxTE52TVlXVk9SRmdEZ2lweDNFQXZVU2d0eV9CZkZxSnRXQ1hRZEtwS3FkdlpyUTlSZVB5dnF6YlJ2TmpVLTJoMWc?oc=5" target="_blank">Hillary Clinton accuses Trump administration of Epstein files cover-up</a>&nbsp;&nbsp;<font color="#6f6f6f">FilmoGaz</font>',
				pubDate: "Tue, 17 Feb 2026 08:01:29 GMT",
				source: "FilmoGaz",
			},
			{
				title:
					"Hillary Clinton Accuses Administration of Epstein Files 'Cover-Up', Demands Full Release - FilmoGaz",
				description:
					'<a href="https://news.google.com/rss/articles/CBMiRkFVX3lxTE5PS2VoRXhSejZ5al9oRDBjVXM5M3ZSNlFIa1JPbl9vMmk4eWFZbTZIeW5NR0VxYUNOcUZWYmpScDRiNFpRSWc?oc=5" target="_blank">Hillary Clinton Accuses Administration of Epstein Files \'Cover-Up\', Demands Full Release</a>&nbsp;&nbsp;<font color="#6f6f6f">FilmoGaz</font>',
				pubDate: "Tue, 17 Feb 2026 08:43:02 GMT",
				source: "FilmoGaz",
			},
		],
		videoMetadata: {
			hashtags: ["#Shorts", "#Exposed", "#Epstein", "#Controversial"],
			title:
				"Hillary Clinton 2023 Epstein Cover-Up: $1.8M Bribe Unmasked! #ExposeScam",
			description:
				"Hillary silent? This $1.8M bribe secret proves the Swamp's desperation. Secret deals exposed—Epstein tapes prove it. You won’t choose to ignore this. #ExposeTheCrime #SwampScam",
		},
	};
}

function parseRssFeed(xmlString: string): NewsItem[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlString, "text/xml");
	const items: NodeList = doc.querySelectorAll("item");

	return Array.from(items).map((item) => {
		return {
			// .textContent handles the CDATA automatically
			title: item.querySelector("title")?.textContent?.trim() || "",
			description: item.querySelector("description")?.textContent?.trim() || "",
			pubDate: item.querySelector("pubDate")?.textContent?.trim() || "",
			source: item.querySelector("source")?.textContent?.trim() || "",
		};
	});
}

async function getLatestNewsAbout(topic: string, language: string = "en-US") {
	const params = new URLSearchParams({
		q: `${topic} when:1d`,
		hl: language,
		// gl: 'US', // Recommended for Google News RSS
		// ceid: `US:${language.split('-')[1] || 'en'}`
	});

	const response = await fetch(
		`https://news.google.com/rss/search?${params.toString()}`,
	);
	if (!response.ok) {
		throw new Error("Unable to get news about " + topic);
	}

	return parseRssFeed(await response.text());
}

async function getTopicFromNews(
	topic: string,
	googleNews: NewsItem[],
	persona: PersonaConfig,
): Promise<VideoMetadata> {
	const prompt = persona.promptVideoMetaGivenNews(topic, googleNews);
	const answer = await promptLlm(prompt, "hf");
	return parseAiJson(answer);
}

async function getRandomTopic(persona: PersonaConfig): Promise<VideoMetadata> {
	const answer = await promptLlm(persona.promptVideoMeta, "hf");
	return parseAiJson(answer);
}

async function getBbcNews(): Promise<NewsItem[]> {
	const bbcResponse = await fetch(
		"https://feeds.bbci.co.uk/news/world/rss.xml",
	);
	if (!bbcResponse.ok) {
		throw new Error("failed to get news");
	}

	return parseRssFeed(await bbcResponse.text());
}

export async function generateTopic(
	persona: PersonaConfig,
): Promise<FullTopicContext> {
	if (process.env.DEBUG !== "false") {
		return dummy();
	}

	const newsMappers: Record<string, () => Promise<NewsItem[]>> = {
		bbc: getBbcNews,
		// cnn: getCnnNews,
		// Adding a new source is now just one line
	};

	const allNews: NewsItem[] = (
		await Promise.all(
			persona.newsSources.map(source => {
				const fetcher = newsMappers[source];
				if (!fetcher) throw new Error(`Unknown news source: ${source}`);
				return fetcher();
			})
		)
	).flat();

	const prompt = `
Context: You are a viral content analyst. Your task is to scan the following news headlines and identify exactly ONE topic with the highest potential for social media virality, intense debate, or fringe theories.
The topic must be something I can discuss about. Here are a few words about myself: ${persona.promptPersonality}
Latest News Headlines:
${allNews.map((news) => `${news.title} | ${news.description} (${news.pubDate})`).join("\n")}

Criteria for Selection:
1. Polarizing: Issues that force people to take sides (political, ethical, or cultural divides).
2. "Algorithm-Friendly": Topics that trigger high comment-to-share ratios.
3. Speculative: Events with unanswered questions that naturally invite "conspiracy" or alternative "theories."

Instructions:
- If a high-impact topic exists, provide 1 to 3 (3 MAXIMUM, if you provide more words, you fail) specific keywords optimized for a search engine.
- If the news cycle is "dry" or no news is sensational enough, set "topic" to null.
- Output strictly valid JSON. No prose, no explanations.

Output Format:
{"topic": "keyword1 keyword2"} OR {"topic": null}
`;

	const promptResult = await promptLlm(prompt, "gemini");
	const newsTopic: string | null = parseAiJson(promptResult).topic;

	if (!newsTopic) {
		// console.log("There is no hot topic to cover today");
		const videoMeta = await getRandomTopic(persona);
		return {
			latestNews: [],
			topic: videoMeta.title + " - " + videoMeta.description,
			videoMetadata: videoMeta,
		};
	}

	// console.log("Today the topic is ", newsTopic);
	const latestNews = await getLatestNewsAbout(newsTopic, persona.language);
	const videoMeta = await getTopicFromNews(newsTopic, latestNews, persona);
	return {
		topic: newsTopic,
		latestNews,
		videoMetadata: videoMeta,
	};
}
