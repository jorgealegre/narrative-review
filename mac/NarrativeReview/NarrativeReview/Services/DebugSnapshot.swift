#if DEBUG
import AppKit
import Foundation

/// Debug only: an agent drops a path into `snapshot.request` and gets a PNG of the main window.
/// Works without screen-recording permission because the window renders itself.
@MainActor
enum DebugSnapshot {
    /// Request file: line 1 is the PNG path, line 2 (optional) a PR id to select first, line 3 (optional) "tell" to run the storyteller and wait.
    static func start(model: AppModel) {
        let request = AppPaths.support.appendingPathComponent("snapshot.request")
        Task {
            while true {
                try? await Task.sleep(for: .milliseconds(500))
                guard let text = try? String(contentsOf: request, encoding: .utf8) else { continue }
                let lines = text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
                guard let dest = lines.first, !dest.isEmpty else { continue }
                try? FileManager.default.removeItem(at: request)
                if lines.count > 1, !lines[1].isEmpty {
                    model.path = [lines[1]]
                    try? await Task.sleep(for: .seconds(2.5))
                }
                if lines.count > 2, lines[2].hasPrefix("tell"), let pr = model.path.last.flatMap({ model.ref($0) }) {
                    // "tell" uses the current brain; "tell:claude:claude-sonnet-5-5" picks one for this run.
                    let parts = lines[2].split(separator: ":").map(String.init)
                    if parts.count >= 2 { model.storytellerKind = parts[1] == "claude" ? .claude : .apple }
                    if parts.count >= 3 { model.claudeModelID = parts[2] }
                    model.tellStory(for: pr)
                    var waited = 0
                    while model.progress[pr.id] != nil, waited < 1200 {
                        try? await Task.sleep(for: .seconds(1)); waited += 1
                    }
                    try? await Task.sleep(for: .seconds(2))
                }
                let board = model.board.map { "\($0.0.rawValue): " + $0.1.map { "\($0.pr.repo)#\($0.pr.number) [\($0.urgency)] \($0.reason)" }.joined(separator: " | ") }.joined(separator: "\n")
                let state = """
                inbox: \(model.prs.count) error: \(model.inboxError ?? "none") loading: \(model.isLoadingInbox) viewer: \(model.viewerLogin ?? "?")
                reviews: \(model.reviews.keys.sorted())
                gists: \(model.gistText.count) key: \({ let k = model.claudeKey; return k.isEmpty ? "none" : "\(k.prefix(10))… len \(k.count)" }())
                path: \(model.path)
                progress: \(model.progress.mapValues(\.step)) errors: \(model.errors)
                \(board)
                """
                try? state.write(to: URL(fileURLWithPath: dest + ".txt"), atomically: true, encoding: .utf8)
                guard let win = NSApp.windows.filter({ $0.isVisible && $0.frame.width > 400 }).max(by: { $0.frame.width < $1.frame.width }),
                      let view = win.contentView, let layer = view.layer else { continue }
                let scale = win.backingScaleFactor
                let size = view.bounds.size
                guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale),
                                                 bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
                      let ctx = NSGraphicsContext(bitmapImageRep: rep) else { continue }
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = ctx
                ctx.cgContext.scaleBy(x: scale, y: scale)
                (win.backgroundColor ?? .windowBackgroundColor).setFill()
                ctx.cgContext.fill(CGRect(origin: .zero, size: size))
                ctx.cgContext.translateBy(x: 0, y: size.height)
                ctx.cgContext.scaleBy(x: 1, y: -1)
                layer.render(in: ctx.cgContext)
                NSGraphicsContext.restoreGraphicsState()
                if let png = rep.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: dest))
                }
            }
        }
    }
}
#endif
