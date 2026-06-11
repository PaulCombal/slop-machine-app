# Control-plane UI (`api` service)

A small authenticated web app to **observe definitions, manage schedules, and
trigger/watch runs**. It runs from the **same image** as the worker (`./app`),
just with a different command (`bun run serve`), and shares Valkey/S3 with the
rest of the stack. No database — see "Data" below.

## Run

```bash
docker compose up -d api      # http://localhost:8002  (bound to 127.0.0.1 only)
```

Then open <http://localhost:8002> and log in with `ADMIN_USER` / `ADMIN_PASS`.

Locally without Docker:

```bash
cd app && bun run serve       # needs QUEUE_HOST reachable (e.g. valkey)
```

## Routes

| Path | What |
|------|------|
| `GET /healthz` | unauthenticated liveness (`{ok, debug}`) |
| `GET /` | dashboard: definition + queue counts, recent jobs |
| `GET /personae` `/groups` `/shows` (+ `/:id`) | read-only definition tables & detail |
| `GET /schedules` | list schedules; create (news/show) & delete forms |
| `POST /schedules` · `POST /schedules/:id/delete` | manage BullMQ schedulers |
| `GET /runs` | recent jobs + trigger-now forms |
| `POST /runs/trigger` | enqueue a one-off `trigger-video-flow` / `show-tick` |

Everything except `/healthz` is behind HTTP basic auth.

## Config (env)

| Var | Default | Notes |
|-----|---------|-------|
| `API_PORT` | `8002` | listen port |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin` | basic-auth credentials — **change in prod** |
| `QUEUE_HOST` | `valkey` | Valkey/Redis host |
| `DEBUG` | (from stack) | anything but `"false"` ⇒ triggers produce dummy assets |

## Data (no database)

- **Definitions** (personae / groups / shows) are read from code via the
  `listPersonae/Groups/Shows()` registry exports — **read-only** here.
- **Schedules** live in Valkey: BullMQ persists scheduler templates, so this UI
  is their source of truth. The worker seeds defaults **once** (Valkey flag
  `schedulers:seeded`), so a schedule you delete here is not recreated on
  restart. To re-seed the defaults, delete that key.
- **Jobs** are read from the `assets-pipeline` queue; the worker stays the only
  consumer. Deep job internals live in **bullboard** (:8001), which the UI links
  to rather than reimplementing.

## Security

This control plane can publish to **real channels** via triggers. It is bound to
`127.0.0.1` in compose and gated by basic auth — never expose it over plain
HTTP; put it behind a TLS reverse proxy if it must be reachable remotely. In
`DEBUG` mode triggers are safe (dummy assets, no uploads).

## Architecture

```
 api (Hono)  ──enqueue/read──▶  Valkey (BullMQ)  ◀──consume──  worker (messageHandler)
     │ reads code registries (personae/groups/shows)
```

Stateless HTTP tier. The repository layer (`server/repositories/*`) isolates the
data source and the DTO layer (`server/dto.ts`) strips non-serializable config
fields (function fields, the voice-sample `ArrayBuffer`) and stamps `owner` on
every record — so adding Postgres + real users later touches only those layers.

See `../PHASE0_PLAN.md` for the full plan and roadmap.
