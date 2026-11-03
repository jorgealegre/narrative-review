import Foundation
import Testing
@testable import NarrativeReview

@MainActor
struct ConversationTests {

    // MARK: Fixtures

    private static let utc = TimeZone(identifier: "UTC")!

    private static func pr(updatedAt: Date = Date(timeIntervalSince1970: 1_790_000_000), number: Int = 7) -> PullRequest {
        PullRequest(owner: "sp0n-7", repo: "Citizen-iOS", number: number, title: "Record broadcast path", body: "", url: "",
                    author: "jorgealegre", isDraft: false, createdAt: updatedAt, updatedAt: updatedAt, additions: 1, deletions: 1,
                    changedFiles: 1, reviewDecision: nil, mergeable: nil, mergeStateStatus: nil, labels: [], requestedReviewers: [],
                    latestReviews: [], reviewCount: 0, commentCount: 0, threadCount: 0, openThreads: [], headSha: "",
                    headCommittedAt: nil, checksState: nil, checks: [])
    }

    private static func author(_ login: String, bot: Bool = false) -> [String: Any] {
        ["__typename": bot ? "Bot" : "User", "login": login]
    }

    /// A GraphQL response shaped like `GitHubService.timeline`. Lists are deliberately out of time order.
    private static func fixture(longBody: String = "Please rename this.") -> Data {
        let pr: [String: Any] = [
            "author": author("jorgealegre"),
            "reviews": ["nodes": [
                ["author": author("armen"), "state": "CHANGES_REQUESTED", "body": "Two things.", "submittedAt": "2026-10-28T14:02:00Z"],
                ["author": author("armen"), "state": "COMMENTED", "body": "", "submittedAt": "2026-10-28T14:03:00Z"],
                ["author": author("claude", bot: true), "state": "COMMENTED", "body": "Automated review.", "submittedAt": "2026-10-27T09:00:00Z"],
                ["author": author("armen"), "state": "APPROVED", "body": "", "submittedAt": "2026-10-30T10:00:00Z"],
            ]],
            "comments": ["nodes": [
                ["author": author("github-actions", bot: true), "body": "Build passed", "createdAt": "2026-10-26T12:00:00Z"],
                ["author": author("jorgealegre"), "body": "Fixed <!-- hidden -->\n\nboth", "createdAt": "2026-10-29T08:00:00Z"],
                ["author": author("citizen-danger-swift"), "body": "Danger says hi", "createdAt": "2026-10-26T12:01:00Z"],
                ["author": author("jorgealegre"), "body": "!deploy-testflight", "createdAt": "2026-10-26T12:02:00Z"],
            ]],
            "reviewThreads": ["nodes": [
                ["isResolved": false, "isOutdated": false, "path": "Sources/App/Feature.swift", "comments": ["nodes": [
                    ["author": author("armen"), "body": longBody, "createdAt": "2026-10-28T14:01:00Z"],
                    ["author": author("jorgealegre"), "body": "Done", "createdAt": "2026-10-29T08:01:00Z"],
                ]]],
                ["isResolved": true, "isOutdated": false, "path": "Sources/App/Other.swift", "comments": ["nodes": [
                    ["author": author("claude", bot: true), "body": "Nit", "createdAt": "2026-10-27T09:01:00Z"],
                ]]],
            ]],
            "commits": ["nodes": [
                ["commit": ["messageHeadline": "First", "committedDate": "2026-10-25T10:00:00Z", "author": ["name": "Jorge", "user": author("jorgealegre")]]],
                ["commit": ["messageHeadline": "Second", "committedDate": "2026-10-25T11:00:00Z", "author": ["name": "Jorge", "user": author("jorgealegre")]]],
                ["commit": ["messageHeadline": "Third", "committedDate": "2026-10-29T07:59:00Z", "author": ["name": "Jorge", "user": author("jorgealegre")]]],
            ]],
            "timelineItems": ["nodes": [
                ["__typename": "ReviewRequestedEvent", "createdAt": "2026-10-25T12:00:00Z", "actor": author("jorgealegre"),
                 "requestedReviewer": ["login": "armen"]],
                ["__typename": "ReadyForReviewEvent", "createdAt": "2026-10-25T11:30:00Z", "actor": author("jorgealegre")],
            ]],
        ]
        let root: [String: Any] = ["data": ["repository": ["pullRequest": pr]]]
        return try! JSONSerialization.data(withJSONObject: root)
    }

