import Foundation

// MARK: - Pull request identity and metadata

/// A pull request as the inbox lists it. Comes from GitHub search.
struct PRRef: Identifiable, Hashable, Codable, Sendable {
    var owner: String
    var repo: String
    var number: Int
    var title: String
    var author: String
    var url: String
    var updatedAt: Date
    var isDraft: Bool
    var labels: [String]

    var id: String { "\(owner)/\(repo)#\(number)" }
    var repoSlug: String { "\(owner)/\(repo)" }
}

/// Mirrors `PRInfo` in src/lib/types.ts so fixture JSON loads unchanged.
struct PRInfo: Codable, Hashable, Sendable {
    var owner: String
    var repo: String
    var number: Int
    var title: String
    var body: String
    var author: String
    var additions: Int
    var deletions: Int
    var changedFiles: Int
    var baseRef: String
    var headRef: String
}

// MARK: - Diff

enum FileStatus: String, Codable, Sendable {
    case added, removed, modified, renamed
}

struct DiffHunk: Codable, Hashable, Sendable {
    var header: String
    var lines: [String]
    var rawContent: String
    var startLineOld: Int
    var startLineNew: Int
}

struct DiffFile: Codable, Hashable, Sendable {
    var path: String
    var status: FileStatus
    var oldPath: String?
    var hunks: [DiffHunk]
    var additions: Int
    var deletions: Int
}

struct ParsedDiff: Codable, Hashable, Sendable {
    var files: [DiffFile]
    var totalAdditions: Int
    var totalDeletions: Int
    var rawDiff: String

    func hunk(file: String, index: Int) -> DiffHunk? {
        files.first { $0.path == file }?.hunks[safe: index]
    }
}

// MARK: - Narrative

struct ChapterHunk: Codable, Hashable, Sendable, Identifiable {
    var file: String
    var hunkIndex: Int
    var diffContent: String
    var annotation: String?

    var id: String { "\(file)#\(hunkIndex)" }
}

struct Chapter: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var narrative: String
    var connectionToPrevious: String?
    var safetyNotes: [String]?
    var hunks: [ChapterHunk]
}

struct UncoveredHunk: Codable, Hashable, Sendable {
    var file: String
    var hunkIndex: Int
    var rawContent: String
}

struct CoverageResult: Codable, Hashable, Sendable {
    var totalFiles: Int
    var coveredFiles: Int
    var totalHunks: Int
    var coveredHunks: Int
    var uncoveredHunks: [UncoveredHunk]
    var isComplete: Bool
}

struct AnalysisMetrics: Codable, Hashable, Sendable {
    var model: String
    var inputTokens: Int
    var outputTokens: Int
    var cost: Double
    var durationMs: Int
}

/// The story of one PR. Same keys as `NarrativeReview` in src/lib/types.ts.
struct NarrativeReview: Codable, Hashable, Sendable, Identifiable {
    var prInfo: PRInfo
    var title: String
    var summary: String
    var rootCause: String
    var chapters: [Chapter]
    var coverage: CoverageResult
    var metrics: AnalysisMetrics?
    var analyzedAt: String
    var headSha: String?
    var quiz: Quiz?

    var id: String { "\(prInfo.owner)/\(prInfo.repo)#\(prInfo.number)" }

    /// On-device stories are drafts: the eval judge scored them 6 to 8 of 18 against Opus (evals/SUMMARY.md).
    var isDraft: Bool { metrics?.model == "apple-on-device" }

    /// How long the film runs at 1x: title cards plus typing every added line at 3 characters a frame, 45 ms a frame.
    var estimatedWatchSeconds: Int {
        var frames = 0
        var lastFile = ""
        for ch in chapters {
            for h in ch.hunks {
                if h.file != lastFile { frames += 26; lastFile = h.file }
                frames += 14
                for line in h.diffContent.split(separator: "\n") where line.hasPrefix("+") { frames += max(1, (line.count - 1) / 3) }
            }
        }
        return Int(Double(frames) * 0.045)
    }

    /// Lines of code shown per word of story. The deck measured 19:1 on the old pages.
    var codeToStoryRatio: Double {
        let words = chapters.reduce(0) { $0 + $1.narrative.split(separator: " ").count }
        let lines = chapters.reduce(0) { $0 + $1.hunks.reduce(0) { $0 + $1.diffContent.split(separator: "\n").count } }
        return words == 0 ? 0 : Double(lines) / Double(words)
    }
}

/// One question at the end of the film, about the thing a reviewer must not misunderstand.
struct Quiz: Codable, Hashable, Sendable {
    var question: String
    var options: [String]
    var answerIndex: Int
    var why: String
}

/// What a storyteller returns before coverage is checked and hunk text is attached.
struct StoryDraft: Codable, Sendable {
    struct DraftHunk: Codable, Sendable {
        var file: String
        var hunkIndex: Int
        var annotation: String?
    }
    struct DraftChapter: Codable, Sendable {
        var id: String
        var title: String
        var narrative: String
        var connectionToPrevious: String?
        var safetyNotes: [String]?
        var hunks: [DraftHunk]
    }
    var title: String
    var summary: String
    var rootCause: String
    var chapters: [DraftChapter]
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

extension JSONDecoder {
    nonisolated(unsafe) static let review: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

extension JSONEncoder {
    nonisolated(unsafe) static let review: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()
}
