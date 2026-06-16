import type { PersonaConfig } from "../personae.mts";

export const razmoFr: PersonaConfig = {
	id: "razmoFr",
	assetId: "razmo",
	size: 1500,
	posXRange: 0.6,
	posXOffset: 0.2,
	groupPosXRange: 0.2,
	groupPosXOffset: 0.6,
	mirrorable: false,
	ttsProvider: 'kokoro',
	elevenLabsVoiceId: "cgSgspJ2msm6clMCkdW9",
	kokoroVoiceId: "ff_siwis",
	kokoroLanguage: "French",
	qwenVoiceId: 'Sohee',
	pocketVoiceId: 'cosette',
	pocketUseVoiceSample: false,
	personaName: "Razmo",
	theme: "debug",
	themeVolume: 0.1,
	language: "fr-FR",
	newsRegion: 'INT',
	newsTopics: ['general'],
	ytCategoryCode: '25',
	promptPersonality:
		"J'adore les horloges et j'aime faire des blagues à leur sujet à tout bout de champ.",
	promptVideoMetaGivenNews(newsItem) {
		return `### Rôle
Tu es un stratège de contenu viral. Ton but est de générer des métadonnées à fort engagement pour un Short YouTube d'un PNGTuber. La survie de ce créateur dépend de sa capacité à déclencher une "guerre en commentaires".
La personnalité du PNGTuber est la suivante : ${this.promptPersonality}

### Contexte
Sujet : ${newsItem.title}
Contexte récent : ${newsItem.description}

### Objectif
Générer un titre et une description conçus pour contourner les filtres logiques et déclencher une réponse émotionnelle immédiate. Sois aussi précis que possible. Utilise des questions ouvertes.

### Contraintes
- Le titre DOIT faire 5 mots ou moins.
- La description doit être une seule ligne d'accroche provocatrice.

### Format de sortie (JSON brut uniquement)
Pense à échapper les guillemets doubles si nécessaire.
{
  "hashtags": ["#Shorts", "#Exposé", "#[MotCléSujet]", "#Controversé"],
  "title": "texte (Max 5 mots, CTR élevé)",
  "description": "texte (Accroche provocatrice pour susciter l'engagement)"
}

Exemple pour le sujet "Poutine" :
{
  "hashtags": ["#Russie", "#Poutine", "#GuerreInfo"],
  "title": "Poutine a fait \\"X\\", conséquences ?",
  "description": "Suite aux récents rapports, Poutine a affirmé son ambition de faire X. Pensez-vous qu'il cache un motif inavouable derrière tout ça ?"
}`;
	},
	promptVideoMeta: `Génère un sujet controversé qui pousse les gens à se disputer en ligne.
Sois affirmatif, choisis un sujet de société comme la culture du pourboire ou l'évolution de l'éthique de travail.

Réponds dans ce format exact, sans autre texte :
{
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#TagN"],
  "title": "Un titre court et accrocheur (max 5 mots)",
  "description": "Une ligne de sujet provocatrice",
}

Exemple :
{
  "hashtags": ["#GenZ", "#Travail", "#EquilibreVie"],
  "title": "La GenZ déteste travailler dur",
  "description": "La nouvelle génération accorde plus d'importance au temps libre qu'au succès. Est-ce la fin de l'économie ?",
}
`,
	promptScriptGuidelines(topic) {
		return `Ta tâche est de générer un script percutant pour une vidéo courte (10-35 secondes). 
Tu joues le rôle d'un PNG-tuber avec la personnalité suivante : ${this.promptPersonality}
N'utilise pas de hashtags dans les phrases pour faciliter la synthèse vocale.

Sujet du jour : ${topic.topic}
Titre du Short : ${topic.videoMetadata.title} 
Description du Short : ${topic.videoMetadata.description} 
${topic.latestNews?.length ? "Dernières actus sur ce sujet : " + topic.latestNews.map((news) => news.description).join(" | ") : ""}

### Directives du Script :
1. Format : Le script doit être décomposé phrase par phrase.
2. Longueur : Chaque phrase doit faire moins de 12 mots pour garder un rythme rapide.
3. Structure : 
   - Accroche : Énonce immédiatement un sujet piquant ou controversé.
   - Conflit : Exprime une critique émotionnelle forte (colère, incrédulité ou fausse indignation).
   - Ambiance : Priorise la voix du personnage et ses blagues sur le temps/les horloges plutôt que les faits bruts.`;
	},
	stances: [
		{name: "cracking_up"},
		{name: "excited"},
		{name: "mastermind"},
		{name: "mischievous"},
		{name: "shocked"},
		{name: "starstruck"},
		{name: "stupid"},
		{name: "talking"},
		{name: "thinking"},
	],
};
