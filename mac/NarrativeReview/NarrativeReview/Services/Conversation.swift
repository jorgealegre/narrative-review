import Foundation
import FoundationModels

/// What happened in a PR conversation, for the dashboard card. Friction comes from counts;
/// only `summary` and `asks` come from the on-device model.
nonisolated struct ConversationBrief: Codable, Sendable, Hashable {
    enum Friction: String, Codable, Sendable { case smooth, someBackAndForth, contested }
    var summary: String          // 1-2 sentences: what happened so far, who did what, in plain words
    var friction: Friction
    var frictionWhy: String      // one short clause with evidence
    var asks: [String]           // open requests, each one short sentence, who asked
    var lastEvent: String        // "Armen approved 2 h ago"
    var stamp: String            // cache key: pr.updatedAt ISO string
}

// MARK: - Timeline

/// One thing that happened in the PR, from any of the GitHub lists.
nonisolated struct ConversationEvent: Sendable, Hashable {
    enum Kind: Sendable, Hashable {
        case review(state: String)                               // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
        case comment
        case threadComment(path: String, opensThread: Bool, resolved: Bool)
        case commits(count: Int, headline: String)
        case reviewRequested(reviewer: String)
        case readyForReview
        case forcePush
    }
    var date: Date
    var actor: String
    var isBot: Bool
    var kind: Kind
    var body: String = ""
}

nonisolated struct ConversationThread: Sendable, Hashable {
    var opener: String
    var openerIsBot: Bool
    var path: String
    var isResolved: Bool
    var isOutdated: Bool
    var humanComments: Int
    var humanParticipants: Int
    var firstBody: String
}

