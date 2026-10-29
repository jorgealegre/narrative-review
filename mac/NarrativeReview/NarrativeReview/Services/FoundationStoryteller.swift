import Foundation
import FoundationModels

/// Apple's on-device model. Free, private, but its window is about 4k tokens, so the diff goes
/// through in pieces: one note per hunk, then one outline over the notes.
struct FoundationStoryteller: Storyteller {
    var modelName: String { "apple-on-device" }

    @Generable
    struct HunkNote {
        @Guide(description: "One sentence: what this hunk changes and why it matters to the rest of the PR.")
        var summary: String
        @Guide(description: "One of: trigger, consumer, cleanup, test, generated, config, docs")
        var kind: String
    }

    @Generable
    struct OutlineChapter {
        @Guide(description: "Short slug id like ch1, ch2")
        var id: String
        @Guide(description: "Chapter title describing what the code does")
        var title: String
        @Guide(description: "Two to four sentences explaining the change, like a colleague over coffee")
        var narrative: String
        @Guide(description: "One sentence on how this chapter follows from the previous one, empty for the first")
        var connectionToPrevious: String
        @Guide(description: "The hunk keys (H1, H2, ...) that belong to this chapter, every key exactly once across all chapters")
        var hunkKeys: [String]
    }

    @Generable
    struct Outline {
        @Guide(description: "Human readable PR title")
        var title: String
        @Guide(description: "Two or three sentence overview of the whole PR")
        var summary: String
        @Guide(description: "One sentence naming the fundamental trigger")
        var rootCause: String
        @Guide(description: "Chapters ordered by cause: root trigger first, consumers next, leaf cleanup last")
        var chapters: [OutlineChapter]
    }

    static var availability: SystemLanguageModel.Availability { SystemLanguageModel.default.availability }

    /// One-sentence callout per hunk, for hunks another brain left without one. Free, on device.
    func callouts(for hunks: [ChapterHunk], progress: @Sendable @escaping (StoryProgress) -> Void) async -> [String: String] {
        guard case .available = Self.availability else { return [:] }
        var out: [String: String] = [:]
        for (i, h) in hunks.enumerated() {
            progress(StoryProgress(step: "Callout \(i + 1) of \(hunks.count)", fraction: Double(i) / Double(max(hunks.count, 1))))
            let session = LanguageModelSession(instructions: "You write one sentence telling a reviewer what to look at in one hunk of a diff. Name the function, type or key. Lines starting with + are added, - removed.")
            if let r = try? await session.respond(to: "File: \(h.file)\n\n\(String(h.diffContent.prefix(6000)))", generating: HunkNote.self) {
                out[h.id] = r.content.summary
            }
        }
        return out
    }

