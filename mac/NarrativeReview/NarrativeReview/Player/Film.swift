import Foundation

/// A chapter as a film: one shot per hunk, a title card when the file changes, line numbers in the gutter.
/// Frames are precomputed value snapshots; the player only moves an index.
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
    enum Kind: Sendable { case card, code }
    var kind: Kind
    var shot: Int                 // index into chapter.hunks
    var lines: [FilmLine]
    var caption: String
    var cursorLine: Int?
    var progress: Double          // 0...1 inside this shot
}

struct FilmShot: Identifiable, Sendable {
    var id: Int
    var hunk: ChapterHunk
    var fileChanged: Bool         // first shot in a new file: gets a title card
    var oldStart: Int
    var newStart: Int
    var firstFrame: Int           // index into the film's frames
    var frameCount: Int
}

struct Film: Sendable {
    var shots: [FilmShot] = []
    var frames: [FilmFrame] = []

    static let cardFrames = 26    // about 1.2 s at the base rate

    static func make(chapter: Chapter, charsPerFrame: Int = 3) -> Film {
        var film = Film()
        var lastFile: String?
        for (i, hunk) in chapter.hunks.enumerated() {
            let (oldStart, newStart) = headerNumbers(hunk.diffContent)
            let changed = hunk.file != lastFile
            lastFile = hunk.file
            let first = film.frames.count
            var lines = buildLines(hunk, oldStart: oldStart, newStart: newStart)
            let caption = "\(hunk.file.split(separator: "/").last.map(String.init) ?? hunk.file) · line \(newStart)"
            if changed {
                for k in 0..<cardFrames {
                    film.frames.append(FilmFrame(kind: .card, shot: i, lines: lines, caption: caption, cursorLine: nil, progress: Double(k) / Double(cardFrames)))
                }
            }
            film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Before", cursorLine: nil, progress: 0))
            let removedIdx = lines.indices.filter { if case .context = lines[$0].state, lines[$0].newNumber == nil { return true } else { return false } }
            if !removedIdx.isEmpty {
                for step in 1...5 {
                    for j in removedIdx { lines[j].state = .removing(progress: Double(step) / 5) }
                    film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Removing \(removedIdx.count) line\(removedIdx.count == 1 ? "" : "s")", cursorLine: removedIdx.min(), progress: 0.1))
                }
                for j in removedIdx { lines[j].state = .removed }
                film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Removed", cursorLine: removedIdx.min(), progress: 0.15))
            }
            let addedIdx = lines.indices.filter { if case .adding = lines[$0].state { return true } else { return false } }
            let totalChars = max(1, addedIdx.reduce(0) { $0 + max(1, lines[$1].text.count) })
            var typedChars = 0
            for j in addedIdx {
                let text = lines[j].text
                var typed = 0
                repeat {
                    typed = min(text.count, typed + charsPerFrame)
                    typedChars += min(charsPerFrame, max(1, text.count - (typed - charsPerFrame)))
                    lines[j].state = .adding(typed: typed)
                    film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "Writing", cursorLine: j, progress: 0.15 + 0.8 * Double(typedChars) / Double(totalChars)))
                } while typed < text.count
                lines[j].state = .added
            }
            for k in 0..<8 {   // hold on the result
                film.frames.append(FilmFrame(kind: .code, shot: i, lines: lines, caption: "After", cursorLine: nil, progress: 0.95 + 0.05 * Double(k) / 8))
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
                continue   // "\ No newline at end of file"
            } else {
                lines.append(FilmLine(id: i, text: text, state: .context, oldNumber: old, newNumber: new)); old += 1; new += 1
            }
        }
        return lines
    }

    func shot(at frame: Int) -> FilmShot? {
        guard let f = frames[safe: frame] else { return nil }
        return shots[safe: f.shot]
    }
}