nonisolated struct ConversationTimeline: Sendable, Hashable {
    var prAuthor: String
    var events: [ConversationEvent]      // oldest first
    var threads: [ConversationThread]

    static let listLimit = 50
    static let bodyLimit = 600

    init(prAuthor: String, events: [ConversationEvent], threads: [ConversationThread]) {
        self.prAuthor = prAuthor
        self.events = Self.chronological(events)
        self.threads = threads
    }

    /// Stable sort, so events with the same timestamp keep the order GitHub gave them.
    static func chronological(_ events: [ConversationEvent]) -> [ConversationEvent] {
        events.enumerated().sorted { ($0.element.date, $0.offset) < ($1.element.date, $1.offset) }.map(\.element)
    }

    /// Parses the response of `GitHubService.timeline(owner:repo:number:)`.
    static func parse(_ data: Data) throws -> ConversationTimeline {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ConversationError.badResponse("not JSON") }
        if let errors = root["errors"] as? [[String: Any]], let first = errors.first {
            throw ConversationError.badResponse(first["message"] as? String ?? "GraphQL error")
        }
        guard let pr = ((root["data"] as? [String: Any])?["repository"] as? [String: Any])?["pullRequest"] as? [String: Any] else {
            throw ConversationError.badResponse("no pull request in response")
        }
        let iso = ISO8601DateFormatter()
        func date(_ v: Any?) -> Date? { (v as? String).flatMap { iso.date(from: $0) } }
        func nodes(_ key: String, in obj: [String: Any] = pr) -> [[String: Any]] {
            Array((((obj[key] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []).suffix(listLimit))
        }
        func who(_ v: Any?) -> (login: String, bot: Bool) {
            let a = v as? [String: Any]
            let login = a?["login"] as? String ?? "ghost"
            return (login, ConversationTranscript.isBot(login, typename: a?["__typename"] as? String))
        }

        let prAuthor = who(pr["author"]).login
        var events: [ConversationEvent] = []
        var threads: [ConversationThread] = []

        for r in nodes("reviews") {
            guard let at = date(r["submittedAt"]), let state = r["state"] as? String, state != "PENDING" else { continue }
            let body = clean(r["body"] as? String)
            // An empty COMMENTED review is only the wrapper for thread comments, which are listed on their own.
            if state == "COMMENTED" && body.isEmpty { continue }
            let a = who(r["author"])
            events.append(ConversationEvent(date: at, actor: a.login, isBot: a.bot, kind: .review(state: state), body: body))
        }
        for c in nodes("comments") {
            guard let at = date(c["createdAt"]) else { continue }
            let a = who(c["author"]), body = clean(c["body"] as? String)
            // "!deploy-testflight" or "/retest" talks to CI, not to people: fold it in with the bots.
            let command = body.count < 60 && body.range(of: "^[!/][A-Za-z][\\w-]*(\\s|$)", options: .regularExpression) != nil
            events.append(ConversationEvent(date: at, actor: command ? "bot commands" : a.login, isBot: a.bot || command,
                                            kind: .comment, body: body))
        }
        for t in nodes("reviewThreads") {
            let comments = nodes("comments", in: t)
            guard let first = comments.first else { continue }
            let path = t["path"] as? String ?? ""
            let resolved = t["isResolved"] as? Bool ?? false
            let opener = who(first["author"])
            var humans = Set<String>()
            var humanCount = 0
            for (i, c) in comments.enumerated() {
                guard let at = date(c["createdAt"]) else { continue }
                let a = who(c["author"])
                if !a.bot { humans.insert(a.login); humanCount += 1 }
                events.append(ConversationEvent(date: at, actor: a.login, isBot: a.bot,
                                                kind: .threadComment(path: path, opensThread: i == 0, resolved: resolved),
                                                body: clean(c["body"] as? String)))
            }
            threads.append(ConversationThread(opener: opener.login, openerIsBot: opener.bot, path: path, isResolved: resolved,
                                              isOutdated: t["isOutdated"] as? Bool ?? false, humanComments: humanCount,
                                              humanParticipants: humans.count, firstBody: clean(first["body"] as? String)))
        }
        for n in nodes("commits") {
            guard let commit = n["commit"] as? [String: Any], let at = date(commit["committedDate"]) else { continue }
            let author = commit["author"] as? [String: Any]
            let user = author?["user"] as? [String: Any]
            let login = user?["login"] as? String ?? author?["name"] as? String ?? "someone"
            let bot = ConversationTranscript.isBot(login, typename: user?["__typename"] as? String)
            events.append(ConversationEvent(date: at, actor: login, isBot: bot,
                                            kind: .commits(count: 1, headline: clean(commit["messageHeadline"] as? String))))
        }
        for e in nodes("timelineItems") {
            guard let at = date(e["createdAt"]) else { continue }
            let a = who(e["actor"])
            switch e["__typename"] as? String {
            case "ReviewRequestedEvent":
                let r = e["requestedReviewer"] as? [String: Any]
                let reviewer = r?["login"] as? String ?? r?["name"] as? String ?? "someone"
                events.append(ConversationEvent(date: at, actor: a.login, isBot: a.bot, kind: .reviewRequested(reviewer: reviewer)))
            case "ReadyForReviewEvent":
                events.append(ConversationEvent(date: at, actor: a.login, isBot: a.bot, kind: .readyForReview))
            case "HeadRefForcePushedEvent":
                events.append(ConversationEvent(date: at, actor: a.login, isBot: a.bot, kind: .forcePush))
            default: continue
            }
        }
        return ConversationTimeline(prAuthor: prAuthor, events: events, threads: threads)
    }

    /// One line of plain text: no HTML comments, no line breaks, at most `bodyLimit` characters.
    static func clean(_ s: String?) -> String {
        guard var s, !s.isEmpty else { return "" }
        s = s.replacingOccurrences(of: "<!--[\\s\\S]*?-->", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        return s.count > bodyLimit ? String(s.prefix(bodyLimit)) + "…" : s
    }
}

nonisolated enum ConversationError: Error { case badResponse(String) }

// MARK: - Counts and friction

/// The human signals in a conversation. Bots never count.
nonisolated struct ConversationCounts: Sendable, Hashable {
    var changesRequested = 0            // CHANGES_REQUESTED review submissions
    var changeRequesters: [String] = []
    var approvers: [String] = []
    var unresolvedThreads = 0           // unresolved, not outdated, opened by a human other than the author
    var humanComments = 0               // issue comments, thread comments and review bodies
    var disagreement = false
    var disagreementPath: String?
    var commits = 0
    var participants: [String] = []     // humans other than the author who spoke

    init(changesRequested: Int = 0, changeRequesters: [String] = [], approvers: [String] = [], unresolvedThreads: Int = 0,
         humanComments: Int = 0, disagreement: Bool = false, disagreementPath: String? = nil, commits: Int = 0, participants: [String] = []) {
        self.changesRequested = changesRequested
        self.changeRequesters = changeRequesters
        self.approvers = approvers
        self.unresolvedThreads = unresolvedThreads
        self.humanComments = humanComments
        self.disagreement = disagreement
        self.disagreementPath = disagreementPath
        self.commits = commits
        self.participants = participants
    }

    init(_ t: ConversationTimeline) {
        var requesters: [String] = [], approvers: [String] = [], people: [String] = []
        func note(_ list: inout [String], _ name: String) { if !list.contains(name) { list.append(name) } }
        for e in t.events where !e.isBot {
            switch e.kind {
            case .review(let state):
                if state == "CHANGES_REQUESTED" { changesRequested += 1; note(&requesters, e.actor) }
                if state == "APPROVED" { note(&approvers, e.actor) }
                if !e.body.isEmpty { humanComments += 1 }
                if e.actor != t.prAuthor { note(&people, e.actor) }
            case .comment, .threadComment:
                humanComments += 1
                if e.actor != t.prAuthor { note(&people, e.actor) }
            case .commits(let n, _): commits += n
            default: break
            }
        }
        let open = t.threads.filter { !$0.isResolved && !$0.isOutdated && !$0.openerIsBot && $0.opener != t.prAuthor }
        unresolvedThreads = open.count
        // Visible disagreement: an open thread where two or more people went back and forth four times or more.
        if let hot = t.threads.first(where: { !$0.isResolved && !$0.isOutdated && $0.humanComments >= 4 && $0.humanParticipants >= 2 }) {
            disagreement = true
            disagreementPath = hot.path
        }
        changeRequesters = requesters
        self.approvers = approvers
        participants = people
    }

    /// contested: changes requested twice or more, 3+ unresolved threads, or visible disagreement.
    /// someBackAndForth: one changes-requested round, 1-2 unresolved threads, or 6+ human comments.
    var friction: ConversationBrief.Friction {
        if changesRequested >= 2 || unresolvedThreads >= 3 || disagreement { return .contested }
        if changesRequested == 1 || unresolvedThreads >= 1 || humanComments >= 6 { return .someBackAndForth }
        return .smooth
    }

    var frictionWhy: String {
        let by = changeRequesters.isEmpty ? "" : " by " + changeRequesters.joined(separator: ", ")
        let threads = "\(unresolvedThreads) unresolved thread\(unresolvedThreads == 1 ? "" : "s")"
        var why: [String] = []
        switch friction {
        case .contested:
            if changesRequested >= 2 { why.append("\(changesRequested) rounds of changes requested\(by)") }
            if unresolvedThreads >= 3 { why.append(threads) }
            if disagreement { why.append("a long open back-and-forth on \(Self.file(disagreementPath ?? ""))") }
        case .someBackAndForth:
            if changesRequested == 1 { why.append("one round of changes requested\(by)") }
            if unresolvedThreads >= 1 { why.append(threads) }
            if humanComments >= 6 { why.append("\(humanComments) human comments") }
        case .smooth:
            why.append(approvers.isEmpty ? "no changes requested and no open threads"
                                         : "approved by \(approvers.joined(separator: ", ")) with no open threads")
        }
        return why.joined(separator: ", ")
    }

    static func file(_ path: String) -> String { path.split(separator: "/").last.map(String.init) ?? path }
}

// MARK: - Transcript

nonisolated enum ConversationTranscript {
    static let lineLimit = 300
    static let promptBudget = 6000       // characters; the on-device window is about 4k tokens in all

    static func isBot(_ login: String, typename: String? = nil) -> Bool {
        let l = login.lowercased()
        return typename == "Bot" || l.hasSuffix("[bot]") || l.hasSuffix("-bot") || l == "claude" || l == "github-actions"
            || l.contains("danger")    // the Danger runner posts as a plain user account
    }

    /// One line per event, oldest first. Consecutive commits by one person fold into one line.
    /// All bot activity folds into one last line.
    static func lines(_ t: ConversationTimeline, timeZone: TimeZone = .current) -> [String] {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd HH:mm"

        var out: [String] = []
        var bots: [String: Int] = [:]
        for e in folded(t.events) {
            if e.isBot { bots[e.actor, default: 0] += 1; continue }
            out.append("\(f.string(from: e.date)) \(e.actor) \(describe(e, withBody: true))")
        }
        if !bots.isEmpty {
            let total = bots.values.reduce(0, +)
            let who = bots.sorted { ($0.value, $1.key) > ($1.value, $0.key) }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")
            out.append("Bot comments: \(total) (\(who)). Not part of the conversation.")
        }
        return out
    }

    /// Merges runs of commit events by the same person with nothing else in between.
    static func folded(_ events: [ConversationEvent]) -> [ConversationEvent] {
        var out: [ConversationEvent] = []
        for e in events {
            if case .commits(let n, let headline) = e.kind, let last = out.last, last.actor == e.actor,
               case .commits(let m, _) = last.kind {
                out[out.count - 1].kind = .commits(count: m + n, headline: headline)
                out[out.count - 1].date = e.date
            } else {
                out.append(e)
            }
        }
        return out
    }

    static func describe(_ e: ConversationEvent, withBody: Bool) -> String {
        let text: String
        switch e.kind {
        case .review(let state):
            switch state {
            case "APPROVED": text = "approved"
            case "CHANGES_REQUESTED": text = "requested changes"
            case "DISMISSED": text = "had a review dismissed"
            default: text = "reviewed"
            }
        case .comment: text = "commented"
        case .threadComment(let path, let opens, let resolved):
            text = opens ? "opened a thread on \(ConversationCounts.file(path)) [\(resolved ? "resolved" : "open")]"
                         : "replied on \(ConversationCounts.file(path))"
        case .commits(let n, let headline):
            text = n == 1 ? "pushed a commit" : "pushed \(n) commits"
            return withBody && !headline.isEmpty ? "\(text): \(clip(headline))" : text
        case .reviewRequested(let reviewer): text = "requested review from \(reviewer)"
        case .readyForReview: text = "marked the PR ready for review"
        case .forcePush: text = "force-pushed the branch"
        }
        return withBody && !e.body.isEmpty ? "\(text): \(clip(e.body))" : text
    }

    static func clip(_ s: String) -> String { s.count > lineLimit ? String(s.prefix(lineLimit)) + "…" : s }

    /// The newest lines that fit the budget. The bot line always stays.
    static func fit(_ lines: [String], budget: Int = promptBudget) -> [String] {
        var body = lines
        let botLine = body.last?.hasPrefix("Bot comments:") == true ? body.removeLast() : nil
        var kept: [String] = []
        var used = botLine?.count ?? 0
        for l in body.reversed() {
            guard used + l.count + 1 <= budget else { break }
            kept.insert(l, at: 0)
            used += l.count + 1
        }
        let dropped = body.count - kept.count
        return (dropped > 0 ? ["(\(dropped) earlier events not shown)"] : []) + kept + (botLine.map { [$0] } ?? [])
    }

    /// "Armen approved 2 h ago". Prefers the newest human event.
    static func lastEvent(_ t: ConversationTimeline, now: Date = Date()) -> String {
        let events = folded(t.events)
        guard let e = events.last(where: { !$0.isBot }) ?? events.last else { return "No activity yet" }
        return "\(e.actor) \(describe(e, withBody: false)) \(ago(e.date, now: now))"
    }

    static func ago(_ date: Date, now: Date) -> String {
        let s = max(0, now.timeIntervalSince(date))
        switch s {
        case ..<60: return "just now"
        case ..<3600: return "\(Int(s / 60)) min ago"
        case ..<86400: return "\(Int(s / 3600)) h ago"
        case ..<(2 * 86400): return "yesterday"
        default: return "\(Int(s / 86400)) days ago"
        }
    }
}

// MARK: - Writer

/// Writes a `ConversationBrief` per PR with the on-device model. Cached by PR id and update time.
actor ConversationWriter {
    @Generable
    struct Prose {
        @Guide(description: "One or two plain sentences: what happened in the conversation so far and who did what. Name people by login. No file paths, no ticket ids.")
        var summary: String
        @Guide(description: "Requests that are still open, each one short sentence that names who asked. Empty when nothing is open.", .maximumCount(4))
        var asks: [String]
    }

    static let instructions = """
    You brief a busy engineer on a pull request conversation he has not opened. Plain words, active voice, \
    name people by their login. You get a timeline, oldest first, one event per line.
    Friction rules: contested means changes were requested twice or more, or 3 or more threads are unresolved, \
    or people visibly disagree. someBackAndForth means one round of requested changes, or 1 or 2 unresolved threads, \
    or 6 or more human comments. smooth means none of these. The friction level is computed for you; never contradict it.
    Bot comments are not part of the conversation and never count as friction.
    """

    private var cache: [String: ConversationBrief] = [:]
    private var fallbacks: [String: ConversationBrief] = [:]     // count-only briefs, kept in memory so the model can retry next launch
    private let url: URL

    init(fileURL: URL = AppPaths.support.appendingPathComponent("conversations.json")) {
        url = fileURL
        if let data = try? Data(contentsOf: url), let c = try? JSONDecoder().decode([String: ConversationBrief].self, from: data) { cache = c }
    }

    nonisolated static func key(_ pr: PullRequest) -> String { "\(pr.owner)/\(pr.repo)#\(pr.number)" }

    nonisolated static func stamp(_ pr: PullRequest) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: pr.updatedAt)
    }

    func cached(_ pr: PullRequest) -> ConversationBrief? {
        let stamp = Self.stamp(pr), key = Self.key(pr)
        if let b = cache[key], b.stamp == stamp { return b }
        if let b = fallbacks[key], b.stamp == stamp { return b }
        return nil
    }

    /// Saves a model-written brief to disk.
    func remember(_ brief: ConversationBrief, for pr: PullRequest) {
        cache[Self.key(pr)] = brief
        try? JSONEncoder().encode(cache).write(to: url, options: .atomic)
    }

    func brief(for pr: PullRequest, github: GitHubService) async -> ConversationBrief? {
        if let b = cached(pr) { return b }
        let stamp = Self.stamp(pr), key = Self.key(pr)
        guard let data = try? await github.timeline(owner: pr.owner, repo: pr.repo, number: pr.number),
              let timeline = try? ConversationTimeline.parse(data) else {
            return Self.fallback(pr: pr, stamp: stamp)
        }
        let counts = ConversationCounts(timeline)
        let lines = ConversationTranscript.lines(timeline)
        let base = Self.fallback(timeline: timeline, counts: counts, stamp: stamp)

        guard case .available = SystemLanguageModel.default.availability else {
            fallbacks[key] = base
            return base
        }
        for budget in [ConversationTranscript.promptBudget, ConversationTranscript.promptBudget / 2] {
            let prompt = """
            PR #\(pr.number) by \(timeline.prAuthor): \(pr.title)
            Friction: \(counts.friction.rawValue), because \(counts.frictionWhy).
            Timeline, oldest first:
            \(ConversationTranscript.fit(lines, budget: budget).joined(separator: "\n"))
            """
            do {
                let session = LanguageModelSession(instructions: Self.instructions)
                let r = try await session.respond(to: prompt, generating: Prose.self)
                var b = base
                b.summary = r.content.summary
                b.asks = r.content.asks
                remember(b, for: pr)
                return b
            } catch LanguageModelSession.GenerationError.exceededContextWindowSize {
                continue
            } catch {
                break
            }
        }
        fallbacks[key] = base
        return base
    }

    /// A brief from counts only, for when the model is unavailable or fails.
    nonisolated static func fallback(timeline t: ConversationTimeline, counts c: ConversationCounts, stamp: String,
                                     now: Date = Date()) -> ConversationBrief {
        var parts: [String] = []
        if !c.approvers.isEmpty { parts.append("Approved by \(c.approvers.joined(separator: ", ")).") }
        if !c.changeRequesters.isEmpty { parts.append("Changes requested by \(c.changeRequesters.joined(separator: ", ")).") }
        if c.humanComments > 0 {
            let who = c.participants.isEmpty ? "" : " with \(c.participants.joined(separator: ", "))"
            parts.append("\(c.humanComments) human comment\(c.humanComments == 1 ? "" : "s")\(who).")
        }
        if c.commits > 0 { parts.append("\(c.commits) commit\(c.commits == 1 ? "" : "s") by \(t.prAuthor).") }
        let asks = t.threads.filter { !$0.isResolved && !$0.isOutdated && !$0.openerIsBot && $0.opener != t.prAuthor }
            .prefix(4).map { th -> String in
                let first = th.firstBody.count > 100 ? String(th.firstBody.prefix(100)) + "…" : th.firstBody
                return "\(th.opener) asked on \(ConversationCounts.file(th.path)): \(first)"
            }
        return ConversationBrief(summary: parts.isEmpty ? "No human conversation yet." : parts.joined(separator: " "),
                                 friction: c.friction, frictionWhy: c.frictionWhy, asks: Array(asks),
                                 lastEvent: ConversationTranscript.lastEvent(t, now: now), stamp: stamp)
    }

    /// A brief from the inbox fields alone, for when the timeline could not be fetched.
    nonisolated static func fallback(pr: PullRequest, stamp: String, now: Date = Date()) -> ConversationBrief {
        let human = { (s: String) in !ConversationTranscript.isBot(s) }
        let open = pr.openThreads.filter { human($0.author) }
        let c = ConversationCounts(changesRequested: pr.latestReviews.filter { $0.state == "CHANGES_REQUESTED" && human($0.author) }.count,
                                   changeRequesters: pr.latestReviews.filter { $0.state == "CHANGES_REQUESTED" && human($0.author) }.map(\.author),
                                   approvers: pr.latestReviews.filter { $0.state == "APPROVED" && human($0.author) }.map(\.author),
                                   unresolvedThreads: open.count)
        return ConversationBrief(summary: "Conversation not loaded; this comes from the inbox counts.",
                                 friction: c.friction, frictionWhy: c.frictionWhy,
                                 asks: open.prefix(4).map { "\($0.author) asked on \(ConversationCounts.file($0.path ?? "")): \(String($0.body.prefix(100)))" },
                                 lastEvent: "Updated \(ConversationTranscript.ago(pr.updatedAt, now: now))", stamp: stamp)
    }
}
