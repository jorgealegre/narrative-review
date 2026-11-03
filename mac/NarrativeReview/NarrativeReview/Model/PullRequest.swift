import Foundation
import SwiftUI

/// One check run or commit status on the head commit.
struct CheckItem: Codable, Hashable, Sendable, Identifiable {
    enum Outcome: String, Codable, Sendable { case success, failure, pending, skipped, neutral }
    var name: String
    var outcome: Outcome
    var url: String?
    var checkRunId: Int?
    var id: String { name }
}

/// An unresolved review thread, with the comment that opened it.
struct OpenThread: Codable, Hashable, Sendable, Identifiable {
    var author: String
    var path: String?
    var line: Int?
    var body: String
    var url: String?
    var createdAt: Date?
    var id: String { url ?? "\(author)|\(path ?? "")|\(line ?? 0)" }
}

struct ReviewItem: Codable, Hashable, Sendable {
    var author: String
    var state: String      // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
    var submittedAt: Date?
}

/// Everything the dashboard needs about an open PR, from one GraphQL call.
struct PullRequest: Identifiable, Hashable, Codable, Sendable {
    var owner: String
    var repo: String
    var number: Int
    var title: String
    var body: String
    var url: String
    var author: String
    var isDraft: Bool
    var createdAt: Date
    var updatedAt: Date
    var additions: Int
    var deletions: Int
    var changedFiles: Int
    var reviewDecision: String?   // APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED
    var mergeable: String?        // MERGEABLE, CONFLICTING, UNKNOWN
    var mergeStateStatus: String? // BEHIND, BLOCKED, CLEAN, DIRTY, UNSTABLE, HAS_HOOKS, UNKNOWN
    var baseRefName: String = "main"
    var labels: [String]
    var requestedReviewers: [String]
    var latestReviews: [ReviewItem]
    var reviewCount: Int
    var commentCount: Int
    var threadCount: Int
    var openThreads: [OpenThread]      // unresolved, not outdated, not opened by the author
    var unresolvedThreads: Int { openThreads.count }
    var headSha: String
    var headCommittedAt: Date?
    var checksState: String?      // SUCCESS, FAILURE, PENDING, ERROR, EXPECTED
    var checks: [CheckItem]

    var id: String { "\(owner)/\(repo)#\(number)" }
    var repoSlug: String { "\(owner)/\(repo)" }

    var ref: PRRef {
        PRRef(owner: owner, repo: repo, number: number, title: title, author: author, url: url,
              updatedAt: updatedAt, isDraft: isDraft, labels: labels)
    }

    var failedChecks: [CheckItem] { checks.filter { $0.outcome == .failure } }
    var pendingChecks: [CheckItem] { checks.filter { $0.outcome == .pending } }
    var approvers: [String] { latestReviews.filter { $0.state == "APPROVED" }.map(\.author) }
    var changeRequesters: [String] { latestReviews.filter { $0.state == "CHANGES_REQUESTED" }.map(\.author) }
    var humanReviewers: [String] {
        Array(Set(latestReviews.map(\.author).filter { !$0.hasSuffix("[bot]") && $0 != "claude" && $0 != author }))
    }
    var ageDays: Int { max(0, Int(Date().timeIntervalSince(createdAt) / 86400)) }
    var quietDays: Int { max(0, Int(Date().timeIntervalSince(updatedAt) / 86400)) }

    /// How contested the PR is: threads, review rounds and comments relative to its size.
    var heat: Heat {
        let rounds = latestReviews.filter { $0.state == "CHANGES_REQUESTED" }.count + unresolvedThreads
        let chatter = commentCount + reviewCount + threadCount
        if rounds >= 3 || chatter >= 25 { return .spicy }
        if rounds >= 1 || chatter >= 10 { return .warm }
        return .feather
    }

    enum Heat: String, Codable, Sendable { case feather, warm, spicy }
}

/// Why a PR is on your plate. One bucket per PR, chosen in priority order.
enum Attention: String, CaseIterable, Codable, Sendable, Identifiable {
    case readyToMerge = "Ready to merge"
    case fixChecks = "Fix before it can merge"
    case answerReviewer = "Answer the reviewer"
    case reviewRequested = "Waiting on your review"
    case youBlockThem = "They are waiting on you"
    case yoursInReview = "Yours, in review"
    case watching = "You were mentioned or commented"
    case drafts = "Drafts"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .readyToMerge: return "checkmark.seal.fill"
        case .fixChecks: return "xmark.octagon.fill"
        case .answerReviewer: return "bubble.left.and.exclamationmark.bubble.right.fill"
        case .reviewRequested: return "eye.fill"
        case .youBlockThem: return "hand.raised.fill"
        case .yoursInReview: return "clock.fill"
        case .watching: return "at"
        case .drafts: return "pencil.and.outline"
        }
    }
}

