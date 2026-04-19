---
name: narrative-review-setup
description: Install the jorgealegre/narrative-review GitHub Action in the current repository. Creates the workflow file, sets the ANTHROPIC_API_KEY secret, opens the GitHub Pages settings page for the one-click enable, and verifies the first PR renders a review. Use when the user says "install narrative review", "set up narrative review", "add narrative review to this repo", or references the Marketplace listing.
---

# Narrative Review — Install Skill

You are installing [jorgealegre/narrative-review](https://github.com/marketplace/actions/narrative-review) into the user's current repository. The action reorders PR diffs into a causal narrative using Claude.

Follow the steps in order. Stop at each checkpoint to confirm with the user.

## Prerequisites check

Before making any changes, verify:

```bash
# Inside the target repo
git rev-parse --show-toplevel                # confirm git repo
gh auth status                               # confirm gh CLI authenticated
gh repo view --json nameWithOwner,visibility # confirm repo context + public/private
```

If any fail, guide the user to fix before continuing:
- Not in a git repo → `cd` into one
- `gh` not authenticated → `gh auth login`
- Private repo → Pages requires paid plan OR public repo; warn user

## Step 1 — Create the workflow file

Create `.github/workflows/narrative-review.yml` with this content. Write the file directly; do not paste it into the chat:

```yaml
name: Narrative Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]

permissions:
  checks: write
  contents: write
  pages: write
  pull-requests: write

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

Commit on a branch, not directly to main:

```bash
git checkout -b add/narrative-review
git add .github/workflows/narrative-review.yml
git commit -m "Add narrative-review action"
git push -u origin add/narrative-review
gh pr create --fill
```

**Checkpoint 1**: confirm the PR opened and link the user to it.

## Step 2 — Set the Anthropic API key

Ask the user:
- Do they already have an Anthropic API key? If no: send them to https://console.anthropic.com → Settings → API Keys → Create Key. New accounts get $5 free credit.
- Remind them: the key is shown once; copy immediately.

Never ask the user to paste the key into chat. Tell them to run:

```bash
gh secret set ANTHROPIC_API_KEY -R <owner>/<repo>
# paste the key when prompted, then press Ctrl+D
```

Substitute `<owner>/<repo>` with the actual values from `gh repo view --json nameWithOwner`.

Verify:

```bash
gh secret list -R <owner>/<repo>
```

Expect `ANTHROPIC_API_KEY` in the output. Do not print the value — it's not retrievable and `gh secret list` only shows names.

**Checkpoint 2**: confirm secret is listed.

## Step 3 — Trigger the first run

The PR from step 1 will only run the action if it isn't a draft and doesn't have the `wip` label. If the install PR is very small, the action may skip on cost/size guards. For the first run, prefer opening a second test PR with a real diff, or re-run with `force: true`.

Fastest path:

```bash
gh pr checks <pr-number>                     # wait for first run
gh run watch $(gh run list --workflow "Narrative Review" -L 1 --json databaseId --jq '.[0].databaseId')
```

Tell the user:
- Expect ~20s for action runtime
- First run will emit a warning: `Token lacks permission to enable GitHub Pages`. This is normal.
- First run creates the `gh-pages` branch and uploads the review as a workflow artifact.

## Step 4 — Enable GitHub Pages (one-click manual step)

The `GITHUB_TOKEN` cannot enable Pages itself (admin scope required by GitHub API). The user needs to flip it on once per repo.

Give them this URL, substituting repo:

```
https://github.com/<owner>/<repo>/settings/pages
```

Instruct:
1. **Source** → "Deploy from a branch"
2. **Branch** → `gh-pages`
3. **Folder** → `/ (root)`
4. Click **Save**

Pages will build in ~30-60s.

**Checkpoint 4**: verify with

```bash
gh api repos/<owner>/<repo>/pages --jq '{html_url, status, source}'
```

Expect `status: "built"` and `html_url` pointing at `https://<owner>.github.io/<repo>/`.

## Step 5 — Verify the review renders

Re-trigger the action so it picks up the now-live Pages config and writes the live URL into the PR description instead of the artifact fallback:

```bash
# Push an empty commit to the test PR branch
git commit --allow-empty -m "retrigger narrative-review"
git push
```

Wait for the run:

```bash
gh run watch $(gh run list --workflow "Narrative Review" -L 1 --json databaseId --jq '.[0].databaseId')
```

Open the review URL printed in the PR description. Expected: full narrative review page renders with chapters, walkthrough mode works, no console errors.

**Checkpoint 5**: confirm user can open the live review URL and see the narrative.

## Step 6 — Merge the install PR

Once verified:

```bash
gh pr merge <install-pr-number> --squash --delete-branch
```

Done. Every new PR will get an automatic narrative review.

## Troubleshooting

If the user hits issues at any step, consult these:

- **Action fails with "Branch gh-pages not found"**: you're on a stale version of the action. The workflow should pin `@v1` (released with the branch-bootstrap fix). Check `uses:` line.
- **Action skipped, output says "diff too large"**: raise `max-diff-size` in the workflow step inputs, or add the `run-narrative-review` label to the PR to force.
- **Review URL shows 404**: Pages still building. Wait 60s and retry. If persistent, verify `gh-pages` branch has a `reviews/<n>/index.html` file: `gh api repos/<owner>/<repo>/contents/reviews/<n>/index.html?ref=gh-pages`.
- **PR description doesn't update**: token is missing `pull-requests: write` permission. Check the `permissions:` block in the workflow.
- **No action runs at all**: workflow file wasn't committed, or `on.pull_request` types don't include the event. Confirm `.github/workflows/narrative-review.yml` exists on default branch.

## Rollback

If the user wants to remove the action:

```bash
git rm .github/workflows/narrative-review.yml
git commit -m "Remove narrative-review action"
gh secret remove ANTHROPIC_API_KEY
# Optional: delete gh-pages branch if no other site depends on it
git push origin --delete gh-pages
```

They can also disable Pages in Settings → Pages → Unpublish site.
