# Narrative Review for Mac

A standalone macOS app that turns a pull request into a story you can watch.
It is the viewer. The brain that writes the story is swappable.

## Run it

1. Open `NarrativeReview/NarrativeReview.xcodeproj` in Xcode 27 and press Run, or:

   ```bash
   cd mac/NarrativeReview && xcodebuild -scheme NarrativeReview -destination 'platform=macOS' build && open DerivedData/Build/Products/Debug/NarrativeReview.app
   ```

2. Sign in to GitHub once in Terminal with `gh auth login`. The app reads that login. There is no login screen.
3. Pick a PR in the inbox, choose a brain in the header, press **Tell the story**.

## What is in the box

| Piece | File | What it does |
|---|---|---|
| Inbox | `Views/InboxView.swift` | Open PRs that involve you (`is:pr is:open involves:@me` plus the scope in Settings). |
| Story | `Model/Models.swift` | Same JSON shape as the GitHub Action (`src/lib/types.ts`), so `review.json` files import as is (File menu). |
| Diff | `Services/DiffParser.swift` | Port of `src/lib/diff-parser.ts`. Same hunk indices as the Action. |
| Brain: Apple | `Services/FoundationStoryteller.swift` | On-device Foundation Models. Free, private, 4k-token window, so it reads one hunk at a time and then writes the outline from the notes. |
| Brain: Claude | `Services/Storyteller.swift` | Messages API with structured output. Key lives in the Keychain. Cost per story recorded in the ledger. |
| Player | `Player/ReplayEngine.swift`, `Views/ChapterPlayerView.swift` | Each chapter plays as a movie: removed lines fade out, added lines get typed. Speed, scrub, auto-advance. |
| Status bar | `Views/StatusBar.swift` | GitHub login, brain in use, spend today and total. Always visible. |
| Coverage | `Services/DiffParser.swift` (`CoverageVerifier`) | Every hunk lands in a chapter or in "Uncategorized", like the Action. |

Stories and the cost ledger live in `~/Library/Application Support/NarrativeReview/`.

## Agent testing hook (Debug builds only)

`Services/DebugSnapshot.swift` watches `~/Library/Application Support/NarrativeReview/snapshot.request`.
Line 1 is a PNG path, line 2 a PR id to select (`owner/repo#number`), line 3 `tell` to run the storyteller and wait.
The app renders its window to the PNG and writes the model state to `<png>.txt`. No screen-recording permission needed.
The sidebar renders blank in this capture (vibrancy); the state file is the truth for the inbox.

## Decisions so far

- **No App Sandbox** so the app can read the `gh` login. TestFlight for Mac needs the sandbox, so distribution is Developer ID (or an in-app GitHub device-flow login later).
- **macOS only** for now. The project template is multiplatform; `SUPPORTED_PLATFORMS` is pinned to `macosx`.
- **Claude default model** is `claude-opus-5-5`; Sonnet 5.5 and Haiku 5.5 are in the picker.
- **The hub idea** (sessions push story JSON over a local MCP server) is a third `Storyteller` to add later; nothing in the viewer depends on where the JSON came from.
