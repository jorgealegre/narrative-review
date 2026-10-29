import Foundation

/// A chapter as a film. One thing on screen at a time, in this order:
/// the chapter card (held long enough to read), the notes card, then one shot per hunk,
/// each opened by a file card and a callout. Frames are precomputed; the player moves an index.
struct FilmLine: Identifiable, Hashable, Sendable {
    enum State: Hashable, Sendable { case context, removing(progress: Double), removed, adding(typed: Int), added }
    var id: Int
    var text: String
    var state: State
    var oldNumber: Int?
    var newNumber: Int?

    var visibleText: String {
        if case .adding(let typed) = state { return String(text.prefix(typed)) }
        return text
    }
}

struct FilmFrame: Sendable {
    enum Kind: Sendable, Hashable { case chapterCard, notesCard, fileCard, callout, code }
    var kind: Kind
    var shot: Int                 // index into chapter.hunks (-1 on chapter-level cards)
    var lines: [FilmLine]
    var caption: String
    var cursorLine: Int?
    var progress: Double          // 0...1 inside this shot or card
}

struct FilmShot: Identifiable, Sendable {
    var id: Int
    var hunk: ChapterHunk
    var fileChanged: Bool
    var oldStart: Int
    var newStart: Int
    var firstFrame: Int
    var frameCount: Int
}

struct Film: Sendable {
    var shots: [FilmShot] = []
    var frames: [FilmFrame] = []
    static let frameSeconds = 0.045

    /// Reading time: about 230 words a minute, never under the floor.
    static func holdFrames(words: Int, floor: Double = 2.5) -> Int {
        Int(max(floor, Double(words) / 280 * 60 + 0.6) / frameSeconds)
    }

    static func make(chapter: Chapter, charsPerFrame: Int = 3) -> Film {
        var film = Film()
        let empty: [FilmLine] = []
        // 1. Chapter card: title and narrative, held for reading.
        let narrativeWords = chapter.narrative.split(separator: " ").count + chapter.title.split(separator: " ").count
            + (chapter.connectionToPrevious?.split(separator: " ").count ?? 0)
        let cardHold = holdFrames(words: narrativeWords, floor: 4)
        for k in 0..<cardHold {
            film.frames.append(FilmFrame(kind: .chapterCard, shot: -1, lines: empty, caption: chapter.title, cursorLine: nil, progress: Double(k) / Double(cardHold)))
        }
        // 2. Notes card, only when there is something to warn about.
        if let notes = chapter.safetyNotes, !notes.isEmpty {
            let hold = holdFrames(words: notes.joined(separator: " ").split(separator: " ").count, floor: 3)
            for k in 0..<hold {
                film.frames.append(FilmFrame(kind: .notesCard, shot: -1, lines: empty, caption: "Watch out", cursorLine: nil, progress: Double(k) / Double(hold)))
            }
        }
        // 3. Shots.
        var lastFile: String?
        for (i, hunk) in chapter.hunks.enumerated() {
            let (oldStart, newStart) = headerNumbers(hunk.diffContent)
            let changed = hunk.file != lastFile
            lastFile = hunk.file
            let first = film.frames.count
            var lines = buildLines(hunk, oldStart: oldStart, newStart: newStart)
            if changed {
                let hold = Int(1.6 / frameSeconds)
                for k in 0..<hold {
                    film.frames.append(FilmFrame(kind: .fileCard, shot: i, lines: lines, caption: hunk.file, cursorLine: nil, progress: Double(k) / Double(hold)))
                }
            }
            if let a = hunk.annotation, !a.isEmpty {
                let hold = holdFrames(words: a.split(separator: " ").count, floor: 2.2)
                for k in 0..<hold {
                    film.frames.append(FilmFrame(kind: .callout, shot: i, lines: lines, caption: a, cursorLine: nil, progress: Double(k) / Double(hold)))
                }
            }
            film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Before", cursorLine: nil, progress: 0))
            let removedIdx = lines.indices.filter { if case .context = lines[$0].state, lines[$0].newNumber == nil { return true } else { return false } }
            if !removedIdx.isEmpty {
                for step in 1...6 {
                    for j in removedIdx { lines[j].state = .removing(progress: Double(step) / 6) }
                    film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Removing \(removedIdx.count) line\(removedIdx.count == 1 ? "" : "s")", cursorLine: removedIdx.min(), progress: 0.1))
                }
                for j in removedIdx { lines[j].state = .removed }
                for _ in 0..<6 { film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Removed", cursorLine: removedIdx.min(), progress: 0.15)) }
            }
            let addedIdx = lines.indices.filter { if case .adding = lines[$0].state { return true } else { return false } }
            let totalChars = max(1, addedIdx.reduce(0) { $0 + max(1, lines[$1].text.count) })
            var typedChars = 0
            for j in addedIdx {
                let text = lines[j].text
                var typed = 0
                repeat {
                    let step = min(charsPerFrame, max(1, text.count - typed))
                    typed = min(text.count, typed + charsPerFrame)
                    typedChars += step
                    lines[j].state = .adding(typed: typed)
                    film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Writing", cursorLine: j, progress: 0.15 + 0.8 * Double(typedChars) / Double(totalChars)))
                } while typed < text.count
                lines[j].state = .added
            }
            let after = Int(1.8 / frameSeconds)
            for k in 0..<after {
                film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "After", cursorLine: nil, progress: 0.95 + 0.05 * Double(k) / Double(after)))
            }
            film.shots.append(FilmShot(id: i, hunk: hunk, fileChanged: changed, oldStart: oldStart, newStart: newStart,
                                       firstFrame: first, frameCount: film.frames.count - first))
        }
        return film
    }

    static func headerNumbers(_ diff: String) -> (Int, Int) {
        guard let header = diff.split(separator: "\n").first, header.hasPrefix("@@"),
              let m = header.firstMatch(of: #/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/#) else { return (1, 1) }
        return (Int(m.1) ?? 1, Int(m.2) ?? 1)
    }

    private static func buildLines(_ hunk: ChapterHunk, oldStart: Int, newStart: Int) -> [FilmLine] {
        let body = hunk.diffContent.split(separator: "\n", omittingEmptySubsequences: false).map(String.init).filter { !$0.hasPrefix("@@") }
        var old = oldStart, new = newStart
        var lines: [FilmLine] = []
        for (i, raw) in body.enumerated() {
            let text = raw.isEmpty ? "" : String(raw.dropFirst())
            if raw.hasPrefix("+") {
                lines.append(FilmLine(id: i, text: text, state: .adding(typed: 0), oldNumber: nil, newNumber: new)); new += 1
            } else if raw.hasPrefix("-") {
                lines.append(FilmLine(id: i, text: text, state: .context, oldNumber: old, newNumber: nil)); old += 1
            } else if raw.hasPrefix("\\") {
                continue
            } else {
                lines.append(FilmLine(id: i, text: text, state: .context, oldNumber: old, newNumber: new)); old += 1; new += 1
            }
        }
        return lines
    }

    func shot(at frame: Int) -> FilmShot? {
        guard let f = frames[safe: frame], f.shot >= 0 else { return nil }
        return shots[safe: f.shot]
    }

    var seconds: Double { Double(frames.count) * Film.frameSeconds }
}