struct TriagedPR: Identifiable, Hashable, Sendable {
    var pr: PullRequest
    var attention: Attention
    var reason: String
    var urgency: Int           // higher sorts first inside a bucket
    var id: String { pr.id }
}

enum Triage {
    /// Decides the bucket and the one-line reason, from the viewer's point of view.
    static func triage(_ pr: PullRequest, viewer: String) -> TriagedPR {
        let mine = pr.author == viewer
        let askedMe = pr.requestedReviewers.contains(viewer)
        let iReviewed = pr.latestReviews.contains { $0.author == viewer }
        let iApproved = pr.latestReviews.contains { $0.author == viewer && $0.state == "APPROVED" }
        let days = pr.quietDays

        if pr.isDraft {
            return TriagedPR(pr: pr, attention: .drafts, reason: mine ? "Your draft, \(pr.ageDays) days old" : "\(pr.author)'s draft", urgency: 0)
        }
        if mine {
            if !pr.failedChecks.isEmpty {
                let names = pr.failedChecks.prefix(2).map(\.name).joined(separator: ", ")
                return TriagedPR(pr: pr, attention: .fixChecks, reason: "\(pr.failedChecks.count) red: \(names)", urgency: 90 + pr.failedChecks.count)
            }
            if pr.reviewDecision == "APPROVED" && pr.mergeable != "CONFLICTING" {
                return TriagedPR(pr: pr, attention: .readyToMerge,
                                 reason: "Approved by \(pr.approvers.joined(separator: ", ")), checks \(pr.checksState?.lowercased() ?? "unknown")", urgency: 100)
            }
            if pr.mergeable == "CONFLICTING" {
                return TriagedPR(pr: pr, attention: .fixChecks, reason: "Merge conflict with \(pr.baseRefName): needs your hands", urgency: 85)
            }
            if pr.mergeStateStatus == "BEHIND" {
                return TriagedPR(pr: pr, attention: .fixChecks, reason: "Behind \(pr.baseRefName): one click updates the branch", urgency: 80)
            }
            if !pr.changeRequesters.isEmpty || pr.unresolvedThreads > 0 {
                let who = pr.changeRequesters.first ?? pr.humanReviewers.first ?? "a reviewer"
                return TriagedPR(pr: pr, attention: .answerReviewer,
                                 reason: "\(pr.unresolvedThreads) open thread\(pr.unresolvedThreads == 1 ? "" : "s") from \(who), quiet \(days) day\(days == 1 ? "" : "s")", urgency: 70 + pr.unresolvedThreads)
            }
            let waitingOn = pr.requestedReviewers.isEmpty ? "nobody asked yet" : "waiting on \(pr.requestedReviewers.joined(separator: ", "))"
            return TriagedPR(pr: pr, attention: .yoursInReview, reason: "\(waitingOn), \(days) day\(days == 1 ? "" : "s") quiet", urgency: 40 + min(days, 20))
        }
        if askedMe && !iApproved {
            let urgency = 80 + min(days * 3, 15) + (pr.heat == .spicy ? 3 : 0)
            return TriagedPR(pr: pr, attention: .reviewRequested,
                             reason: "\(pr.author) asked you \(days == 0 ? "today" : "\(days) day\(days == 1 ? "" : "s") ago"), +\(pr.additions) −\(pr.deletions) in \(pr.changedFiles) files", urgency: urgency)
        }
        if iReviewed && !iApproved && pr.unresolvedThreads > 0 {
            return TriagedPR(pr: pr, attention: .youBlockThem,
                             reason: "You left \(pr.unresolvedThreads) open thread\(pr.unresolvedThreads == 1 ? "" : "s"); \(pr.author) pushed since", urgency: 75)
        }
        if iReviewed && !iApproved && pr.reviewDecision != "APPROVED" {
            return TriagedPR(pr: pr, attention: .youBlockThem, reason: "You reviewed but did not approve; \(days) day\(days == 1 ? "" : "s") quiet", urgency: 60)
        }
        return TriagedPR(pr: pr, attention: .watching, reason: iApproved ? "You approved; \(pr.author) still has it open" : "Mentioned or commented", urgency: 10)
    }

    static func board(_ prs: [PullRequest], viewer: String) -> [(Attention, [TriagedPR])] {
        let all = prs.map { triage($0, viewer: viewer) }
        return Attention.allCases.compactMap { bucket in
            let items = all.filter { $0.attention == bucket }.sorted { $0.urgency > $1.urgency }
            return items.isEmpty ? nil : (bucket, items)
        }
    }
}

struct BoardColumnModel {
    var title: String
    var symbol: String
    var color: Color
    var emptyText: String
    var items: [TriagedPR]
    var compact = false
}
