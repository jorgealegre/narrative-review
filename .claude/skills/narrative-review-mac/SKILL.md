---
name: narrative-review-mac
description: Install, build or update the Narrative Review Mac app on this machine ("install narrative review", "build the review app", "update narrative review", "the review app won't build"). Clones or pulls the repo, checks the GitHub CLI login, builds with Xcode, copies the app to /Applications and opens it.
---

# Narrative Review for Mac: install or update

The app lives in `mac/` of jorgealegre/narrative-review, branch `mac-app`. Nobody ships a binary: every teammate builds it locally with this skill. Source on GitHub is the distribution.

## Preconditions (check, fix, do not ask)

1. Xcode 27 or newer: `xcodebuild -version`. If missing, tell the user to install Xcode from the App Store and stop.
2. GitHub CLI signed in: `gh auth status`. If not, run `gh auth login` in the user's terminal (they complete the browser step) and wait.
3. Apple Intelligence on, for the free on-device brain: System Settings > Apple Intelligence & Siri. The app works without it, but every story then needs a Claude API key.

## Steps

1. Clone or update:
   ```bash
   test -d ~/Developer/narrative-review || git clone https://github.com/jorgealegre/narrative-review ~/Developer/narrative-review
   git -C ~/Developer/narrative-review fetch origin && git -C ~/Developer/narrative-review checkout mac-app && git -C ~/Developer/narrative-review pull --ff-only
   ```
2. Build Release:
   ```bash
   cd ~/Developer/narrative-review/mac/NarrativeReview && xcodebuild -scheme NarrativeReview -destination 'platform=macOS' -configuration Release build 2>&1 | tail -3
   ```
3. Install and open:
   ```bash
   rm -rf /Applications/NarrativeReview.app && cp -R ~/Developer/narrative-review/mac/NarrativeReview/DerivedData/Build/Products/Release/NarrativeReview.app /Applications/ && open /Applications/NarrativeReview.app
   ```
4. Tell the user: the dashboard fills in from their GitHub login; the on-device brain writes stories in the background; a Claude API key (optional) goes in Settings and is kept in the Keychain.

## If the build fails

Read the first `error:` line. A signing error means the local build is signed to run locally only, which is expected; it still runs. A missing module error means Xcode is older than 27. Anything else: paste the error into a message to Jorge.
