import {parseAiJson, promptLlm, promptLlmObject} from "../utils/llm.mts";
import type {PersonaConfig} from "../personae.mts";
import {z} from "zod";
import {CurrentsMetadata, type NewsArticle} from "./news/currents.ts";
import {JinaReader} from "./news/jina.ts";

export type SummarizedNewsArticle = NewsArticle & {
  summary: string;
};

export type VideoMetadata = {
  hashtags: string[];
  title: string;
  description: string;
};

export const VideoMetadataSchema = z.object({
  hashtags: z
    .array(z.string())
    .min(1)
    .describe('An array of 3-5 trending, relevant hashtags with the # symbol'),

  title: z
    .string()
    .min(5)
    .max(100)
    .describe('A catchy, click-worthy title for the video'),

  description: z
    .string()
    .describe('A brief, engaging SEO-friendly description of the video content'),
});

export type FullTopicContext = {
  latestNews: SummarizedNewsArticle[];
  topic: string;
  videoMetadata: VideoMetadata;
};

function dummy(): { topic: string, latestNews: SummarizedNewsArticle[], videoMetadata: VideoMetadata } {
  return {
    topic: "Hillary Epstein coverup",
    latestNews: [
      {
        id: "0631e7d6-46cb-51a9-884d-bbe8d0fdbdc6",
        title: "DOJ told judge emails suggested Maxwell was arranging young women to have sex with Prince Andrew",
        description: "Documents in the Epstein files show investigators had told a judge that emails suggested Ghislaine Maxwell was arranging young women to have sex with then Prince Andrew.",
        url: "https://abcnews.com/US/doj-told-judge-emails-suggested-maxwell-arranging-young/story?id=131566292",
        author: "ABC News",
        image: "https://i.abcnewsfe.com/a/9ae0fded-f421-490c-b582-b18eca6337ab/maxwell-arrangements_1774940857420_hpMain_16x9.jpg?w=1600",
        language: "en",
        category: ["general"],
        published: "2026-03-31 18:26:23 +0000",
        summary: 'Documents in the Epstein files show investigators had told a judge that emails suggested Ghislaine Maxwell was arranging young women to have sex with then Prince Andrew.'
      },
      {
        id: "ccba856b-1669-5a30-8224-9ec08f5a4311",
        title: "Nolte: Jeffrey Epstein TV Series in the Works",
        description: "Sony Pictures is shopping around a limited TV series about the whole Jeffrey Epstein saga.",
        url: "https://www.breitbart.com/entertainment/2026/03/31/nolte-jeffrey-epstein-tv-series-in-the-works/",
        author: "John Nolte",
        image: "https://media.breitbart.com/media/2026/03/Laura-Dern-Jeffrey-Epstein-640x335.png",
        language: "en",
        category: ["politics_government"],
        published: "2026-03-31 15:19:58 +0000",
        summary: 'Sony Pictures is shopping around a limited TV series about the whole Jeffrey Epstein saga.'
      }
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

async function generateVideoMetadataFromNews(
  newsArticle: SummarizedNewsArticle,
  persona: PersonaConfig,
): Promise<VideoMetadata> {
  const prompt = persona.promptVideoMetaGivenNews(newsArticle);
  return promptLlmObject<VideoMetadata>(prompt, "hf", VideoMetadataSchema);
}

async function generateRandomTopic(persona: PersonaConfig): Promise<VideoMetadata> {
  return await promptLlmObject<VideoMetadata>(persona.promptVideoMeta, "hf", VideoMetadataSchema);
}

export async function generateTopic(
  persona: PersonaConfig,
): Promise<FullTopicContext> {
  if (process.env.DEBUG !== "false") {
    return dummy();
  }

  const currents = new CurrentsMetadata(process.env.CURRENTS_API_KEY!);
  const jina = new JinaReader(process.env.JINA_API_KEY!);

  const articles = await currents.getLatestNews({
    country: persona.newsRegion,
    category: persona.newsTopics,
    page_size: 10
  });

  const prompt = `
Context: You are a viral content analyst. Your task is to scan the following news headlines and identify exactly ONE topic with the highest potential for social media virality, intense debate, or fringe theories.
The topic must be something I can discuss about. Here are a few words about myself: ${persona.promptPersonality}

Latest News Headlines:
${articles.map((news, index) => `Article #${index} | ${news.title} | ${news.description} (${news.published})`).join("\n")}

Criteria for Selection:
* Polarizing: Issues that force people to take sides (political, ethical, or cultural divides).
* "Algorithm-Friendly": Topics that trigger high comment-to-share ratios.
* Speculative: Events with unanswered questions that naturally invite "conspiracy" or alternative "theories.

Grounding Rules (STRICT):
* Event-Driven: Focus on specific, high-stakes events rather than general sentiments.
* Relevance: The article must align with the user's provided persona interests.

Instructions:
1. Identify the single most "viral-ready" article from the list provided.
2. If a relevant article exists, provide its Article Number (the integer index) as the value for "article_index".
3. If the news cycle is "dry" or no news is sensational/relevant enough, set "article_index" to null.
4. Output strictly valid JSON. No prose, no explanations.

Output Format:
{"article_index": 5} OR {"article_index": null}
`;

  const promptResult = await promptLlm(prompt, "gemini");
  const articleIndex: number | null = parseAiJson(promptResult).article_index;

  if (!articleIndex) {
    console.log("There is no hot topic to cover today");
    const videoMeta = await generateRandomTopic(persona);
    return {
      latestNews: [],
      topic: videoMeta.title + " - " + videoMeta.description,
      videoMetadata: videoMeta,
    };
  }

  const bestNews = articles[articleIndex];

  if (!bestNews) {
    throw new Error('Undefined index for best news: ' + articleIndex);
  }

  const summary = await jina.read(bestNews.url, 'text');
  const summarizedArticle = {...bestNews, summary: summary.content};
  const videoMeta = await generateVideoMetadataFromNews(summarizedArticle, persona);

  return {
    topic: summarizedArticle.title,
    latestNews: [summarizedArticle],
    videoMetadata: videoMeta,
  };
}
