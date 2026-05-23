import { grabOauthTokenLocally } from "../utils/google.mts";
import { getKnownChannelIds } from "../persona_group.mts";

const channelId = process.argv[2];
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

const tokensFile = Bun.s3.file("credentials/google_tokens.json");
const existing = (await tokensFile.exists()) ? await tokensFile.json() : {};
await Bun.s3.write(
  "credentials/google_tokens.json",
  JSON.stringify({ ...existing, [channelId]: credentials }, null, 2),
);
console.log(`Tokens saved to S3 for channelId "${channelId}".`);
