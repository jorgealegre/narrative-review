import Foundation
import FoundationModels

/// One plain sentence per PR, written on device from the title and description. Free, so it runs
/// for every PR in the inbox in the background. Cached by PR id and update time.
actor GistWriter {
    @Generable
    struct Gist {
        @Guide(description: "One plain sentence, under 20 words, saying what this change does for the product or the team. No ticket ids, no file names.")
        var sentence: String
        @Guide(description: "One of: feature, fix, infra, docs, data, experiment, cleanup")
        var kind: String
    }

    struct Entry: Codable, Sendable { var sentence: String; var kind: String; var stamp: String }

    private var cache: [String: Entry] = [:]
    private let url = AppPaths.support.appendingPathComponent("gists.json")

    init() {
        if let data = try? Data(contentsOf: url), let c = try? JSONDecoder().decode([String: Entry].self, from: data) { cache = c }
    }

    func cached(_ pr: PullRequest) -> Entry? {
        guard let e = cache[pr.id], e.stamp == stamp(pr) else { return nil }
        return e
    }

    private func stamp(_ pr: PullRequest) -> String { "\(pr.title)|\(pr.body.count)" }

    func gist(for pr: PullRequest) async -> Entry? {
        if let e = cached(pr) { return e }
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        let session = LanguageModelSession(instructions: "You write one-sentence descriptions of pull requests for a busy engineer. Plain words, active voice, say what changes for users or the team, never restate the ticket id.")
        let body = String(pr.body.prefix(1500))
        do {
            let r = try await session.respond(to: "Title: \(pr.title)\nAuthor: \(pr.author)\nDescription:\n\(body.isEmpty ? "(none)" : body)", generating: Gist.self)
            let e = Entry(sentence: r.content.sentence, kind: r.content.kind.lowercased(), stamp: stamp(pr))
            cache[pr.id] = e
            try? JSONEncoder().encode(cache).write(to: url)
            return e
        } catch {
            return nil
        }
    }

    /// Summarizes failed check annotations in one sentence, with what to do about it.
    func explainFailure(check: String, text: String) async -> String? {
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        let session = LanguageModelSession(instructions: "You read CI failure output and answer in one or two short sentences: what failed and the most likely fix. Plain words.")
        return try? await session.respond(to: "Check: \(check)\nOutput:\n\(String(text.prefix(5000)))").content
    }
}
