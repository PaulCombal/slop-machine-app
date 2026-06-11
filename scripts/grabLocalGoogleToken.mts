import { grabOauthTokenLocally } from "../utils/google.mts";
import { getKnownChannelIds } from "../persona_group.mts";
import { ensureDatabaseReady } from "../db/bootstrap.ts";
import { initRegistryCache } from "../repositories/registryCache.ts";
import { channelsRepo } from "../repositories/channelsRepo.ts";

const channelId = process.argv[2];

// Definitions live in Postgres — load the cache before reading channel ids.
const admin = await ensureDatabaseReady();
await initRegistryCache(admin.id);
const knownChannelIds = getKnownChannelIds();

if (!channelId) {
  console.error('Usage: bun run grab-google-token-locally <channelId>');
  console.error('Known channelIds: ' + knownChannelIds.join(', '));
  process.exit(1);
}

if (!knownChannelIds.includes(channelId)) {
  console.error(`Unknown channelId "${channelId}". Known: ${knownChannelIds.join(', ')}`);
  process.exit(1);
}

const credentials = await grabOauthTokenLocally();
console.log(credentials);

await channelsRepo.setGoogleTokens(admin.id, channelId, credentials);
console.log(`Tokens saved to DB for channelId "${channelId}".`);
process.exit(0);
