import { assetsQueue } from "./clients/queues.mts";
import { getShow } from "./show.mts";

// Usage: bun run manualStartShow.ts <showId> [--render=false] [--upload=false]
//
// Fires a single show-tick: it computes (and persists) the series breakdown on
// first run, then produces the next pending episode. Run it again to drip the
// next episode, or register a recurring scheduler in messageHandler.ts via
// setupShowScheduler() for automated cadence.

const args = process.argv.slice(2);
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));

const showId = positionalArgs[0] || process.env.DEFAULT_SHOW;
if (!showId) throw new Error("Missing showId");

getShow(showId); // validate early

const render = !args.includes("--render=false");
const upload = !args.includes("--upload=false");

console.log(`Show: ${showId}`);
console.log(`Options:`, { render, upload });

await assetsQueue.add("show-tick", { showId, render, upload });
console.log(`Enqueued show-tick for "${showId}"`);
