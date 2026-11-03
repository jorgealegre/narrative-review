import Foundation
import FoundationModels
import Observation
import SwiftUI
import os

@MainActor @Observable
final class AppModel {
    static let shared = AppModel()

    let github = GitHubService()
    let ledger = CostLedger()
    let gists = GistWriter()
    private let log = Logger(subsystem: "dev.alegre.NarrativeReview", category: "model")

    // Inbox
    var prs: [PullRequest] = []
    var inboxError: String?
    var isLoadingInbox = false
    var lastRefreshed: Date?
    var viewerLogin: String?
    var gistText: [String: GistWriter.Entry] = [:]

    // Stories
    var reviews: [String: NarrativeReview] = [:]
    var progress: [String: StoryProgress] = [:]
    var errors: [String: String] = [:]
    private var tellQueue: [String] = []
    private var telling: String?

    // Navigation: a browser-style history so ⌘[ and ⌘] work the way people expect.
    var path: [String] = [] { didSet { selectedChapterID = nil; chapterProgress = 0; if !navigatingHistory { history.append(path); forward = [] } } }
    private var history: [[String]] = [[]]
    private var forward: [[String]] = []
    private var navigatingHistory = false
    var canGoBack: Bool { history.count > 1 }
    var canGoForward: Bool { !forward.isEmpty }

    func goBack() {
        guard history.count > 1 else { return }
        forward.append(history.removeLast())
        navigatingHistory = true; path = history.last ?? []; navigatingHistory = false
    }

    func goForward() {
        guard let next = forward.popLast() else { return }
        history.append(next)
        navigatingHistory = true; path = next; navigatingHistory = false
    }

    var openPR: PRRef? { path.last.flatMap { ref($0) } }

    // The film's position, owned here so menus, the strip and the test hook can all see it.
    var selectedChapterID: Chapter.ID?
    var chapterProgress: Double = 0
    var filmSeekToEnd = 0      // bumped by the test hook to jump to the closing card

    // Watched stories and the streak: the game part.
    @ObservationIgnored @AppStorage("watched") private var watchedData: Data = Data()
    @ObservationIgnored @AppStorage("watchDays") private var watchDaysData: Data = Data()
    var watched: [String: Date] = [:]
    var watchDays: [String] = []   // yyyy-MM-dd of days with at least one story watched

    func loadWatched() {
        watched = (try? JSONDecoder.review.decode([String: Date].self, from: watchedData)) ?? [:]
        watchDays = (try? JSONDecoder().decode([String].self, from: watchDaysData)) ?? []
    }
    func markWatched(_ id: String) {
        guard watched[id] == nil else { return }
        watched[id] = Date()
        watchedData = (try? JSONEncoder.review.encode(watched)) ?? Data()
        let day = Self.dayKey(Date())
        if !watchDays.contains(day) { watchDays.append(day); watchDaysData = (try? JSONEncoder().encode(watchDays)) ?? Data() }
    }
    func hasWatched(_ id: String) -> Bool {
        guard let r = reviews[id], let w = watched[id] else { return false }
        return ISO8601DateFormatter().date(from: r.analyzedAt).map { $0 <= w } ?? true
    }
    var watchedToday: Int { watched.values.filter { Calendar.current.isDateInToday($0) }.count }
    var streakDays: Int {
        var n = 0
        var d = Date()
        while watchDays.contains(Self.dayKey(d)) { n += 1; d = Calendar.current.date(byAdding: .day, value: -1, to: d)! }
        return n
    }
    static func dayKey(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }

    func stepChapter(_ delta: Int) {
        guard let pr = openPR, let r = reviews[pr.id], !r.chapters.isEmpty else { return }
        let i = r.chapters.firstIndex { $0.id == selectedChapterID } ?? 0
        let j = min(max(0, i + delta), r.chapters.count - 1)
        selectedChapterID = r.chapters[j].id
    }

    @ObservationIgnored @AppStorage("storyteller") var storytellerKind: StorytellerKind = .apple
    @ObservationIgnored @AppStorage("claudeModel") var claudeModelID: String = "claude-opus-5-5"
    @ObservationIgnored @AppStorage("inboxScope") var inboxScope: String = "org:sp0n-7"
    @ObservationIgnored @AppStorage("autoTell") var autoTell: Bool = true
    @ObservationIgnored @AppStorage("pollMinutes") var pollMinutes: Int = 1
    @ObservationIgnored @AppStorage("monthlyBudget") var monthlyBudget: Double = 20
    var textScale: Double = 1