    func tell(diff: ParsedDiff, pr: PRInfo, progress: @Sendable @escaping (StoryProgress) -> Void) async throws -> (StoryDraft, AnalysisMetrics) {
        let start = Date()
        var keys: [String] = []          // H1, H2, ... in diff order
        var keyToHunk: [String: (file: String, index: Int)] = [:]
        var noteText: [String: String] = [:]     // key -> one-sentence summary, kept as the hunk's callout
        var notes: [String] = []
        let total = diff.files.reduce(0) { $0 + $1.hunks.count }
        var done = 0
        for f in diff.files {
            for (i, h) in f.hunks.enumerated() {
                let key = "H\(keys.count + 1)"
                keys.append(key)
                keyToHunk[key] = (f.path, i)
                progress(StoryProgress(step: "Reading \(f.path) hunk \(i + 1) of \(f.hunks.count)", fraction: 0.8 * Double(done) / Double(max(total, 1))))
                let session = LanguageModelSession(instructions: "You summarize one hunk of a code diff for a reviewer. Lines starting with + are added, - removed. Be concrete: name the function, type or key that changed.")
                let text = String(h.rawContent.prefix(6000))
                do {
                    let r = try await session.respond(to: "File: \(f.path) (\(f.status.rawValue))\n\n\(text)", generating: HunkNote.self)
                    notes.append("\(key) \(f.path) [\(r.content.kind)]: \(r.content.summary)")
                    noteText[key] = r.content.summary
                } catch {
                    notes.append("\(key) \(f.path) [unknown]: \(h.header) (too large to read on device)")
                }
                done += 1
            }
        }
        progress(StoryProgress(step: "Writing the outline from \(notes.count) notes", fraction: 0.85))
        // Config and trigger hunks first, tests and generated files last: the outline reads them in this order.
        let rank: [String: Int] = ["config": 0, "trigger": 1, "consumer": 2, "cleanup": 3, "docs": 4, "generated": 5, "test": 6]
        let ordered = notes.sorted { a, b in
            func r(_ n: String) -> Int { rank[n.split(separator: "[").dropFirst().first?.split(separator: "]").first.map(String.init) ?? ""] ?? 3 }
            return r(a) < r(b)
        }
        let instructions = StoryPrompt.system
            .replacingOccurrences(of: "Reference hunks by file path and hunk index (0-based).", with: "")
            + "\n\nYou receive one note per hunk instead of the raw diff. Each note starts with its key (H1, H2, ...) and file path. Refer to hunks only by key. The PR description is the author's claim; the notes are the truth."
        let session = LanguageModelSession(instructions: instructions)
        let prompt = """
        Pull request: \(pr.title)
        Description: \(String(pr.body.prefix(800)))

        Hunk notes:
        \(ordered.joined(separator: "\n"))

        Write the narrative outline. Use every key exactly once.
        """
        let outline = try await session.respond(to: prompt, generating: Outline.self).content
        var chapters: [StoryDraft.DraftChapter] = outline.chapters.map { ch in
            StoryDraft.DraftChapter(id: ch.id, title: ch.title, narrative: ch.narrative,
                                    connectionToPrevious: ch.connectionToPrevious.isEmpty ? nil : ch.connectionToPrevious,
                                    safetyNotes: nil,
                                    hunks: ch.hunkKeys.compactMap { parse(key: $0, map: keyToHunk, note: noteText) })
        }
        if chapters.isEmpty {
            chapters = [StoryDraft.DraftChapter(id: "ch1", title: outline.title, narrative: outline.summary, connectionToPrevious: nil, safetyNotes: nil,
                                                hunks: keys.compactMap { parse(key: $0, map: keyToHunk, note: noteText) })]
        }
        // Coverage repair: a hunk the outline forgot goes next to another hunk of the same file, else into the last chapter.
        var placed = Set(chapters.flatMap { $0.hunks.map { "\($0.file)#\($0.hunkIndex)" } })
        for key in keys {
            guard let h = keyToHunk[key], !placed.contains("\(h.file)#\(h.index)") else { continue }
            let hunk = StoryDraft.DraftHunk(file: h.file, hunkIndex: h.index, annotation: noteText[key])
            if let ci = chapters.firstIndex(where: { $0.hunks.contains { $0.file == h.file } }) {
                chapters[ci].hunks.append(hunk)
            } else if let last = chapters.indices.last {
                chapters[last].hunks.append(hunk)
            }
            placed.insert("\(h.file)#\(h.index)")
        }
        let draft = StoryDraft(title: outline.title, summary: outline.summary, rootCause: outline.rootCause, chapters: chapters)
        let metrics = AnalysisMetrics(model: modelName, inputTokens: 0, outputTokens: 0, cost: 0,
                                      durationMs: Int(Date().timeIntervalSince(start) * 1000))
        return (draft, metrics)
    }

    /// Accepts "H3", "h3", "3" or "hunk 3".
    private func parse(key: String, map: [String: (file: String, index: Int)], note: [String: String]) -> StoryDraft.DraftHunk? {
        let digits = key.filter(\.isNumber)
        guard !digits.isEmpty, let h = map["H" + digits] else { return nil }
        return StoryDraft.DraftHunk(file: h.file, hunkIndex: h.index, annotation: note["H" + digits])
    }
}
