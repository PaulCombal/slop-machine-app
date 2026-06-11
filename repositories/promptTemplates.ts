import { Eta } from "eta";
import type {
	FullTopicContext,
	SummarizedNewsArticle,
} from "../steps/generate_topic.mts";

/**
 * The two persona prompt FUNCTIONS are stored as editable Eta templates and
 * rendered at runtime (never `eval`d — they're tenant-editable). The config must
 * match between seed-time extraction and runtime rendering: autoEscape off
 * (prompts hold quotes/JSON, not HTML) and autoTrim off (preserve newlines
 * around tags). Both are required to reproduce the originals byte-for-byte.
 */
const eta = new Eta({ autoEscape: false, autoTrim: false });

// ---- Runtime rendering (used by reconstruct.ts to rebuild PersonaConfig) ----

/** Render `promptVideoMetaGivenNews(newsItem)` from its stored template. */
export function renderVideoMetaGivenNews(
	template: string,
	newsItem: SummarizedNewsArticle,
	promptPersonality: string,
): string {
	return eta.renderString(template, { newsItem, promptPersonality });
}

/** Render `promptScriptGuidelines(topic)` from its stored template. */
export function renderScriptGuidelines(
	template: string,
	topic: FullTopicContext,
	promptPersonality: string,
): string {
	return eta.renderString(template, { topic, promptPersonality });
}

// ---- Seed-time extraction (function source -> Eta template) -----------------

/**
 * Convert a persona prompt function into an Eta template. Each `${EXPR}` becomes
 * `<%~ EXPR %>` with identifiers rewritten to the Eta data object:
 *   - `this`           -> `it`          (this.promptPersonality -> it.promptPersonality)
 *   - the fn parameter -> `it.<param>`  (topic.x -> it.topic.x)
 *   - property names (after `.`) and lambda locals are left untouched.
 * Static text is escape-decoded because `fn.toString()` returns Bun's transpiled
 * source, where literals are re-escaped (`’` -> `’`, backticks, `\$`, …).
 */
export function extractEtaTemplate(
	fnSource: string,
	paramName: string,
): string {
	const start = fnSource.indexOf("`");
	const end = fnSource.lastIndexOf("`");
	if (start < 0 || end <= start) {
		throw new Error("Prompt function is not a single template literal");
	}
	const body = fnSource.slice(start + 1, end);

	let out = "";
	let lit = "";
	let i = 0;
	while (i < body.length) {
		if (body[i] === "$" && body[i + 1] === "{") {
			out += decodeEscapes(lit);
			lit = "";
			let depth = 1;
			let j = i + 2;
			let expr = "";
			while (j < body.length && depth > 0) {
				const c = body[j] as string;
				if (c === '"' || c === "'" || c === "`") {
					expr += c;
					j++;
					while (j < body.length && body[j] !== c) {
						if (body[j] === "\\") {
							expr += body.slice(j, j + 2);
							j += 2;
							continue;
						}
						expr += body[j];
						j++;
					}
					expr += body[j];
					j++;
					continue;
				}
				if (c === "{") depth++;
				if (c === "}") {
					depth--;
					if (depth === 0) {
						j++;
						break;
					}
				}
				expr += c;
				j++;
			}
			out += `<%~ ${transformExpr(expr, paramName)} %>`;
			i = j;
		} else {
			lit += body[i];
			i++;
		}
	}
	out += decodeEscapes(lit);
	return out;
}

function transformExpr(expr: string, paramName: string): string {
	const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
	const isIdPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
	let out = "";
	let i = 0;
	let lastSignificant = "";
	while (i < expr.length) {
		const c = expr[i] as string;
		if (c === '"' || c === "'" || c === "`") {
			out += c;
			i++;
			while (i < expr.length && expr[i] !== c) {
				if (expr[i] === "\\") {
					out += expr.slice(i, i + 2);
					i += 2;
					continue;
				}
				out += expr[i];
				i++;
			}
			out += expr[i];
			i++;
			lastSignificant = '"';
			continue;
		}
		if (isIdStart(c)) {
			let id = "";
			while (i < expr.length && isIdPart(expr[i] as string)) {
				id += expr[i];
				i++;
			}
			const isProperty = lastSignificant === ".";
			if (!isProperty && id === "this") out += "it";
			else if (!isProperty && id === paramName) out += `it.${id}`;
			else out += id;
			lastSignificant = "id";
			continue;
		}
		out += c;
		if (!/\s/.test(c)) lastSignificant = c;
		i++;
	}
	return out;
}
// (string indexing is bounds-checked by the surrounding `while` conditions)

/** Reverse JS string-escape sequences in transpiled static template text. */
function decodeEscapes(s: string): string {
	let out = "";
	let i = 0;
	while (i < s.length) {
		if (s[i] !== "\\") {
			out += s[i];
			i++;
			continue;
		}
		const n = s[i + 1] as string;
		switch (n) {
			case "n":
				out += "\n";
				i += 2;
				break;
			case "r":
				out += "\r";
				i += 2;
				break;
			case "t":
				out += "\t";
				i += 2;
				break;
			case "b":
				out += "\b";
				i += 2;
				break;
			case "f":
				out += "\f";
				i += 2;
				break;
			case "v":
				out += "\v";
				i += 2;
				break;
			case "0":
				out += "\0";
				i += 2;
				break;
			case "`":
				out += "`";
				i += 2;
				break;
			case "$":
				out += "$";
				i += 2;
				break;
			case "\\":
				out += "\\";
				i += 2;
				break;
			case "'":
				out += "'";
				i += 2;
				break;
			case '"':
				out += '"';
				i += 2;
				break;
			case "x":
				out += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16));
				i += 4;
				break;
			case "u":
				if (s[i + 2] === "{") {
					const close = s.indexOf("}", i + 3);
					out += String.fromCodePoint(parseInt(s.slice(i + 3, close), 16));
					i = close + 1;
				} else {
					out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
					i += 6;
				}
				break;
			default:
				out += n;
				i += 2;
		}
	}
	return out;
}
