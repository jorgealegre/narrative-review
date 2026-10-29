# Narrative Review for Mac: three IA concepts

Written 2026-10-29 for Jorge, after "better, but you can do way way better".
Scope: information architecture, layout, actions, keys, and feel. No Swift was changed.

## Where the app is today (one paragraph)

Home is a scrolling "needs you" dashboard: a greeting, then buckets (Ready to merge, Fix checks,
Answer the reviewer, Waiting on your review, ...) of wide PR cards with a gist sentence, people,
checks and heat. A card pushes a PR detail: a tall text header (gist, title, repo, reviewers,
checks, open threads, coverage), then a split with a chapter list on the left and a player on the
right (a 260 pt narrative box, a transport bar, and the hunk typed out in plain monospace). The
repo is a grey `owner/repo #123` string. There is no way to act (approve, comment, ask) inside the
app; the only shortcuts are Space, ⌘R, ⌘⇧H and ⌘⇧I. The story is good; the frame around it is
a web page.

**Update while this was written.** Another session changed the working tree (uncommitted) during
this pass. It added: a platform badge and a colored card edge (`Model/Platform.swift`, guessed from
the repo name), ⌘[ / ⌘] history in a Go menu, ⌘⏎ Open on GitHub, ⌘T Tell the story, and a new
film player (`Player/Film.swift`): file title cards, line numbers, syntax color, an Apple callout
under each hunk, a timeline strip, and Space / ← / → / ⇧→ / 1–4 keys. The concepts below were
written against the older code; the recommendation at the end is written against the new tree.

## Shared foundations (all three concepts use these)

- **Platform identity.** Every PR carries a platform, derived from the repo (a map in Settings):
  iOS (Apple logo, blue), Android (robot glyph asset, green), Backend (`server.rack`, violet),
  Data (`cylinder.split.1x2`, teal), Infra (`shippingbox` / `cloud`, orange), Lookout dashboards
  (`chart.xyaxis.line`, pink). The color is the PR's key color everywhere: card edge, stage
  vignette, scrubber, cursor. You know the platform before you read a word.
- **Syntax-highlighted stage.** The code player tokenizes per language (Swift, Kotlin, Go, SQL,
  YAML, TS, JSON) and types it out with color. Removed lines still fade; added lines still type.
- **Local-AI callouts.** The on-device model writes short callouts anchored to a line range
  ("drops the nil check", "new query, no index", "copy changed"). They appear as margin pins that
  pop in when the cursor reaches the line, like subtitles. Story `annotation` and `safetyNotes`
  become callouts too. Red pins = risk, amber = worth a look, grey = context.
- **One review draft per PR.** Approve, comment, request changes and "ask the author" all write
  into a pending review that you submit once (⌘⏎), with a confirm sheet showing the exact text.
- **History.** Every open, chapter jump and filter is a history entry: ⌘[ and ⌘] always work.

---

## Concept 1: Screening Room (cinema)

**Pitch.** The app is a small cinema. Home is a *marquee*: a dark wall of posters, one per PR
that needs you, sized by urgency and tinted by platform, with the bucket reason as the tagline
("Ready to merge", "Kunal is waiting on you"). Pick a poster and it expands (matched-geometry
zoom) into the *screening room*: a full-bleed code stage with the chapter titles as scenes along
the bottom. The narrative is not a text box; it is a lower-third subtitle that fades in at the
start of each scene. When the last scene ends the *credits* roll: a verdict card with Approve,
Comment, Ask the author, and the "up next" poster counting down.

**Screen map.**
- Marquee (home): top row "Now showing" = the 1–3 most urgent posters, big. Below, rows by
  bucket, smaller posters. Quiet buckets (Watching, Drafts) are a single "Coming soon" shelf.
  Poster = platform glyph + color, gist in large type, author face, checks as a light strip
  along the bottom edge, heat as a subtle glow. No repo strings unless you hover.
- Screening room: stage (90% of the window), scene strip + scrubber at the bottom, a thin top
  bar (platform chip, gist, people, checks dot row). ⌘I slides in an "info" drawer from the right
  with the old header content (threads, coverage, failing checks with their one-line reason).
- Credits: verdict card over a dimmed last frame; open threads listed as "unresolved plot points".
- Settings: Brains, Inbox, Platforms (repo → platform map, colors), Keys (rebind), Playback
  (speed, auto-advance, "skip context lines").

**Acting from the review.** Press C at any moment: playback pauses, a comment bubble opens on the
cursor line. Q drafts "Ask the author" from the current callout ("Why drop the nil check here?")
for you to edit. A on the credits card approves; ⌘⏎ submits the pending review.

