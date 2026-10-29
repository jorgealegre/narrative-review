import Foundation

/// Port of src/lib/diff-parser.ts. Same hunk indices, so stories from the Action replay here.
enum DiffParser {
    static func parse(_ raw: String) -> ParsedDiff {
        var files: [DiffFile] = []
        var section = ""
        var sections: [String] = []
        for line in raw.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix("diff --git ") {
                if !section.isEmpty { sections.append(section) }
                section = String(line.dropFirst("diff --git ".count)) + "\n"
            } else if !section.isEmpty {
                section += line + "\n"
            }
        }
        if !section.isEmpty { sections.append(section) }
        for s in sections {
            if let f = parseFileSection(s) { files.append(f) }
        }
        return ParsedDiff(
            files: files,
            totalAdditions: files.reduce(0) { $0 + $1.additions },
            totalDeletions: files.reduce(0) { $0 + $1.deletions },
            rawDiff: raw
        )
    }

    private static func parseFileSection(_ section: String) -> DiffFile? {
        let lines = section.split(separator: "\n", omittingEmptySubsequences: false)
        let header = lines.first.map(String.init) ?? ""
        guard let match = header.firstMatch(of: #/a\/(.+?) b\/(.+)/#) else { return nil }
        let oldPath = String(match.1)
        let newPath = String(match.2)

        var status: FileStatus = .modified
        if section.contains("new file mode") { status = .added }
        else if section.contains("deleted file mode") { status = .removed }
        else if oldPath != newPath { status = .renamed }

        let hunks = parseHunks(section)
        var additions = 0, deletions = 0
        for h in hunks {
            for l in h.lines {
                if l.hasPrefix("+") { additions += 1 } else if l.hasPrefix("-") { deletions += 1 }
            }
        }
        return DiffFile(path: newPath, status: status, oldPath: oldPath != newPath ? oldPath : nil,
                        hunks: hunks, additions: additions, deletions: deletions)
    }

    private static func parseHunks(_ section: String) -> [DiffHunk] {
        let regex = #/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/#.anchorsMatchLineEndings()
        let starts = section.matches(of: regex).map { m in
            (range: m.range, header: String(section[m.range]), old: Int(m.1) ?? 0, new: Int(m.2) ?? 0)
        }
        var hunks: [DiffHunk] = []
        for (i, s) in starts.enumerated() {
            let end = i + 1 < starts.count ? starts[i + 1].range.lowerBound : section.endIndex
            let text = String(section[s.range.lowerBound..<end])
            let contentLines = text.split(separator: "\n", omittingEmptySubsequences: false)
                .dropFirst().map(String.init).filter { !$0.isEmpty }
            hunks.append(DiffHunk(header: s.header, lines: contentLines,
                                  rawContent: text.trimmingCharacters(in: .whitespacesAndNewlines),
                                  startLineOld: s.old, startLineNew: s.new))
        }
        return hunks
    }
}

/// Port of src/lib/coverage-verifier.ts: every hunk lands in a chapter, or in "Uncategorized".
enum CoverageVerifier {
    static func attach(draft: StoryDraft, to diff: ParsedDiff) -> (chapters: [Chapter], coverage: CoverageResult) {
        var seen = Set<String>()
        var chapters: [Chapter] = draft.chapters.map { ch in
            Chapter(id: ch.id, title: ch.title, narrative: ch.narrative,
                    connectionToPrevious: ch.connectionToPrevious, safetyNotes: ch.safetyNotes,
                    hunks: ch.hunks.compactMap { h in
                        let key = "\(h.file)#\(h.hunkIndex)"
                        guard !seen.contains(key), let hunk = diff.hunk(file: h.file, index: h.hunkIndex) else { return nil }
                        seen.insert(key)
                        return ChapterHunk(file: h.file, hunkIndex: h.hunkIndex, diffContent: hunk.rawContent, annotation: h.annotation)
                    })
        }
        chapters.removeAll { $0.hunks.isEmpty }      // a chapter with nothing to show is filler
        var uncovered: [UncoveredHunk] = []
        var coveredFiles = Set<String>()
        var totalHunks = 0
        for f in diff.files {
            for (i, h) in f.hunks.enumerated() {
                totalHunks += 1
                if seen.contains("\(f.path)#\(i)") { coveredFiles.insert(f.path) }
                else { uncovered.append(UncoveredHunk(file: f.path, hunkIndex: i, rawContent: h.rawContent)) }
            }
        }
        if !uncovered.isEmpty {
            chapters.append(Chapter(
                id: "uncategorized", title: "Uncategorized",
                narrative: "These hunks were not placed in any chapter by the storyteller. Review them on their own.",
                connectionToPrevious: nil, safetyNotes: nil,
                hunks: uncovered.map { ChapterHunk(file: $0.file, hunkIndex: $0.hunkIndex, diffContent: $0.rawContent, annotation: nil) }))
        }
        let coverage = CoverageResult(totalFiles: diff.files.count, coveredFiles: coveredFiles.count,
                                      totalHunks: totalHunks, coveredHunks: seen.count,
                                      uncoveredHunks: uncovered, isComplete: uncovered.isEmpty)
        return (chapters, coverage)
    }
}
