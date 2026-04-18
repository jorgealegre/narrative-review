# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Overview

Narrative Review is a GitHub Action that reorders PR diffs into a causal narrative using Claude. It ships as a single self-contained HTML review page, deployed to `gh-pages` or uploaded as a workflow artifact.

## Repository Layout

```
action/          → GitHub Action entry point + helpers (TypeScript, bundled with ncc)
static/          → Vite entry for the single-file HTML review bundle
src/components/  → React UI (consumed by the static bundle)
src/hooks/       → React hooks (useReviewState, useFancyMode, useTheme)
src/lib/         → Core logic: diff parsing, Claude analysis, coverage verification, shared types
dist-action/     → Committed build output — the bundled GitHub Action
dist-static/     → Committed build output — the HTML review template
tools/           → Local helpers (fixture injector)
```

## Build System

Two build pipelines. Changes to source files require rebuilding the matching dist:

- `npm run build:static` — Vite bundles `static/` + `src/` into `dist-static/index.html` (single file, base64-embedded assets)
- `npm run build:action` — ncc bundles `action/index.ts` into `dist-action/index.js`, then copies `dist-static/index.html` to `dist-action/template.html`
- `npm run build:all` — both, in order

CI (`.github/workflows/build.yml`) auto-rebuilds and commits `dist-action/` + `dist-static/` on PRs when stale.

## Key Conventions

- **TypeScript strict mode**, path alias `@/` → `src/`
- **Tailwind CSS 4** via `@tailwindcss/vite` (static bundle only)
- **No test framework** — coverage-verifier logic is deterministic; use `tools/make-fixture.mjs` for local smoke tests
- **`src/lib/types.ts`** is the single source of truth for shared types across action + static bundle
- **No Next.js**, no SSR, no server. The static bundle must work as a file:// page

## GitHub Action Architecture

- Entry: `action/index.ts` — reads inputs via `@actions/core`, orchestrates fetch → analyze → render → deploy
- `action/github-api.ts` — Octokit wrappers (PR metadata, diff, comments, file contents, PR description updates)
- `action/deploy.ts` — pushes the rendered HTML to `gh-pages`
- `action/check-run.ts` — GitHub Check Run lifecycle
- `action.yml` defines inputs, outputs, branding, and `runs.main: dist-action/index.js`

## Rendering flow

1. `action/index.ts` fetches PR diff + metadata + comments
2. `src/lib/analyzer.ts` calls Claude with the diff (prompt caching enabled)
3. `src/lib/coverage-verifier.ts` ensures every hunk is referenced; backfills an "Uncategorized" chapter if not
4. The `StaticReviewData` object is base64-encoded and injected into `dist-action/template.html` at the `%%REVIEW_DATA_B64%%` marker
5. The result is pushed to `gh-pages` (if enabled) or uploaded as an artifact

## Common Tasks

- **Modify the prompt**: `src/lib/analyzer.ts`
- **Add an input/output**: update `action.yml` AND `action/index.ts`
- **Add a UI component**: place in `src/components/`; verify it renders in `dist-static/fixture.html` after `node tools/make-fixture.mjs`
- **Reference the action's own repo at runtime**: use `process.env.GITHUB_ACTION_REPOSITORY` (GitHub sets this automatically)

## Keeping Docs Up to Date

After any structural change, update:

- **`AGENTS.md`** — layout, conventions, architecture, flow
- **`README.md`** — features, inputs/outputs, architecture tree, tech stack
