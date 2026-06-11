import { Hono } from "hono";
import { ensureDatabaseReady } from "../db/bootstrap.ts";
import { initRegistryCache } from "../repositories/registryCache.ts";
import { requireAuth } from "./auth/middleware.ts";
import { config } from "./config.ts";
import { auth } from "./routes/auth.tsx";
import { channels } from "./routes/channels.tsx";
import { dashboard } from "./routes/dashboard.tsx";
import { definitions } from "./routes/definitions.tsx";
import { satisfying, themes } from "./routes/media.tsx";
import { runs } from "./routes/runs.tsx";
import { schedules } from "./routes/schedules.tsx";

// Apply migrations, ensure the admin user, and seed definitions before serving.
const admin = await ensureDatabaseReady();
// Load the registry cache + subscribe to invalidations so any code path that
// resolves definitions synchronously works and stays coherent with the worker.
await initRegistryCache(admin.id);

const app = new Hono();

// Unauthenticated liveness + login/logout — everything else is behind the gate.
app.get("/healthz", (c) => c.json({ ok: true, debug: config.debug }));
app.route("/", auth);

app.use("*", requireAuth);

app.route("/", dashboard);
app.route("/", definitions);
app.route("/", themes);
app.route("/", satisfying);
app.route("/", channels);
app.route("/", schedules);
app.route("/", runs);

console.log(`api listening on :${config.port} (debug=${config.debug})`);

export default {
	port: config.port,
	fetch: app.fetch,
};