    // MARK: Friction from counts

    @Test func frictionIsSmoothWithoutSignals() {
        #expect(ConversationCounts().friction == .smooth)
        #expect(ConversationCounts(approvers: ["armen"], humanComments: 5).friction == .smooth)
        #expect(ConversationCounts(approvers: ["armen"]).frictionWhy == "approved by armen with no open threads")
    }

    @Test func frictionSomeBackAndForth() {
        #expect(ConversationCounts(changesRequested: 1, changeRequesters: ["armen"]).friction == .someBackAndForth)
        #expect(ConversationCounts(unresolvedThreads: 1).friction == .someBackAndForth)
        #expect(ConversationCounts(unresolvedThreads: 2).friction == .someBackAndForth)
        #expect(ConversationCounts(humanComments: 6).friction == .someBackAndForth)
        #expect(ConversationCounts(changesRequested: 1, changeRequesters: ["armen"]).frictionWhy == "one round of changes requested by armen")
    }

    @Test func frictionContested() {
        #expect(ConversationCounts(changesRequested: 2).friction == .contested)
        #expect(ConversationCounts(unresolvedThreads: 3).friction == .contested)
        #expect(ConversationCounts(disagreement: true, disagreementPath: "a/B.swift").friction == .contested)
        #expect(ConversationCounts(changesRequested: 2, changeRequesters: ["armen", "jhays"]).frictionWhy
                == "2 rounds of changes requested by armen, jhays")
        #expect(ConversationCounts(disagreement: true, disagreementPath: "a/B.swift").frictionWhy == "a long open back-and-forth on B.swift")
    }

    @Test func countsIgnoreBots() throws {
        let t = try ConversationTimeline.parse(Self.fixture())
        let c = ConversationCounts(t)
        #expect(c.changesRequested == 1)
        #expect(c.changeRequesters == ["armen"])
        #expect(c.approvers == ["armen"])
        #expect(c.unresolvedThreads == 1)       // the claude thread is a bot and resolved
        #expect(c.humanComments == 4)           // review body, author comment, two thread comments
        #expect(c.commits == 3)
        #expect(c.participants == ["armen"])
        #expect(c.friction == .someBackAndForth)
    }

    @Test func manyBotCommentsStaySmooth() throws {
        var t = try ConversationTimeline.parse(Self.fixture())
        let bot = ConversationEvent(date: Date(), actor: "claude", isBot: true, kind: .review(state: "CHANGES_REQUESTED"), body: "x")
        t.events += Array(repeating: bot, count: 10)
        #expect(ConversationCounts(t).changesRequested == 1)
    }

    @Test func disagreementNeedsTwoPeopleInAnOpenThread() {
        func thread(_ comments: Int, _ people: Int, resolved: Bool = false) -> ConversationThread {
            ConversationThread(opener: "armen", openerIsBot: false, path: "x/Y.swift", isResolved: resolved, isOutdated: false,
                               humanComments: comments, humanParticipants: people, firstBody: "")
        }
        func counts(_ th: ConversationThread) -> ConversationCounts {
            ConversationCounts(ConversationTimeline(prAuthor: "jorgealegre", events: [], threads: [th]))
        }
        #expect(counts(thread(4, 2)).disagreement)
        #expect(!counts(thread(4, 1)).disagreement)
        #expect(!counts(thread(3, 2)).disagreement)
        #expect(!counts(thread(6, 2, resolved: true)).disagreement)
    }

    // MARK: Transcript

    @Test func transcriptIsChronologicalAndFoldsCommitsAndBots() throws {
        let t = try ConversationTimeline.parse(Self.fixture())
        let lines = ConversationTranscript.lines(t, timeZone: Self.utc)
        #expect(lines == [
            "2026-10-25 11:00 jorgealegre pushed 2 commits: Second",
            "2026-10-25 11:30 jorgealegre marked the PR ready for review",
            "2026-10-25 12:00 jorgealegre requested review from armen",
            "2026-10-28 14:01 armen opened a thread on Feature.swift [open]: Please rename this.",
            "2026-10-28 14:02 armen requested changes: Two things.",
            "2026-10-29 07:59 jorgealegre pushed a commit: Third",
            "2026-10-29 08:00 jorgealegre commented: Fixed both",
            "2026-10-29 08:01 jorgealegre replied on Feature.swift: Done",
            "2026-10-30 10:00 armen approved",
            "Bot comments: 5 (claude 2, bot commands 1, citizen-danger-swift 1, github-actions 1). Not part of the conversation.",
        ])
    }

    @Test func transcriptTruncatesBodies() throws {
        let long = String(repeating: "a", count: 1000)
        let t = try ConversationTimeline.parse(Self.fixture(longBody: long))
        let thread = t.threads.first { $0.path.hasSuffix("Feature.swift") }!
        #expect(thread.firstBody.count == ConversationTimeline.bodyLimit + 1)          // 600 + ellipsis
        let line = ConversationTranscript.lines(t, timeZone: Self.utc).first { $0.contains("opened a thread") }!
        let body = line.components(separatedBy: "[open]: ").last!
        #expect(body == String(repeating: "a", count: ConversationTranscript.lineLimit) + "…")
    }

    @Test func parserKeepsOnlyTheLastFiftyPerList() throws {
        let comments: [[String: Any]] = (0..<60).map { i in
            ["author": Self.author("armen"), "body": "c\(i)", "createdAt": String(format: "2026-10-01T10:%02d:00Z", i)]
        }
        let root: [String: Any] = ["data": ["repository": ["pullRequest": ["author": Self.author("jorgealegre"), "comments": ["nodes": comments]]]]]
        let t = try ConversationTimeline.parse(JSONSerialization.data(withJSONObject: root))
        #expect(t.events.count == 50)
        #expect(t.events.first?.body == "c10")
    }

    @Test func fitKeepsNewestLinesAndTheBotLine() {
        let lines = (0..<10).map { "line \($0) " + String(repeating: "x", count: 90) } + ["Bot comments: 2 (claude 2). Not part of the conversation."]
        let fitted = ConversationTranscript.fit(lines, budget: 400)
        #expect(fitted.first == "(7 earlier events not shown)")
        #expect(fitted[1].hasPrefix("line 7"))
        #expect(fitted.last?.hasPrefix("Bot comments:") == true)
    }

    @Test func lastEventPrefersHumans() throws {
        var t = try ConversationTimeline.parse(Self.fixture())
        t.events.append(ConversationEvent(date: Date(timeIntervalSince1970: 1_900_000_000), actor: "claude", isBot: true, kind: .comment, body: "x"))
        let approvedAt = ISO8601DateFormatter().date(from: "2026-10-30T10:00:00Z")!
        #expect(ConversationTranscript.lastEvent(t, now: approvedAt.addingTimeInterval(2 * 3600)) == "armen approved 2 h ago")
        #expect(ConversationTranscript.lastEvent(t, now: approvedAt.addingTimeInterval(30 * 3600)) == "armen approved yesterday")
    }

    @Test func fallbackHasNoModelProse() throws {
        let t = try ConversationTimeline.parse(Self.fixture())
        let b = ConversationWriter.fallback(timeline: t, counts: ConversationCounts(t), stamp: "s")
        #expect(b.friction == .someBackAndForth)
        #expect(b.summary == "Approved by armen. Changes requested by armen. 4 human comments with armen. 3 commits by jorgealegre.")
        #expect(b.asks == ["armen asked on Feature.swift: Please rename this."])
    }

    // MARK: Cache stamp

    @Test func cacheHitsOnlyWhenStampMatches() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("conversations-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let pr = Self.pr()
        let brief = ConversationBrief(summary: "s", friction: .smooth, frictionWhy: "w", asks: [], lastEvent: "e",
                                      stamp: ConversationWriter.stamp(pr))

        let writer = ConversationWriter(fileURL: file)
        #expect(await writer.cached(pr) == nil)
        await writer.remember(brief, for: pr)
        #expect(await writer.cached(pr) == brief)

        // A newer update invalidates the entry.
        let newer = Self.pr(updatedAt: pr.updatedAt.addingTimeInterval(1))
        #expect(ConversationWriter.stamp(newer) != ConversationWriter.stamp(pr))
        #expect(await writer.cached(newer) == nil)

        // Another PR never sees it; a new writer reads it back from disk.
        #expect(await writer.cached(Self.pr(number: 8)) == nil)
        #expect(await ConversationWriter(fileURL: file).cached(pr) == brief)
    }

    @Test func stampIsISO8601OfUpdatedAt() {
        let pr = Self.pr(updatedAt: ISO8601DateFormatter().date(from: "2026-10-28T14:02:00Z")!)
        #expect(ConversationWriter.stamp(pr) == "2026-10-28T14:02:00.000Z")
    }
}
