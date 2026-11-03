#if DEBUG
import AppKit
import AVFoundation
import Foundation

/// Debug only: plays a scripted session and records the window to an mp4, so an agent without
/// screen-recording rights can still watch the app. Script: `drive.json` in Application Support:
/// [{"wait": 1.5}, {"key": "space"}, {"key": "right"}, {"click": [x, y]}, {"home": true}, {"open": "owner/repo#n"}, {"shot": "name"}]
/// Output: `drive.mp4` plus `drive-<n>.png` every 1.5 s, in the folder named by "out" (first step) or Application Support.
@MainActor
enum DebugDrive {
    static func start(model: AppModel) {
        let script = AppPaths.support.appendingPathComponent("drive.json")
        Task {
            while true {
                try? await Task.sleep(for: .milliseconds(700))
                guard let data = try? Data(contentsOf: script),
                      let steps = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { continue }
                try? FileManager.default.removeItem(at: script)
                await run(steps, model: model)
            }
        }
    }

    private static func run(_ steps: [[String: Any]], model: AppModel) async {
        let outDir = (steps.first?["out"] as? String).map { URL(fileURLWithPath: $0) } ?? AppPaths.support
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        let rec = Recorder(url: outDir.appendingPathComponent("drive.mp4"), stillsDir: outDir)
        rec.start()
        defer { rec.stop(); try? "done".write(to: outDir.appendingPathComponent("drive.done"), atomically: true, encoding: .utf8) }
        for step in steps {
            if let s = step["wait"] as? Double { try? await Task.sleep(for: .seconds(s)) }
            if let k = step["key"] as? String { sendKey(k, modifiers: step["mods"] as? [String] ?? []) }
            if let c = step["click"] as? [Double], c.count == 2 { click(x: c[0], y: c[1]) }
            if step["home"] != nil { model.path = [] }
            if step["back"] != nil { model.goBack() }
            if let id = step["open"] as? String { model.path = [id] }
            if let name = step["shot"] as? String { rec.still(named: name) }
            try? await Task.sleep(for: .milliseconds(80))
        }
    }

    static var window: NSWindow? { NSApp.windows.filter { $0.isVisible && $0.frame.width > 400 }.max { $0.frame.width < $1.frame.width } }

    /// Key names: space, left, right, up, down, escape, return, or a single character. mods: cmd, shift, option, control.
    private static func sendKey(_ name: String, modifiers: [String]) {
        guard let win = window else { return }
        let map: [String: (UInt16, String)] = ["space": (49, " "), "left": (123, "\u{F702}"), "right": (124, "\u{F703}"),
                                               "up": (126, "\u{F700}"), "down": (125, "\u{F701}"), "escape": (53, "\u{1B}"), "return": (36, "\r")]
        let (code, chars) = map[name] ?? (0, name)
        var flags: NSEvent.ModifierFlags = []
        if modifiers.contains("cmd") { flags.insert(.command) }
        if modifiers.contains("shift") { flags.insert(.shift) }
        if modifiers.contains("option") { flags.insert(.option) }
        if modifiers.contains("control") { flags.insert(.control) }
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            if let e = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                        windowNumber: win.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars,
                                        isARepeat: false, keyCode: code) {
                NSApp.sendEvent(e)
            }
        }
    }

    /// Click in window points, origin top-left of the content view.
    private static func click(x: Double, y: Double) {
        guard let win = window, let view = win.contentView else { return }
        let p = NSPoint(x: x, y: view.bounds.height - y)
        for (type, n) in [(NSEvent.EventType.leftMouseDown, 1), (.leftMouseUp, 1)] {
            if let e = NSEvent.mouseEvent(with: type, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                          windowNumber: win.windowNumber, context: nil, eventNumber: 0, clickCount: n, pressure: 1) {
                NSApp.sendEvent(e)
            }
        }
    }

    /// Renders the window layer to frames at 12 fps and writes H.264. Stills every 1.5 s for quick looks.
    final class Recorder {
        let url: URL
        let stillsDir: URL
        private var writer: AVAssetWriter?
        private var input: AVAssetWriterInput?
        private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
        private var timer: Task<Void, Never>?
        private var frame = 0
        private var stillIndex = 0
        private var size = CGSize.zero
        private let fps: Int32 = 12

        init(url: URL, stillsDir: URL) { self.url = url; self.stillsDir = stillsDir }

        func start() {
            try? FileManager.default.removeItem(at: url)
            timer = Task { @MainActor in
                while !Task.isCancelled {
                    self.capture()
                    try? await Task.sleep(for: .milliseconds(Int(1000 / Int(self.fps))))
                }
            }
        }

        func stop() {
            timer?.cancel(); timer = nil
            input?.markAsFinished()
            let w = writer
            let sem = DispatchSemaphore(value: 0)
            w?.finishWriting { sem.signal() }
            if w != nil { _ = sem.wait(timeout: .now() + 5) }
        }

        @MainActor func still(named name: String) {
            guard let img = render() else { return }
            if let png = NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:]) {
                try? png.write(to: stillsDir.appendingPathComponent("\(name).png"))
            }
        }

        @MainActor private func capture() {
            guard let img = render() else { return }
            if writer == nil { setUp(width: img.width, height: img.height) }
            guard let adaptor, let input, input.isReadyForMoreMediaData, let pool = adaptor.pixelBufferPool else { return }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
            guard let pb else { return }
            CVPixelBufferLockBaseAddress(pb, [])
            if let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: img.width, height: img.height, bitsPerComponent: 8,
                                   bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
                ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
            }
            CVPixelBufferUnlockBaseAddress(pb, [])
            adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps))
            if frame % Int(fps * 3 / 2) == 0 {
                stillIndex += 1
                if let png = NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:]) {
                    try? png.write(to: stillsDir.appendingPathComponent(String(format: "drive-%03d.png", stillIndex)))
                }
            }
            frame += 1
        }

        private func setUp(width: Int, height: Int) {
            guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000]])
            input.expectsMediaDataInRealTime = true
            let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
            w.add(input)
            w.startWriting(); w.startSession(atSourceTime: .zero)
            writer = w; self.input = input; self.adaptor = adaptor
        }

        /// Same rendering as the snapshot hook, at 1x to keep the video small.
        @MainActor private func render() -> CGImage? {
            guard let win = DebugDrive.window, let view = win.contentView, let layer = view.layer else { return nil }
            let s = view.bounds.size
            let w = Int(s.width.rounded(.down) / 2) * 2, h = Int(s.height.rounded(.down) / 2) * 2
            guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { return nil }
            ctx.setFillColor((win.backgroundColor ?? .windowBackgroundColor).cgColor)
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: 1, y: -1)
            layer.render(in: ctx)
            return ctx.makeImage()
        }
    }
}
#endif