**Keys.** Space play/pause; J/K/L back/pause/forward (L twice = 2×); ←/→ previous/next hunk;
⇧←/⇧→ previous/next scene; ↑/↓ on the marquee move between posters, Return opens; Esc leaves the
room; ⌘[ ⌘] history; C comment, Q ask, A approve, X request changes, ⌘⏎ submit; ⌘I info
drawer; ⌘O open on GitHub; ⌘K command palette; ⌘1–⌘6 filter the marquee by platform; ⌘⌃F true
full screen; ? shows the key sheet.

**What makes it fun.** It looks like a streaming app, not a code tool: posters, a zoom into the
room, subtitles, credits, an "up next" countdown that chains your whole queue into one session.
**Risk:** the poster wall can hide how much is waiting; the cinema frame costs a click versus a list.

---

## Concept 2: The Reel (radical, one timeline)

**Pitch.** There are no screens. Your whole queue is one film strip across the bottom of the
window, left to right in priority order: each PR is a reel colored by platform, each chapter a
segment inside it, each hunk a tick. The stage above always shows whatever sits under the
playhead. Scrub with the trackpad and you fly through the morning's work; let it play and the app
reads your queue to you, PR after PR. "Home" is just the playhead at the start of the reel with
the whole strip zoomed out.

**Screen map.**
- One window. Top 75%: stage (code, callouts, subtitle narrative). Bottom 25%: the reel. Zoomed
  out (pinch or ⌘-), the reel is a queue overview: platform-colored blocks with gist labels,
  width = size of the PR, red notches = failing checks, speech-bubble notches = open threads.
  Zoomed in (⌘+), it becomes a chapter scrubber for one PR.
- Above the reel, a thin "now playing" line: platform chip, gist, author, bucket reason.
- Markers on the reel: your comments (blue flags), callouts (colored pins), approvals (a green
  seal over the whole reel segment). The reel is also the record of what you did today.
- Settings in a sheet, same sections as Concept 1.

**Acting from the review.** Acting drops a flag at the playhead: C comment, Q ask, A approve the
reel under the playhead. Flags collect; at the end of each reel a 3-second "verdict gap" asks
whether to submit, and ⌘⏎ submits. Approved reels shrink and slide out of the strip.

**Keys.** Space play/pause; J/K/L shuttle (repeat to speed up); ←/→ hunk; ⇧←/⇧→ chapter;
⌥←/⌥→ previous/next PR; ⌘- / ⌘+ zoom reel; ⌘0 fit the whole queue; ⌘[ ⌘] playhead history;
C/Q/A/X/⌘⏎ as in Concept 1; ⌘1–⌘6 solo a platform (others dim, playback skips them);
M mute a PR (push to tomorrow); ⌘K palette; ? key sheet.

**What makes it fun.** Scrubbing your whole day like a video editor. The queue is physical: you
watch it shorten. It is the fastest path for a "watch everything in order" morning.
**Risk:** hard to build (one continuous timeline over many async stories), hard to jump to "the
one PR Kunal pinged me about", and a missing story leaves a hole in the film.

---

## Concept 3: Desk & Stacks (spatial cards)

**Pitch.** Your queue is a desk with one lane per platform: iOS, Android, Backend, Data, Infra,
Lookout. Each lane is a stack of cards, urgent on top. You deal with the top card of a stack the
way you deal with mail: open it in place (it grows into a player inside its lane, the other lanes
compress to spines), watch, then flick it: approved, asked, later. The desk shows at a glance
where your attention is pulled (a tall Backend stack, an empty Android lane).

**Screen map.**
- Desk (home): up to six lanes, each headed by the platform glyph and color. Lanes with nothing
  collapse to a slim spine. Card = gist, bucket reason as a colored ribbon, people, checks.
  A "Mine" pseudo-lane on the far left holds your own PRs (ready to merge, fix checks).
- Open card: the card expands to fill the desk (matched geometry), lanes become thin colored
  spines on the left edge that still show counts. Inside the card: chapter list as a vertical
  rail, stage to the right, callouts in the margin.
- Done pile: approved and answered cards fall into a pile in the corner; click to undo.
- Settings: same as Concept 1, plus "lane order" and "hide lane".

**Acting from the review.** The verbs are physical. A approves and the card flies to the done
pile. Q opens "ask the author" pre-filled from the current callout. C comments on the cursor line.
L ("later") snoozes the card to the bottom of its stack for 4 hours.

**Keys.** ←/→ move between lanes, ↑/↓ within a stack, Return opens, Esc closes the card;
Space, J/K/L, ⇧←/⇧→ inside the player; A approve, C comment, Q ask, X request changes, L later,
⌘⏎ submit; ⌘Z undo the last flick; ⌘1–⌘6 jump to a lane; ⌘[ ⌘] history; ⌘K palette; ? sheet.

