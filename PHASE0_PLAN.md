# Phase 0 — Control Plane UI: Implementation Plan

A small authenticated web app to **observe definitions, manage schedules, and
trigger/watch runs** — without touching the personae-as-code problem. Read-only
on definitions, no database, no frontend build step.

The server lives **inside this `app` submodule** at `app/server/` and runs as a
new `api` compose service built from the **same `./app` image** with command
`bun run serve` (the same pattern `bullboard` uses). The `app` service's
Dockerfile CMD stays `handle-messages`, so every existing CLI command is
unchanged. No new top-level directory and no second git submodule.

## Scope

**In:** list personae / groups / shows (read-only); list/create/delete BullMQ
schedulers; trigger a run now; view recent jobs.

**Out (later phases):** editing/creating personae or groups, real auth/sessions,
multi-tenancy, true per-schedule pause, charts/live updates. Raw job internals
stay in `bullboard` (:8001) — we link to it, not rebuild it.

## Architecture

Stateless HTTP tier. The existing worker stays the only queue *consumer*; the
API only *produces* (enqueues) and *reads* (schedulers, jobs, code registries,
S3). Both connect to the same Valkey.

```
 api (Hono)  ──enqueue/read──▶  Valkey (BullMQ)  ◀──consume──  worker (messageHandler)
     │ reads code registries (personae/groups/shows) + S3 (manifests/configs)
```

**Stack:** Hono on `Bun.serve`, `hono/jsx` server-rendered HTML, `hono/basic-auth`
admin gate, HTMX via CDN for form posts. One new dependency: `hono`.

This topology (stateless API + worker + queue + object store) is already the
shape a multi-tenant service needs; Phase 0 just runs it single-tenant.

## File layout (new, under `app/`)

```
app/server/
  index.ts                 # entrypoint: Hono app, auth, route mount, Bun.serve
  config.ts                # env parse: API_PORT, ADMIN_USER, ADMIN_PASS
  auth.ts                  # basicAuth middleware (seam for real sessions later)
  views/layout.tsx         # HTML shell: nav, HTMX <script>, minimal CSS
  routes/
    dashboard.tsx          # GET /         overview + recent jobs
    definitions.tsx        # GET /personae /groups /shows  (+ detail pages)
    schedules.tsx          # GET/POST schedule management
    runs.tsx               # POST trigger-now + recent jobs
  repositories/
    definitions.ts         # listPersonae/Groups/Shows -> DTOs (Postgres slots in HERE later)
    schedules.ts           # wraps BullMQ scheduler API
    jobs.ts                # recent jobs via queue.getJobs
  dto.ts                   # serializable DTOs (strip function fields) + `owner` field
```

Minimal additions to existing files (export the private registries, additive):
- `personae.mts`: `listPersonae()`
- `persona_group.mts`: `listPersonaGroups()`
- `show.mts`: `listShows()`

`package.json`: add `"serve": "bun run server/index.ts"` + `hono` dependency.

## DTO seam (critical)

Personae/groups embed function fields (`promptScriptGuidelines`,
`promptVideoMetaGivenNews`) and an `ArrayBuffer` voice sample — none
JSON-serializable. The repository maps to explicit DTOs picking only
serializable fields, so nothing is silently dropped. Every DTO carries
`owner: "admin"` from day one (cheap multi-tenant insurance); when Postgres +
users arrive, only `repositories/*` change.

## Routes

All behind basic auth except `GET /healthz`. Forms POST and reply `303` → GET.

| Method & path | Action |
|---|---|
| `GET /healthz` | unauthenticated liveness |
| `GET /` | counts + recent jobs |
| `GET /personae`,`/groups`,`/shows` | read-only tables + detail pages |
| `GET /schedules` | list: id, cron, next run, job name, decoded target |
| `POST /schedules` | create: news → `trigger-video-flow {personaGroupName, carryingPersona}`; show → `show-tick {showId}`; `upsertJobScheduler(id, {pattern}, {name, data})` |
| `POST /schedules/:id/delete` | `removeJobScheduler(id)` |
| `POST /runs/trigger` | `assetsQueue.add('trigger-video-flow'|'show-tick', data)` |
| `GET /runs` | recent jobs via `queue.getJobs([...states])`; deep-link to bullboard |

Schedule listing decodes each `getJobSchedulers()` template's `name`/`data` —
BullMQ persists scheduler templates in Valkey, so no separate store is needed.

## Schedules as source of truth (must-fix)

`messageHandler.ts` currently `upsertJobScheduler`s the defaults on every boot,
so a UI delete would be undone by a restart. Fix:
- **System schedulers** (`clean-s3`): keep always-ensured in code (not editable).
- **Content schedulers** (news/show drips): **seed-once** behind a Valkey flag
  `schedulers:seeded`; after that the worker never recreates them, so Valkey
  (driven by the UI) is the real source of truth.

## Auth & security

`hono/basic-auth` with `ADMIN_USER`/`ADMIN_PASS` from env, isolated in `auth.ts`.
This UI can publish to real channels via triggers → bind `api` to localhost or a
TLS reverse proxy; never expose basic-auth-only over plain HTTP. In `DEBUG=1`
triggers are safe (dummy assets, no real uploads).

## Compose

New `api` service from `./app`, command `[bun, run, serve]`, port `8002:8002`
(free: 8000 app, 8001 bullboard, 8080/8081 gateways), same S3/QUEUE env +
`API_PORT`, `ADMIN_USER`, `ADMIN_PASS`. Add the two admin vars to `.env`/`.env.dist`.

## Build order

1. **Registry exports + `hono` dep + `serve` script.** (`tsc` clean.)  ← step 1
2. Skeleton: `config/auth/index/layout`, `/healthz` + `/`; compose `api` service.
3. Definitions read-only: repository + DTOs + `/personae`,`/groups`,`/shows`.
4. Schedules: list/create/delete **+ the seed-once worker change**.
5. Runs: trigger-now + recent jobs.
6. Polish: dashboard counts, nav, bullboard deep-links, README.

## Verification

`tsc --noEmit` per step. `curl` healthz (200, no auth) and a list route (401
without creds, 200 with). Create a schedule → confirm via `getJobSchedulers` +
bullboard; **restart and confirm a UI-deleted default stays deleted** (seed-guard).
Trigger a `secretStoryDebug` run in `DEBUG=1` → episode job runs, no real upload.

## Risks

- Default schedulers clobbering UI deletes → seed-once guard (most important).
- Non-serializable config fields → explicit DTO mappers, never stringify a raw `PersonaConfig`.
- Exposed control plane → localhost/reverse-proxy + basic auth.
- BullMQ `getJobSchedulers` shape/pagination → confirm against installed v5.x; thin wrapper isolates surprises.
