# /app

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Environment

Les vars d'en qui ne sont pas set dans le docker compose

| Var name                 | description                             | values                     |
|--------------------------|-----------------------------------------|----------------------------|
| TTS_GENERATION_PARALLEL  | Run TTS API requests concurrently       | true/unset                 |
| ILLUSTRATION_DL_PARALLEL | Run illustration downloads concurrently | true/unset                 |
| TTS_PROVIDER             | Choose which TTS provider to use        | elevenlabs/kokoro(default) |

## Code format

```shell
bunx biome format --write .
```