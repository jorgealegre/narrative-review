# Storyteller evals

One folder per PR: `diff.patch`, `pr.json` (GitHub REST), then one story per brain:

| File | Brain | How it was made |
|---|---|---|
| `gold-opus.json` + `gold-opus.md` | Claude Opus (subagent, full diff, unlimited time) | The reference. The `.md` lists what a reviewer must not miss and which PR-description claims the diff does not support. |
| `apple.json` + `apple.log` | Apple on-device (`tools/nr-tell`) | One note per hunk, then one outline. |
| `claude-<model>.json` | Claude API from the app | Needs an API key in the app's Settings. Not run yet. |
| `judge.md` | Opus judge (subagent) | Scores each brain against the gold on the rubric below. |

Rubric (0 to 3 each): root cause named; causal order (consumers before deletions); every hunk placed; the must-not-miss points surface in the narrative; no claim from the description repeated without support; chapter titles say what the code does.

Run the on-device brain on every folder: `evals/run-apple.sh`. Rebuild the CLI first with `tools/nr-tell/build.sh`.