**What makes it fun.** It feels like clearing a desk: cards fly, stacks shrink, the done pile
grows. Platform is the primary axis, which matches how Jorge switches hats between repos.
**Risk:** urgency across platforms is weaker (the most urgent PR may sit at the top of the
fourth lane); six lanes are cramped on a laptop screen.

---

## Codex critique (verbatim)

Codex CLI 0.153.4, consult mode, read-only, reasoning effort medium, 2026-10-29.
It read the concepts and the current views (including the in-flight changes).

**Build Concept 1’s review room behind an urgency-sorted queue. Drop the poster wall.** Step 2 of 2 complete: critique grounded in the current code; no files changed.

**Ranking**

1. **Screening Room — build first, with major cuts.** A dedicated stage gives code enough space and makes chapters coherent. But hiding repo names until hover directly contradicts your requirement. Variable-sized posters make queue scanning slower; disappearing subtitles make rereading harder. Keep visible repo labels, persistent narrative access and an explicit “Next PR” action. Cut credits, countdowns and mandatory viewing before a verdict.

2. **Desk & Stacks — second.** Platform grouping supports switching between domains, but platform is a filter, not a sufficient priority system. Six lanes plus “Mine” waste laptop width and obscure cross-platform urgency. “Mine” also overlaps every platform. Keep platform counts and filters; discard spatial stacks and approval flicks. Moving a card is not evidence that GitHub accepted the review.

3. **The Reel — last.** It makes finding and assessing work depend on learning a timeline. PR width represents size, although size is neither urgency nor review effort. New commits, incoming PRs and disappearing approvals destabilize spatial memory. A three-second verdict gap pressures judgment. Use a reel inside one PR, where it has a stable scope; do not make it the app’s navigation.

**Gaps that matter**

- **Watching is not reviewing.** Typing every added character rewards elapsed time, not understanding. Deletions disappear precisely when you may need to compare them. Require an instant complete diff, persistent before/after access, file search and explicit reviewed markers. Story coverage means hunks were assigned—not that you inspected them. None of the concepts explains how “Fix checks,” “Answer reviewer” and “Ready to merge” become different workflows.

- **Missing and stale stories need first-class routes.** Open the raw diff immediately while generation runs or fails. Huge, binary, renamed and generated files need explicit handling; unsupported content must remain visible in the inventory. Current automatic generation skips PRs above 40 files. `isStale` treats a story without `headSha` as fresh; that should be **unknown**. Preserve drafts and invalidate affected review progress when commits change.

- **Review submission is a workflow, not a button.** Define draft → submitting → confirmed / failed / uncertain. Persist drafts; reconcile uncertain results before retrying; account for permissions, closed PRs and changed heads. “Ask author” is a comment intent, not another verdict. Existing-thread replies need their own interaction. “Done pile → Undo” must not imply that a submitted approval can be undone locally.

- **Keys and history are underspecified.** Concept 3 assigns `L` to both playback and snooze. Bare letters, arrows and Space must yield to text editing and focused controls. Recording every filter and chapter movement makes Back tedious: record meaningful destinations, restore playback position, and coalesce scrubbing. Use menu-backed commands, visible focus, ⌘F search, ⌘, Settings and explicit back/forward availability. Settings should be a consistent app window, not a concept-specific sheet.

- **Accessibility, AI and performance are foundation work.** Pair platform colors with names/icons; keep severity visually separate. Support reduced motion, adjustable code size, stable selectable text and VoiceOver without character-by-character announcements. AI pins need provenance, stable line anchors and an unavailable/error state; “no index” cannot be inferred reliably from an isolated SQL hunk. Full-array replay snapshots and per-character rendering need profiling before layering syntax and effects onto them. Matched-geometry transitions must preserve selection, focus and playback state.

**What I would build: Queue + Screening Stage**

One urgency-sorted queue with prominent repo badges, platform filters and search. Opening a PR reveals a large stage, collapsible chapter rail and compact review controls. Two presentations share the same position: **Watch** explains changes in meaningful beats; **Inspect** immediately exposes the complete diff. Narrative remains available after its entrance. Queue progress counts confirmed outcomes, separately from watched or inspected content.

**First five code changes, in order**

1. **Fix space allocation.** In `PRDetailView`, collapse threads/check details into an inspector and make the chapter rail hideable. Remove the app’s **1200×760 minimum** as a layout crutch; verify at 1024×700. Move model/cost diagnostics out of the always-visible `StatusBar`.

2. **Make playback useful for inspection.** In `ChapterPlayerView` and `ReplayEngine`, add complete-diff access, old/new line numbers, selectable syntax-highlighted code and persistent deletions. Replace full snapshots with compact replay events. Cancel delayed advances on navigation; preserve speed and position across chapter changes.

