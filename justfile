default:
    @just --list

# Rebuild words.json and synthesize any missing recordings from homework/*.txt
data:
    uv run tone-pairs

# Rebuild words.json only (no speech synthesis)
data-dry:
    uv run tone-pairs --no-audio

# Run the app locally
dev:
    bun run dev

# Lint, typecheck, and test both halves
check:
    uv run ruff check pipeline
    uv run ruff format --check pipeline
    uv run pytest -q
    bunx biome check web/src vite.config.ts
    bunx tsc --noEmit
    bun test web

# Format and fix lint
fix:
    uv run ruff check --fix pipeline
    uv run ruff format pipeline
    bunx biome check --write web/src vite.config.ts

build:
    bun run build

# Build and publish to https://tone-pairs.pages.dev
deploy: build
    wrangler pages deploy dist --project-name tone-pairs --branch main --commit-dirty=true
