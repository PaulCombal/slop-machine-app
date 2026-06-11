import {CurrentsMetadata} from "../steps/news/currents.ts";
import {JinaReader} from "../steps/news/jina.ts";
import {generateScriptOnTopicForGroup} from "../steps/generate_script.mts";
import {getPersonaGroup} from "../persona_group.mts";
import type {FullTopicContext} from "../steps/generate_topic.mts";
import {ensureDatabaseReady} from "../db/bootstrap.ts";
import {initRegistryCache} from "../repositories/registryCache.ts";

// Definitions live in Postgres — load the cache before any getPersonaGroup call.
const admin = await ensureDatabaseReady();
await initRegistryCache(admin.id);

const personaGroup = getPersonaGroup('peterLoisPolitics');
const models = ['gemini', 'mistral'];
// const models = ['gemini'];
// const models = ['mistral'];

const currents = new CurrentsMetadata(process.env.CURRENTS_API_KEY!);
const jina = new JinaReader(process.env.JINA_API_KEY!);

const articles = await currents.getLatestNews({
  country: personaGroup.personae[0]!.newsRegion,
  category: personaGroup.personae[0]!.newsTopics,
  page_size: 10
});

let i = 0;
for (const article of articles) {
  console.log(i, article.title)
  i++;
}

const input = prompt("Enter the ID of the article to use:");
const selectedIndex = parseInt(input || "");

const article = articles[selectedIndex];
if (!article) {
  throw new Error('Out of range');
}

const summary = await jina.read(article.url, 'text');
const summarizedArticle = {...article, summary: summary.content};

const topic: FullTopicContext = {
  latestNews: [summarizedArticle],
  topic: summarizedArticle.title,
  category: personaGroup.personae[0]!.ytCategoryCode,
  videoMetadata: {
    hashtags: [],
    title: '',
    description: ''
  }
}

for (const modelNickname of models) {
  console.log('====', modelNickname)
  process.env.GROUP_MODEL_ALIAS = modelNickname;
  const script = await generateScriptOnTopicForGroup(personaGroup, topic);

  for (const sentence of script) {
    console.log(sentence.personaId, sentence.sentence)
  }
}

/**
 * ==== gemini 2.5 flash
 * peter So, get this.
 * peter Folks are waiting YEARS for a dating app.
 * razmo Years? For a DATING app? That's insane!
 * peter It's called Raya. For the 'elites'.
 * razmo Elites? Like, fancy people?
 * peter Yeah, 'influencers' and 'celebrities'.
 * peter Total gatekeeping.
 * razmo Seven years on a waitlist? That's a clock-stopper!
 * peter They think they're too good for regular apps.
 * razmo But they're stuck in limbo. What's the secret sauce?
 * peter Referrals. Or you BUY one. Yeah, BUY one!
 * razmo Buy an invite? People are paying for DATES?
 * peter Seventy-five bucks. For a chance. Absolute desperation.
 * razmo Imagine paying to get rejected. Ouch!
 * peter This 'exclusivity' is a scam. Typical woke nonsense.
 * razmo I'll stick to my clocks. Less drama.
 * peter Exactly. Real people don't need digital velvet ropes.
 * ==== mistral large latest
 * peter Alright, listen up, folks. Raya’s waitlist is now longer than a Texas BBQ line.
 * razmo Wait, people are waiting *seven years*? That’s longer than my last relationship!
 * peter Seven years? That’s not a waitlist—that’s a life sentence without parole.
 * razmo Peter, what if Raya’s just a front for a secret society?
 * peter Razmo, it’s worse. It’s a dating app run by the deep state to keep us distracted.
 * razmo So, if I get in, do I get a free tinfoil hat?
 * peter Only if you bring your own conspiracy theories to the first date.
 * razmo Peter, what if Raya’s just a clock? Ticking away our hope?
 * peter Razmo, it’s not a clock—it’s a time-share scam for your love life.
 * razmo So, I should just set my alarm for 2033?
 * peter Or accept that Raya’s just a velvet rope for people who think they’re too good for Tinder.
 * razmo Peter, what if the real Raya is the friends we made along the waitlist?
 * peter Razmo, that’s the most wholesome thing you’ve ever said. And also the dumbest.
 * razmo Hey, at least I’m not paying $25 a month to be ghosted!
 * peter Razmo, you’re not wrong. But you’re still wrong.
 * ==== gemini flash latest
 * peter Listen up. Two million losers are stuck in a seven year dating line.
 * razmo Seven years? My cuckoo clock has better social skills than that!
 * peter It is for Raya. An elite app where you pay to be ignored.
 * razmo They call it a waiting list because your biological clock just stops.
 * peter These models have fifty referrals and still can't get past the velvet rope.
 * razmo One girl waited five years and then emailed them to ask for mercy.
 * peter It is a digital gulag for people who think they are special.
 * razmo If I wait any longer, I will be dating a sundial in the afterlife.
 * peter Just go outside and talk to a human. This is elite mind control.
 * razmo But Peter, think of the ticking! The anticipation is like a pendulum!
 */