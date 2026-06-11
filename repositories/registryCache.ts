import { assetsQueue } from "../clients/queues.mts";
import { ensureAdminUser } from "../db/users.ts";
import type { PersonaGroupConfig } from "../persona_group.mts";
import type { PersonaConfig } from "../personae.mts";
import type { ShowConfig } from "../show.mts";
import { groupRepo } from "./groupRepo.ts";
import { personaRepo } from "./personaRepo.ts";
import { showRepo } from "./showRepo.ts";

/**
 * In-memory snapshot of the admin tenant's definitions, so `getPersona/getShow`
 * stay SYNCHRONOUS (call sites build group/show literals at module load). Loaded
 * once at boot, refreshed on a Valkey pub/sub signal so a UI edit reaches the
 * running worker without a restart.
 */

const INVALIDATE_CHANNEL = "definitions:invalidate";

type Registry = {
	personae: Map<string, PersonaConfig>;
	groups: Map<string, PersonaGroupConfig>;
	shows: Map<string, ShowConfig>;
};

let registry: Registry | null = null;
let ownerId: string | null = null;
let initPromise: Promise<void> | null = null;
// biome-ignore lint/suspicious/noExplicitAny: ioredis client type lives in bullmq.
let subscriber: any = null;

async function load(owner: string): Promise<Registry> {
	const [personae, groups, shows] = await Promise.all([
		personaRepo.listByOwner(owner),
		groupRepo.listByOwner(owner),
		showRepo.listByOwner(owner),
	]);
	return {
		personae: new Map(personae.map((p) => [p.id, p])),
		groups: new Map(groups.map((g) => [g.name, g.config])),
		shows: new Map(shows.map((s) => [s.id, s])),
	};
}

/**
 * Load the registry and subscribe to invalidations. Call EXACTLY once at boot,
 * strictly before any synchronous getter is used (and before `new Worker(...)`).
 * Idempotent: concurrent/duplicate calls share the same in-flight init.
 */
export async function initRegistryCache(owner?: string): Promise<void> {
	if (registry) return;
	if (initPromise) return initPromise;
	initPromise = (async () => {
		ownerId = owner ?? (await ensureAdminUser()).id;
		registry = await load(ownerId);
		await subscribeInvalidation();
		console.log(
			`📚 Registry cache loaded: ${registry.personae.size} personae, ${registry.groups.size} groups, ${registry.shows.size} shows`,
		);
	})();
	return initPromise;
}

async function reload(): Promise<void> {
	if (!ownerId) return;
	registry = await load(ownerId);
	console.log(
		`🔄 Registry cache reloaded: ${registry.personae.size} personae, ${registry.groups.size} groups, ${registry.shows.size} shows`,
	);
}

async function subscribeInvalidation(): Promise<void> {
	if (subscriber) return;
	const client = await assetsQueue.client;
	// A subscriber connection can't run other commands, so duplicate the pool one.
	subscriber = client.duplicate();
	await subscriber.subscribe(INVALIDATE_CHANNEL);
	subscriber.on("message", (channel: string) => {
		if (channel === INVALIDATE_CHANNEL) {
			reload().catch((e) =>
				console.error("Registry cache reload failed:", e),
			);
		}
	});
}

/** Publish an invalidation so every process (worker + servers) reloads. */
export async function publishInvalidate(): Promise<void> {
	const client = await assetsQueue.client;
	await client.publish(INVALIDATE_CHANNEL, "1");
}

function ensureLoaded(): Registry {
	if (!registry) {
		throw new Error(
			"Registry cache not initialized — call initRegistryCache() before use",
		);
	}
	return registry;
}

export function getPersonaFromCache(key: string): PersonaConfig {
	const p = ensureLoaded().personae.get(key);
	if (!p) throw new Error("NO PERSONA WITH THIS NAME: " + key);
	return p;
}

export function listPersonaeFromCache(): PersonaConfig[] {
	return [...ensureLoaded().personae.values()];
}

export function getPersonaGroupFromCache(key: string): PersonaGroupConfig {
	const g = ensureLoaded().groups.get(key);
	if (!g) throw new Error("NO PERSONA GROUP WITH THIS NAME");
	return g;
}

export function listPersonaGroupsFromCache(): {
	name: string;
	config: PersonaGroupConfig;
}[] {
	return [...ensureLoaded().groups.entries()].map(([name, config]) => ({
		name,
		config,
	}));
}

export function getKnownChannelIdsFromCache(): string[] {
	return [
		...new Set([...ensureLoaded().groups.values()].map((g) => g.channelId)),
	];
}

export function getShowFromCache(id: string): ShowConfig {
	const s = ensureLoaded().shows.get(id);
	if (!s) throw new Error("NO SHOW WITH THIS ID: " + id);
	return s;
}

export function listShowsFromCache(): ShowConfig[] {
	return [...ensureLoaded().shows.values()];
}
