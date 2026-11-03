# Handoff: Narrative Review for Mac

State as of 2026-10-29 (session 1). Read `README.md` first for how to run and verify.

## Where the work is
- Branch `mac-app` in jorgealegre/narrative-review, folder `mac/`. The old Action in the repo root is untouched.
- App: `mac/NarrativeReview` (Xcode 27, macOS only, sandbox off). CLI: `mac/tools/nr-tell`. Evals: `mac/evals`.

## What Jorge asked for (2026-10-29, two voice notes)
1. Independent app first: GitHub via `gh`, bring-your-own Claude key, try Apple on-device. The Claude Code hub is later.
2. Home is a dashboard of what needs you, with the reason, people, checks and a plain-words gist, not a PR list.
3. Background runner: poll GitHub, pre-write stories with the free brain, show checks and a one-line failure summary. No prominent refresh button.
4. Player: word wrap, bigger type. No ticking timer.
5. Ranking: own approved PRs first, then where you block others, then review requests, with age and heat (spicy vs feather).
6. Prove whether Apple on-device is good enough: gold stories from Opus, judged against the cheaper brains. Test Sonnet and Opus through the API when a key exists.
7. Distribution: push the branch; teammates clone and build with a skill. No TestFlight for now. Keep thinking about Developer ID.
8. Keep going without interrupting him.

## Done (session 1, 2026-10-29, latest commit on mac-app: see git log)
- The film: `Player/Film.swift` + `Views/ChapterPlayerView.swift`. Title card on every file change, line numbers,
  syntax color (`Player/SyntaxHighlighter.swift`, tests in NarrativeReviewTests), files grow as they are typed,
  removed lines strike and fade, a callout under the code, a timeline strip with one segment per shot (click to jump),
  auto-roll into the next chapter. Keys: space, ← →, ⇧→, 1-4. Menu "Go": ⌘[ ⌘] history, ⌘⇧H home, ⌘⏎ GitHub, ⌘T tell.
- Platform badges (`Model/Platform.swift`) on cards, rows and the detail; left stripe per platform on cards.
- Design concepts and Codex critique: `design/ia-concepts.md`. Next build = "Screening Room" hybrid, five one-hour changes
  listed at the end of that file (inspector ⌘I, Watch/Inspect toggle, keyboard queue, platform filter chips, verdict bar).
- On-device pipeline got the judge's top change (note order, coverage repair). Re-run `evals/run-apple.sh` to re-score.
- Apple callouts fill hunks a Claude story leaves bare (free). Monthly budget in Settings; status bar goes orange at 80%.
- Previously:
- Dashboard with buckets (Triage in `Model/PullRequest.swift`), GraphQL inbox in one call, gists on device, check-failure notes from annotations, story queue with head-sha staleness, poll loop every 3 min (Settings).
- Player wraps, bigger type. Relative dates are static strings.
- Gold stories for three PRs (`evals/*/gold-opus.*`), Apple runs in progress (`evals/run-apple.sh`).

## Eval verdict (evals/SUMMARY.md, judged by Opus against Opus gold stories)
Apple on-device scored 8, 8 and 6 out of 18 on three real PRs and surfaced 0 of 9 must-not-miss points; some
statements contradict the code. Not good enough as the default story. Keep it for gists, hunk callouts and a
labeled draft pre-pass. The real story needs Claude (API key in Settings). Sonnet 5.5 and Opus 5.5 are untested
until a key exists.

## Session 3 (2026-11-03)
- Home is a board: columns Fix / Answer / Review / Merge / In review / Watching, platform filter chips (⌘1-7), avatars,
  one checks pill, friction pill, conversation brief and the open ask on every card (`Services/Conversation.swift`,
  on device, cached in conversations.json). Each column scrolls on its own.
- Detail: the story is told on open (no button), plays on its own; marquee on top, chapter strip below, ⌘I details
  (a sheet, not `.inspector`: the inspector hid the window from the snapshot hook). Esc goes home. ⌥↑↓ walks the queue.
- Secrets moved from the Keychain to `~/Library/Application Support/NarrativeReview/secrets/` (mode 600): every
  rebuild of an unsigned app is a new app to the Keychain and it prompted each time. A local signing certificate
  would be the proper fix; creating one is blocked for the agent, Jorge can do it in Keychain Access (Certificate
  Assistant, type Code Signing, name "Narrative Review Dev") and then set CODE_SIGN_IDENTITY to it.
- Claude key: still none that works. Jorge's console account cannot create keys (no Developer role); the Action's key
  is a GitHub secret and cannot be read back. Needs the Citizen console admin.
- Snapshot script now lives in `mac/tools/snap.sh`.

## Session 4 (2026-11-03, the film)
- Film: chapter transitions (slide and fade), end card with Watch again / Next in queue / Review on GitHub, adaptive
  typing so no shot runs past 18 s, a hold on the file before changes, a spotlight on the line being written.
- Stories format (Jorge: "like interactive WhatsApp stories, gamified"): segments on top of the stage, click left/right
  to step, hold to pause, rings on the board for stories not watched yet, watched-today and day-streak counters,
  one on-device quiz question on the end card (stored in the review JSON as `quiz`; the film pauses there).
- Test hook lines: `chapter:<n>` selects a chapter, `end` jumps to the closing card, `tell:apple` / `tell:claude:<model>`.
  Mind that `tell:claude:` leaves Claude as the default brain afterwards.

## Open
- **Push**: the branch `mac-app` is committed locally and not pushed (the agent's push was blocked by the permission
  classifier). Jorge runs `git -C ~/Developer/Citizen/narrative-review push -u origin mac-app`.
- Teammates install with the skill `.claude/skills/narrative-review-mac/SKILL.md` (clone, build Release, copy to /Applications).
- No Claude API key on this Mac: the Claude brain is untested. Jorge adds one in Settings, then run the same three PRs.
- Judge pass (`evals/*/judge.md`) once `apple.json` exists for all three.
- Install skill for teammates; push of `mac-app`.
- Snapshot hook renders the sidebar blank (gone now, the home has no sidebar).