3. **Model review integrity before adding verdict buttons.** Extend [Models.swift](/Users/jorge/Developer/Citizen/narrative-review/mac/NarrativeReview/NarrativeReview/Model/Models.swift) with revision-bound drafts, old/new-side line anchors, inspected progress and callout provenance. Snapshot the analyzed commit before fetching/generating; submission must reconcile against GitHub’s result.

4. **Replace navigation plumbing with explicit review-session state.** Extend `AppModel` beyond a PR-ID path: destination, chapter, hunk, position and forward history. Route commands through focused context. Keep draft text and navigation state independent of recreated player views.

5. **Refine the existing queue rather than replacing it.** Platform badges and colored card edges **already exist**; the concepts document is outdated. Replace `Platform.of(repo:)` substring guessing with owner/repo overrides and a mixed-platform option. Add search and filters; distinguish empty, loading and failed inbox states—the current empty inbox keeps saying it is loading.

**Next: sketch the review screen at 1024×700 with one long code line and the comment editor open—two minutes.**

### Where Claude agrees and disagrees with Codex

- **Agree on the ranking** (Screening Room, then Desk, then Reel) and on its strongest point:
  watching is not reviewing. A film-only player rewards time spent, not understanding. The stage
  needs an instant "show me the whole diff" mode with deletions kept.
- **Agree, and verified in the code:** an empty inbox still says "Loading your pull requests…"
  (`DashboardView` checks only `prs.isEmpty`); `isStale` treats a story with no `headSha` as fresh;
  background stories skip PRs over 40 files; the window minimum is 1200×760. Concept 3 does give
  `L` two meanings. ⌘⏎ is now Open on GitHub, so "submit review" needs another key (⌘⇧⏎).
- **Partly disagree on "drop the poster wall".** A ranked list is the fastest way to scan, so the
  home stays a list. But it can still look like a marquee: big type, platform color, one hero card
  for the top item. Speed and feel are not a trade here.
- **Partly disagree on "cut the credits".** A forced verdict screen is bad. A verdict bar that
  appears when the last chapter ends, and can be dismissed with Esc, is the cheapest way to make
  acting from the review one keystroke. Keep it, never block on it.

---

## Recommendation for the next build

**Build first: Screening Room, in Codex's hybrid shape ("Queue + Screening Stage").** One ranked
queue with platform color and filters at home; a full-bleed stage inside a PR, with two views of
the same position: **Watch** (the film) and **Inspect** (the whole diff at once). The Reel survives
as the timeline strip inside one PR, which the new player already has. Desk & Stacks survives as
platform filters.

**Five changes for this week, each about an hour, on top of the current working tree:**

1. **Give the stage the room.** Move threads, failing checks, coverage and cost out of the PR
   header into a right-hand inspector (⌘I, `.inspector`). Keep one top line: platform badge, gist,
   author, check dots. Make the chapter list a hideable rail (⌃⌘S). Lower the window minimum and
   check the layout at 1024×700.
2. **Watch / Inspect toggle.** D (and a Go-menu item, ⌘⇧D) flips the stage between the typed film
   and the full hunk shown at once: deletions stay visible in red, old and new line numbers, text
   selectable. Same hunk, same scroll position.
3. **Keyboard queue.** On home, ↑/↓ move a focus ring over the cards and Return opens. Inside a PR,
   ⌥↓ / ⌥↑ go to the next or previous PR in queue order without going home. ? opens a key sheet
   built from the menu items, so it can never drift from the real bindings.
4. **Platform filter row.** Chips with counts above the buckets (All, iOS, Android, Backend, Data,
   Infra, Dashboards), ⌘1–⌘7 to pick one. Add a repo → platform override in Settings so a wrong
   guess from the repo name can be fixed without code.
5. **Verdict bar.** When the last chapter ends (or on V), a bar slides up: Approve, Comment, Ask the
   author (pre-filled from the current callout). A sheet shows the exact text before sending; ⌘⇧⏎
   sends with `gh pr review`, then the app reads the review back from GitHub and shows sent or
   failed. Whole-PR comments only this week; line comments come next.

**Small fixes to fold in (from the Codex pass, minutes each):** show "No open PRs involve you" when
the inbox is empty and not loading; treat a story with no `headSha` as "unknown", not fresh; tell
the user when a PR is too big (>40 files) for the background storyteller instead of showing
"no story yet".

**Later (navigation, transitions, settings):** a matched-geometry zoom from card to stage; a
command palette (⌘K); history that records PRs and chapters but coalesces scrubbing; reduced-motion
and code-size settings; a Keys pane to rebind.
