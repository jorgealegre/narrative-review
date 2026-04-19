# Narrative Review

**Code review as a story, not a file list.**

Narrative Review is a GitHub Action that uses Claude to reorder pull request diffs into a causal narrative — starting from the root cause and building outward — so reviewers understand *why* changes happened, not just *what* changed.

![Landing Page](docs/landing.png)

---

## Why

GitHub's default PR view lists files alphabetically. When a PR deletes a view, you don't know *who called that view* until you scroll past twenty other files. When a feature flag is removed, the cascading deletions make no sense without seeing the flag removal first.

Narrative Review fixes this. It feeds your entire diff to Claude, which identifies the root cause, traces the dependency chain, and groups changes into chapters ordered by causality — like a technical document that walks you through the reasoning.

## Features

- **Narrative ordering** — AI reorders diff hunks into causal chapters, root cause first
- **100% coverage verification** — every hunk appears in at least one chapter; uncovered changes flagged in an "Uncategorized" chapter
- **Safety annotations** — per-chapter notes flag risks and breaking changes
- **Connection threading** — each chapter explains how it relates to the previous one
- **Self-contained HTML** — review renders as a single HTML file; no server required
- **Walkthrough mode** — full-screen, chapter-by-chapter presentation
- **Three diff views** — Unified, Compact (context collapsed), Split
- **Progress tracking** — mark chapters reviewed; local-storage persistence
- **Keyboard nav** — `j`/`k`/`Space`/`n`/`?`
- **Inline PR comments** — existing PR review comments are rendered at their line
- **Hide whitespace** — filters out whitespace-only changes
- **Syntax-highlighted** — language-aware diff coloring
- **Cost transparency** — token usage + dollar cost shown per review
- **Prompt caching** — system prompt cached across runs

---

## Install

> **Using Claude Code?** Skip the manual steps. Run this once from any repo you want to install the action in:
>
> ```
> /skill install github:jorgealegre/narrative-review/.claude/skills/narrative-review-setup
> ```
>
> Then invoke `/narrative-review-setup` — Claude walks you through workflow creation, API key secret, and Pages enablement end-to-end.

### 1. Add the workflow

Create `.github/workflows/narrative-review.yml`:

```yaml
name: Narrative Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]

permissions:
  checks: write      # post a GitHub check run with review summary
  contents: write    # create/update the gh-pages branch
  pages: write       # read Pages config to resolve the review URL
  pull-requests: write  # add the review link to the PR description

jobs:
  review:
    runs-on: ubuntu-latest
    if: >-
      contains(github.event.pull_request.labels.*.name, 'run-narrative-review') ||
      (
        !github.event.pull_request.draft &&
        !contains(github.event.pull_request.labels.*.name, 'wip')
      )
    steps:
      - uses: jorgealegre/narrative-review@v1
        id: narrative
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Upload review artifact
        if: success() && steps.narrative.outputs.skipped != 'true'
        uses: actions/upload-artifact@v4
        with:
          name: narrative-review-${{ github.event.pull_request.number }}
          path: _narrative-review-output/index.html
          retention-days: 90
          overwrite: true
```

### 2. Add the Anthropic API key

Via UI: **Settings → Secrets and variables → Actions → New repository secret** → name `ANTHROPIC_API_KEY`.

Or via `gh` CLI:

```bash
gh secret set ANTHROPIC_API_KEY -R <owner>/<repo>
# paste the key and press Ctrl+D
```