    /// The Claude key, read from the Keychain once (each read can raise a system prompt) and refreshed from Settings.
    private(set) var claudeKey: String = ""
    var hasClaudeKey: Bool { !claudeKey.isEmpty }
    /// Off the main thread: the Keychain can show a system prompt and wait on it.
    func loadClaudeKey() {
        Task.detached(priority: .utility) {
            let k = Keychain.read("anthropic") ?? ""
            await MainActor.run { AppModel.shared.claudeKey = k; AppModel.shared.verifyClaudeKey() }
        }
    }
    var claudeKeyStatus: String = ""
    func setClaudeKey(_ k: String) {
        Keychain.write("anthropic", k); claudeKey = k
        verifyClaudeKey()
    }
    func verifyClaudeKey() {
        let k = claudeKey
        guard !k.isEmpty else { claudeKeyStatus = ""; return }
        claudeKeyStatus = "Checking the key…"
        Task {
            let err = await ClaudeKeyCheck.verify(k)
            claudeKeyStatus = err.map { "Key rejected. \($0)" } ?? "Key works (\(k.count) characters)."
        }
    }

    /// ⌥↓ / ⌥↑: the next PR in queue order, without going home.
    func stepQueue(_ delta: Int) {
        let order = board.flatMap { $0.1.map(\.id) }
        guard !order.isEmpty else { return }
        let cur = path.last.flatMap { order.firstIndex(of: $0) } ?? -1
        let next = min(max(0, cur + delta), order.count - 1)
        path = [order[next]]
    }

