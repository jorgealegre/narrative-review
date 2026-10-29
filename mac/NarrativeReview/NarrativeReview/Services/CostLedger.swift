import Foundation
import Observation

/// Every dollar the app spends, in one place the status bar always shows.
@MainActor @Observable
final class CostLedger {
    struct Entry: Codable, Identifiable, Sendable {
        var id = UUID()
        var date = Date()
        var pr: String
        var model: String
        var inputTokens: Int
        var outputTokens: Int
        var cost: Double
        var durationMs: Int
    }

    private(set) var entries: [Entry] = []
    var total: Double { entries.reduce(0) { $0 + $1.cost } }
    var totalThisMonth: Double {
        entries.filter { Calendar.current.isDate($0.date, equalTo: Date(), toGranularity: .month) }.reduce(0) { $0 + $1.cost }
    }
    var totalToday: Double {
        entries.filter { Calendar.current.isDateInToday($0.date) }.reduce(0) { $0 + $1.cost }
    }

    private let url = AppPaths.support.appendingPathComponent("ledger.json")

    init() {
        if let data = try? Data(contentsOf: url), let e = try? JSONDecoder.review.decode([Entry].self, from: data) {
            entries = e
        }
    }

    func record(pr: String, metrics: AnalysisMetrics) {
        entries.append(Entry(pr: pr, model: metrics.model, inputTokens: metrics.inputTokens,
                             outputTokens: metrics.outputTokens, cost: metrics.cost, durationMs: metrics.durationMs))
        try? JSONEncoder.review.encode(entries).write(to: url)
    }
}

enum AppPaths {
    static let support: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NarrativeReview", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }()
    static let reviews: URL = {
        let u = support.appendingPathComponent("reviews", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()
}