Get a key at [console.anthropic.com](https://console.anthropic.com). New accounts get $5 free credit.

### 3. Enable GitHub Pages (one click, first time only)

On the first PR the action automatically creates a `gh-pages` branch and seeds it with `.nojekyll` + a placeholder `index.html`. Because the GitHub-provided `GITHUB_TOKEN` lacks admin scope, you'll also need to flip Pages on once:

**Settings → Pages → Source → "Deploy from a branch" → `gh-pages` / `/ (root)` → Save**

From the next PR onward everything is automatic — reviews are served at `https://<owner>.github.io/<repo>/reviews/<pr-number>/` and the URL is posted back to the PR description.

If you skip this step, the action falls back to uploading the review HTML as a workflow artifact (downloadable from the Actions tab of the run).

---

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic-api-key` | *required* | Anthropic API key |
| `github-token` | `${{ github.token }}` | GitHub token (auto-provided) |
| `model` | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-6` |
| `max-diff-size` | `512000` | Max diff size in bytes before skipping |
| `max-lines` | `5000` | Max total lines changed before skipping |
| `max-cost` | `2.00` | Max estimated cost (USD) before skipping |
| `force` | `false` | Bypass all size/cost/line checks |

## Outputs

| Output | Description |
|--------|-------------|
| `review-url` | URL to the generated review page |
| `chapters` | Number of chapters generated |
| `skipped` | `true` when the review was skipped by a guard |

## Built-in guards

The action skips automatically when the PR is a draft, labeled `wip`, larger than 5,000 lines, or estimated to cost more than $2.00. Force it on any PR with the `run-narrative-review` label.

## Model cost guide

| Model | Rough cost per review |
|-------|-----------------------|
| `claude-haiku-4-5-20251001` | ~$0.01 |
| `claude-sonnet-4-6` | ~$0.10 |
| `claude-opus-4-6` | ~$0.50 |

---

## Troubleshooting

**"404 / There isn't a GitHub Pages site here" when I open the review URL**
The `gh-pages` branch was created but Pages hasn't been enabled yet. Go to **Settings → Pages → Source → "Deploy from a branch" → `gh-pages` / `/ (root)`** and click Save. Pages builds in ~30-60s, then reload.

**Action warns "Token lacks permission to enable GitHub Pages"**
Expected on first run. GitHub's auto-provided `GITHUB_TOKEN` can write to the `gh-pages` branch but cannot enable Pages itself (admin scope required). One-click manual enable per repo — see above.

**PR description shows "Download the review" instead of a live URL**
Either the `gh-pages` deploy failed (check the action logs) or Pages isn't enabled yet. The review is available as a workflow artifact — click the run in the Actions tab, scroll to Artifacts, download and open `index.html`.

**Two check-run lines appear on the PR ("review" and "Narrative Review")**
Normal. `review` is GitHub's auto-generated status for the workflow job; `Narrative Review` is our custom check-run that carries the chapter count and a "View Review" link.

**Action skipped unexpectedly**
Check the action log for the skip reason. Guards: draft PR, `wip` label, > 5000 lines, estimated cost > $2. Force with the `run-narrative-review` label or set `force: true` in the step inputs.

**Rate limit / 429 from Claude**
Raise the `max-cost` input or switch to `claude-haiku-4-5-20251001` for cheaper runs. Prompt caching amortizes the system prompt across runs within a 5-minute window.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` | Next chapter |
| `k` | Previous chapter |
| `Space` | Toggle chapter reviewed |
| `n` | Jump to next unreviewed |
| `?` | Show shortcut help |

---

## Development

### Prerequisites

- Node.js 20+

### Setup

```bash
git clone https://github.com/jorgealegre/narrative-review.git
cd narrative-review
npm install
```

### Build targets

| Command | Output | Purpose |
|---------|--------|---------|
| `npm run build:static` | `dist-static/index.html` | Self-contained HTML review page (Vite + singlefile) |
| `npm run build:action` | `dist-action/index.js` + `template.html` | Bundled action (ncc) |
| `npm run build:all` | Both | Runs `build:static` then `build:action` |
| `npm run lint` | — | ESLint |

### Local smoke test

Build first, then inject a synthetic review into the static bundle:

```bash
npm run build:all
node tools/make-fixture.mjs
open dist-static/fixture.html
```

### How deployment works

The `dist-action/` and `dist-static/` directories are **committed to the repo**. Consumers reference the action via `uses: jorgealegre/narrative-review@main`, which runs `dist-action/index.js` directly. Changes are live the moment they merge to `main`.

A CI workflow (`.github/workflows/build.yml`) rebuilds `dist-action/` and `dist-static/` on every PR and commits the result back to your branch if anything changed.

---

## Architecture

```
action/
├── index.ts              # Action entry: fetch PR → analyze → render HTML → deploy
├── github-api.ts         # GitHub REST wrappers
└── deploy-to-pages.ts    # gh-pages upload helper
src/
├── components/           # React UI (shared with static bundle)
├── hooks/                # useReviewState, useFancyMode, useTheme
└── lib/
    ├── types.ts          # Shared types
    ├── diff-parser.ts    # Unified diff parser
    ├── analyzer.ts       # Claude narrative analysis + prompt caching
    └── coverage-verifier.ts  # Deterministic hunk coverage check
static/                   # Vite single-file bundle entry
tools/make-fixture.mjs    # Local fixture injector
```

### Analysis flow

1. **Fetch** — diff + metadata via GitHub REST API
2. **Parse** — unified diff parsed into files and hunks
3. **Analyze** — full diff + PR description sent to Claude with a system prompt instructing causal ordering
4. **Verify** — deterministic check ensures every hunk is referenced by at least one chapter
5. **Backfill** — uncovered hunks grouped into an "Uncategorized" chapter with warnings
6. **Render** — review data injected into a pre-built HTML bundle as base64
7. **Deploy** — HTML pushed to `gh-pages` branch (or uploaded as artifact)

---

## Tech stack

- **React 19** + **Tailwind CSS 4** — UI
- **Vite** + **vite-plugin-singlefile** — static bundle
- **@vercel/ncc** — action bundle
- **@anthropic-ai/sdk** — Claude API with prompt caching
- **@actions/core** + **@actions/github** — action runtime
- **TypeScript** — throughout

---

## License

MIT
