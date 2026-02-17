import type { ScriptSentence } from "../types/app";
import myElevenLabsClient from "../clients/elevenlabs.ts";
import type { CharacterAlignmentResponseModel } from "elevenlabs/api";
import type { PersonaConfig } from "../personae.mts";
import { Client } from "@gradio/client";
import type { PersonaGroupConfig } from "../persona_group.mts";

function getWordLevelTimestamps(alignment: CharacterAlignmentResponseModel) {
	const {
		characters,
		character_start_times_seconds,
		character_end_times_seconds,
	} = alignment;
	const words = [];
	let currentWord = "";
	let startTime = null;

	for (let i = 0; i < characters.length; i++) {
		const char = characters[i];
		const start = character_start_times_seconds[i];
		// const end = character_end_times_seconds[i];

		// Initialize start time for a new word
		if (startTime === null) startTime = start;

		if (char === " ") {
			// If we hit a space, push the current word (if not empty)
			if (currentWord.length > 0) {
				words.push({
					text: currentWord,
					start: startTime,
					end: character_end_times_seconds[i - 1],
				});
			}
			currentWord = "";
			startTime = null;
		} else {
			currentWord += char;
		}
	}

	// Catch the last word if the text doesn't end in a space
	if (currentWord.length > 0) {
		words.push({
			text: currentWord,
			start: startTime,
			end: character_end_times_seconds[characters.length - 1],
		});
	}

	return words;
}

function parseSrtToWords(srtContent: string) {
	// Regex to capture: [Index] [Start Time] --> [End Time] [Word]
	// The \s+ matches the line breaks between the time and the word
	const srtRegex =
		/\d+\s+(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s+(.*)/g;
	const words = [];
	let match;

	while ((match = srtRegex.exec(srtContent)) !== null) {
		const [_, startTime, endTime, word] = match;

		words.push({
			start: timeToSeconds(startTime!),
			end: timeToSeconds(endTime!),
			text: word!.trim(),
		});
	}

	return words;
}

function timeToSeconds(timeStr: string): number {
	const [hours, minutes, secondsWithMs] = timeStr.split(":");
	const [seconds, milliseconds] = secondsWithMs!.split(",");

	return (
		parseInt(hours!) * 3600 +
		parseInt(minutes!) * 60 +
		parseInt(seconds!) +
		parseInt(milliseconds!) / 1000
	);
}

async function dummy(
	folder: string,
	sentence: ScriptSentence,
	sentenceId: string,
) {
	const sourceFile = Bun.file(`/assets/debug/sentence_${sentenceId}.ogg`);
	await Bun.s3.write(folder + `/sentence_${sentenceId}.ogg`, sourceFile);
	const subsFile = Bun.file(`/assets/debug/sentence_${sentenceId}_subs.json`);
	sentence.wordsAlignment = await subsFile.json();
}

async function sentenceToSpeech(
	sentence: ScriptSentence,
	folderName: string,
	sentenceId: string,
	persona: PersonaConfig,
) {
	if (process.env.DEBUG !== "false") {
		return await dummy(folderName, sentence, sentenceId);
	}

	if (process.env.TTS_PROVIDER === "elevenlabs") {
		await sentenceToSpeechElevenlabs(sentence, folderName, sentenceId, persona);
	} else {
		await sentenceToSpeechKokoro(sentence, folderName, sentenceId, persona);
	}
}

async function sentenceToSpeechKokoro(
	sentence: ScriptSentence,
	folderName: string,
	sentenceId: string,
	persona: PersonaConfig,
) {
	const client = await Client.connect("NeuralFalcon/Kokoro-TTS-Subtitle");
	const result = await client.predict<Record<string, any>>("/KOKORO_TTS_API", {
		text: sentence.sentence,
		Language: "American English",
		voice: persona.kokoroVoiceId,
		speed: 0.9,
		translate_text: false,
		remove_silence: false,
	});

	const wavUrl = result.data[0].url;
	const srtUrl = result.data[2].url;

	const audioResponse = await fetch(wavUrl);
	const audioFilePath = `${folderName}/sentence_${sentenceId}.ogg`;
	await Bun.s3.write(audioFilePath, audioResponse);

	const srtResponse = await fetch(srtUrl);
	const srtContent = await srtResponse.text();

	sentence.wordsAlignment = parseSrtToWords(srtContent);
}

async function sentenceToSpeechElevenlabs(
	sentence: ScriptSentence,
	folderName: string,
	sentenceId: string,
	persona: PersonaConfig,
) {
	const audio = await myElevenLabsClient.textToSpeech.convertWithTimestamps(
		persona.elevenLabsVoiceId,
		{
			text: sentence.sentence,
			model_id: "eleven_multilingual_v2",
			output_format: "opus_48000_96",
			voice_settings: {
				speed: 0.95,
				stability: 0.33, // Lower stability = more expressive/angry
				similarity_boost: 0.8,
				style: 0.5, // Higher style = more dramatic
			},
		},
	);

	if (!audio.alignment) {
		throw new Error("NO AUDIO ALIGNMENT!!");
	}

	const audioFilePath = folderName + `/sentence_${sentenceId}.ogg`;
	const audioBuffer = Buffer.from(audio.audio_base64, "base64");

	await Bun.s3.write(audioFilePath, audioBuffer);
	sentence.wordsAlignment = getWordLevelTimestamps(audio.alignment);
}

export async function scriptSentencesToSpeech(
	folderName: string,
	sentences: ScriptSentence[],
	persona: PersonaConfig,
): Promise<void> {
	if (process.env.TTS_GENERATION_PARALLEL === "true") {
		const tasks = sentences.map((sentence, index) => {
			return sentenceToSpeech(sentence, folderName, `${index + 1}`, persona);
		});

		await Promise.all(tasks);
	} else {
		for (let i = 0; i < sentences.length; i++) {
			await sentenceToSpeech(sentences[i]!, folderName, `${i + 1}`, persona);
		}
	}
}

export async function scriptSentencesToSpeechForGroup(
	folderName: string,
	sentences: ScriptSentence[],
	personaGroup: PersonaGroupConfig,
): Promise<void> {
	if (process.env.TTS_GENERATION_PARALLEL === "true") {
		const tasks = sentences.map((sentence, index) => {
			const persona = personaGroup.personae.find(
				(p) => p.id === sentence.personaId,
			);
			if (!persona) {
				throw new Error("Persona not found for sentence");
			}
			return sentenceToSpeech(sentence, folderName, `${index + 1}`, persona);
		});

		await Promise.all(tasks);
	} else {
		for (let i = 0; i < sentences.length; i++) {
			const sentence = sentences[i]!;
			const persona = personaGroup.personae.find(
				(p) => p.id === sentence.personaId,
			);
			if (!persona) {
				throw new Error("Persona not found for sentence");
			}
			await sentenceToSpeech(sentence, folderName, `${i + 1}`, persona);
		}
	}
}