    var appleAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }

    init() {
        for r in ReviewStore.loadAll() { reviews[r.id] = r }
        loadClaudeKey()
        loadWatched()
    }

    // MARK: Inbox

    var board: [(Attention, [TriagedPR])] { Triage.board(prs, viewer: viewerLogin ?? "") }

    var platformFilter: Platform? = nil
    var platformsPresent: [Platform] { Platform.allCases.filter { p in prs.contains { Platform.of(repo: $0.repo) == p } } }
    var filteredBoard: [(Attention, [TriagedPR])] {
        guard let f = platformFilter else { return board }
        return board.compactMap { b in let items = b.1.filter { Platform.of(repo: $0.pr.repo) == f }; return items.isEmpty ? nil : (b.0, items) }
    }

    /// The board's columns: a kind of attention each, biggest first.
    var columns: [BoardColumnModel] {
        func items(_ kinds: [Attention]) -> [TriagedPR] { filteredBoard.filter { kinds.contains($0.0) }.flatMap(\.1).sorted { $0.urgency > $1.urgency } }
        return [
            BoardColumnModel(title: "Fix", symbol: "wrench.and.screwdriver.fill", color: Theme.bad, emptyText: "Nothing of yours is red or stuck.", items: items([.fixChecks])),
            BoardColumnModel(title: "Answer", symbol: "bubble.left.and.exclamationmark.bubble.right.fill", color: Theme.warn, emptyText: "No reviewer is waiting on you.", items: items([.answerReviewer, .youBlockThem])),
            BoardColumnModel(title: "Review", symbol: "eye.fill", color: Theme.accent, emptyText: "No review requests.", items: items([.reviewRequested])),
            BoardColumnModel(title: "Merge", symbol: "checkmark.seal.fill", color: Theme.good, emptyText: "Nothing approved yet.", items: items([.readyToMerge])),
            BoardColumnModel(title: "In review", symbol: "clock.fill", color: Theme.muted, emptyText: "None of yours in review.", items: items([.yoursInReview])),
            BoardColumnModel(title: "Watching", symbol: "at", color: Theme.faint, emptyText: "", items: items([.watching, .drafts]), compact: true),
        ].filter { !$0.items.isEmpty || !$0.compact }
    }

    // Conversation briefs: what happened in the thread, written on device after the gists.
    let conversations = ConversationWriter()
    var briefs: [String: ConversationBrief] = [:]

    private func writeBriefs(for list: [PullRequest]) async {
        for pr in list { if let b = await conversations.cached(pr) { briefs[pr.id] = b } }
        for pr in list where briefs[pr.id]?.stamp != ISO8601DateFormatter().string(from: pr.updatedAt) {
            if let b = await conversations.brief(for: pr, github: github) { briefs[pr.id] = b }
        }
    }
    var needsYouCount: Int {
        board.filter { [.readyToMerge, .fixChecks, .answerReviewer, .reviewRequested, .youBlockThem].contains($0.0) }.reduce(0) { $0 + $1.1.count }
    }

    func pr(_ id: String) -> PullRequest? { prs.first { $0.id == id } }

    /// Fallback ref for PRs that only exist as a story on disk.
    func ref(_ id: String) -> PRRef? {
        if let p = pr(id) { return p.ref }
        guard let r = reviews[id] else { return nil }
        return PRRef(owner: r.prInfo.owner, repo: r.prInfo.repo, number: r.prInfo.number, title: r.prInfo.title, author: r.prInfo.author,
                     url: "https://github.com/\(r.prInfo.owner)/\(r.prInfo.repo)/pull/\(r.prInfo.number)",
                     updatedAt: ISO8601DateFormatter().date(from: r.analyzedAt) ?? .distantPast, isDraft: false, labels: [])
    }

    /// Stories on disk whose PR is no longer in the inbox (merged, closed, out of scope).
    var archivedStories: [NarrativeReview] {
        reviews.values.filter { r in !prs.contains { $0.id == r.id } }.sorted { $0.analyzedAt > $1.analyzedAt }
    }

    func refreshInbox() async {
        if isLoadingInbox { return }
        isLoadingInbox = true
        defer { isLoadingInbox = false }
        do {
            let (viewer, list) = try await github.inboxDetailed(scope: inboxScope)
            viewerLogin = viewer
            prs = list
            lastRefreshed = Date()
            inboxError = nil
            log.notice("inbox loaded: \(list.count) PRs")
            Task {
                await self.writeGists(for: list)      // gists first: they make the dashboard readable
                await self.writeBriefs(for: list)
                if self.autoTell, self.storytellerKind == .apple, self.appleAvailable { self.enqueueStaleStories() }
            }
        } catch {
            inboxError = error.localizedDescription
            log.error("inbox failed: \(error.localizedDescription)")
        }
    }

    /// Polls GitHub forever, and again whenever the app comes to the front. Nobody should need a refresh button.
    /// (A desktop app cannot receive GitHub webhooks without a server, so polling is the honest option.)
    func startRunner() {
        Task {
            while true {
                await refreshInbox()
                try? await Task.sleep(for: .seconds(Double(max(pollMinutes, 1)) * 60))
            }
        }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in
                if let t = self.lastRefreshed, Date().timeIntervalSince(t) > 20 { await self.refreshInbox() }
            }
        }
    }

    var notes: [String: String] = [:]   // short per-PR status lines for actions the user took

    func updateBranch(_ pr: PullRequest) {
        notes[pr.id] = "Asking GitHub to merge \(pr.baseRefName) in…"
        Task {
            do {
                try await github.updateBranch(owner: pr.owner, repo: pr.repo, number: pr.number)
                notes[pr.id] = "GitHub is merging \(pr.baseRefName) in; checks will run again."
                try? await Task.sleep(for: .seconds(8))
                await refreshInbox()
            } catch {
                notes[pr.id] = "Could not update: \(error.localizedDescription)"
            }
        }
    }

    private func writeGists(for list: [PullRequest]) async {
        for pr in list {
            if let e = await gists.cached(pr) { gistText[pr.id] = e; continue }
        }
        for pr in list where gistText[pr.id] == nil {
            if let e = await gists.gist(for: pr) { gistText[pr.id] = e }
        }
    }

    // MARK: Stories

    func storyteller() -> any Storyteller {
        switch storytellerKind {
        case .apple: return FoundationStoryteller()
        case .claude: return ClaudeStoryteller(model: ClaudeModel.named(claudeModelID), apiKey: claudeKey)
        }
    }

    func isStale(_ pr: PullRequest) -> Bool {
        guard let r = reviews[pr.id] else { return true }
        return r.headSha != nil && r.headSha != pr.headSha
    }

    /// Queue every PR that needs you and has no story, or a story told for an older head, biggest attention first.
    private func enqueueStaleStories() {
        let wanted: Set<Attention> = [.readyToMerge, .fixChecks, .answerReviewer, .reviewRequested, .youBlockThem, .yoursInReview]
        for (bucket, items) in board where wanted.contains(bucket) {
            for t in items where !t.pr.isDraft && isStale(t.pr) && t.pr.changedFiles <= 40 {
                enqueue(t.pr.id)
            }
        }
    }

    private func enqueue(_ id: String) {
        guard telling != id, !tellQueue.contains(id), progress[id] == nil else { return }
        tellQueue.append(id)
        progress[id] = StoryProgress(step: "Queued", fraction: 0)
        pump()
    }

    private func pump() {
        guard telling == nil, let next = tellQueue.first, let ref = ref(next) else { return }
        tellQueue.removeFirst()
        telling = next
        Task {
            await tell(ref)
            telling = nil
            pump()
        }
    }

    /// Opening a PR with no story tells it at once, ahead of the queue. No button to press.
    func openStoryIfNeeded(_ ref: PRRef) {
        guard reviews[ref.id] == nil, progress[ref.id] == nil || progress[ref.id]?.step == "Queued" else { return }
        tellStory(for: ref)
    }

    /// Tell now, ahead of the queue.
    func tellStory(for ref: PRRef) {
        errors[ref.id] = nil
        tellQueue.removeAll { $0 == ref.id }
        if telling == nil {
            telling = ref.id
            progress[ref.id] = StoryProgress(step: "Fetching the pull request", fraction: 0)
            Task { await tell(ref); telling = nil; pump() }
        } else {
            tellQueue.insert(ref.id, at: 0)
            progress[ref.id] = StoryProgress(step: "Queued, next in line", fraction: 0)
        }
    }

    private func tell(_ ref: PRRef) async {
        let id = ref.id
        let teller = storyteller()
        progress[id] = StoryProgress(step: "Fetching the pull request", fraction: 0)
        do {
            async let info = github.pullRequest(ref)
            let raw = try await github.diff(ref)
            let diff = DiffParser.parse(raw)
            let pr = try await info
            progress[id] = StoryProgress(step: "Parsed \(diff.files.count) files, \(diff.files.reduce(0) { $0 + $1.hunks.count }) hunks", fraction: 0.05)
            let (draft, metrics) = try await teller.tell(diff: diff, pr: pr) { p in
                Task { @MainActor in self.progress[id] = p }
            }
            var (chapters, coverage) = CoverageVerifier.attach(draft: draft, to: diff)
            // Claude tells the story; Apple adds a free callout to every hunk Claude left bare.
            if storytellerKind == .claude, appleAvailable {
                let bare = chapters.flatMap { $0.hunks.filter { ($0.annotation ?? "").isEmpty } }
                let notes = await FoundationStoryteller().callouts(for: bare) { p in Task { @MainActor in self.progress[id] = p } }
                for ci in chapters.indices { for hi in chapters[ci].hunks.indices where (chapters[ci].hunks[hi].annotation ?? "").isEmpty {
                    chapters[ci].hunks[hi].annotation = notes[chapters[ci].hunks[hi].id]
                } }
            }
            _ = coverage
            let review = NarrativeReview(prInfo: pr, title: draft.title, summary: draft.summary, rootCause: draft.rootCause,
                                         chapters: chapters, coverage: coverage, metrics: metrics,
                                         analyzedAt: ISO8601DateFormatter().string(from: Date()), headSha: self.pr(id)?.headSha)
            ReviewStore.save(review)
            reviews[review.id] = review
            ledger.record(pr: review.id, metrics: metrics)
            if appleAvailable, let q = await gists.quiz(for: review) {
                var withQuiz = review; withQuiz.quiz = q
                ReviewStore.save(withQuiz); reviews[review.id] = withQuiz
            }
        } catch {
            errors[id] = error.localizedDescription
            log.error("story failed for \(id): \(error.localizedDescription)")
        }
        progress[id] = nil
    }

    func importFixture(_ url: URL) {
        do {
            let r = try ReviewStore.importFixture(url)
            reviews[r.id] = r
            path = [r.id]
        } catch {
            inboxError = "Could not read \(url.lastPathComponent): \(error.localizedDescription)"
        }
    }

    func forget(_ id: String) {
        reviews[id] = nil
        try? FileManager.default.removeItem(at: ReviewStore.fileURL(id))
    }

    // MARK: Red checks

    var failureNotes: [String: String] = [:]   // "prId|check" -> one-line explanation

    func explainFailures(_ pr: PullRequest) {
        for c in pr.failedChecks {
            let key = "\(pr.id)|\(c.name)"
            guard failureNotes[key] == nil, let runId = c.checkRunId else { continue }
            Task {
                let text = (try? await github.checkFailureText(owner: pr.owner, repo: pr.repo, checkRunId: runId)) ?? ""
                if text.isEmpty { failureNotes[key] = "GitHub has no details for this check. Open the log."; return }
                let firstLines = text.components(separatedBy: "\n").prefix(3).joined(separator: " ")
                failureNotes[key] = String(firstLines.prefix(300))            // show something now
                if let better = await gists.explainFailure(check: c.name, text: text) { failureNotes[key] = better }
            }
        }
    }
}
