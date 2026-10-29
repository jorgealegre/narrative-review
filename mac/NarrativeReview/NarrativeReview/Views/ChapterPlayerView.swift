import SwiftUI

/// One chapter as a film. The narrative is the voice-over on top, the code is the picture,
/// a title card marks every change of file, and the strip at the bottom is the timeline.
struct ChapterPlayerView: View {
    @Environment(AppModel.self) private var model
    let review: NarrativeReview
    let chapter: Chapter
    var onChapterEnd: () -> Void = {}
    @State private var player = FilmPlayer()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            voiceOver
            Divider()
            ZStack {
                if let frame = player.frame, let shot = player.film.shot(at: player.frameIndex) {
                    if frame.kind == .card {
                        TitleCard(shot: shot, index: shot.id, count: player.film.shots.count, repo: review.prInfo.repo, progress: frame.progress)
                            .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    } else {
                        CodeStage(frame: frame, shot: shot, file: shot.hunk.file)
                            .transition(.opacity)
                    }
                } else {
                    ContentUnavailableView("No hunks in this chapter", systemImage: "doc")
                }
            }
            .animation(.easeInOut(duration: 0.35), value: player.frame?.kind)
            .animation(.easeInOut(duration: 0.35), value: player.frame?.shot)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            Timeline(player: player)
        }
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(.space) { player.toggle(); return .handled }
        .onKeyPress(.rightArrow, phases: .down) { press in
            if press.modifiers.contains(.shift) { onChapterEnd() } else { player.nextShot() }
            return .handled
        }
        .onKeyPress(.leftArrow) { player.previousShot(); return .handled }
        .onKeyPress(characters: .init(charactersIn: "1234")) { press in
            player.speed = [1.0, 0.5, 1.0, 2.0, 4.0][Int(press.characters) ?? 1]; return .handled
        }
        .onAppear { player.load(Film.make(chapter: chapter)); player.play(); focused = true }
        .onChange(of: player.finished) { _, done in
            if done, player.autoAdvance { Task { try? await Task.sleep(for: .seconds(1.2)); onChapterEnd() } }
        }
    }

    private var voiceOver: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(chapter.title).font(.title2.weight(.semibold))
                    Spacer()
                    Text("\(player.film.shots.count) shot\(player.film.shots.count == 1 ? "" : "s") · \(Set(chapter.hunks.map(\.file)).count) file\(Set(chapter.hunks.map(\.file)).count == 1 ? "" : "s")")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Text(chapter.narrative).font(.system(size: 15)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                if let c = chapter.connectionToPrevious, !c.isEmpty {
                    Label(c, systemImage: "link").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(chapter.safetyNotes ?? [], id: \.self) { n in
                    Label(n, systemImage: "shield").font(.callout).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
        .frame(maxHeight: 240)
    }
}

/// Between files: the file name big, what happens to it, where we are in the chapter.
struct TitleCard: View {
    let shot: FilmShot
    let index: Int
    let count: Int
    let repo: String
    let progress: Double

    var body: some View {
        let p = Platform.of(repo: repo)
        let parts = shot.hunk.file.split(separator: "/").map(String.init)
        VStack(spacing: 14) {
            Spacer()
            HStack(spacing: 8) {
                Image(systemName: p.symbol)
                Text(p.name.uppercased()).tracking(2)
            }
            .font(.caption.weight(.semibold)).foregroundStyle(p.color)
            Text(parts.last ?? shot.hunk.file)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .multilineTextAlignment(.center)
            if parts.count > 1 {
                Text(parts.dropLast().joined(separator: " / ")).font(.callout.monospaced()).foregroundStyle(.secondary)
            }
            Text("Shot \(index + 1) of \(count) · from line \(shot.newStart)")
                .font(.callout).foregroundStyle(.tertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .opacity(min(1, progress * 4))
        .background(p.color.opacity(0.06))
    }
}

/// The picture: gutter with line numbers, code with syntax color, a callout under the code.
struct CodeStage: View {
    let frame: FilmFrame
    let shot: FilmShot
    let file: String

    var body: some View {
        let lang = CodeLanguage.detect(path: file)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "doc.text")
                Text(file).font(.callout.monospaced()).lineLimit(1).truncationMode(.head)
                Spacer()
                Text(frame.caption).font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(.quaternary.opacity(0.4))
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(frame.lines) { line in
                            FilmLineView(line: line, language: lang, isCursor: frame.cursorLine == line.id).id(line.id)
                        }
                    }
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: frame.cursorLine) { _, c in
                    if let c { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(c, anchor: UnitPoint(x: 0, y: 0.6)) } }
                }
            }
            if let a = shot.hunk.annotation, !a.isEmpty {
                Divider()
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "text.bubble.fill").foregroundStyle(Color.accentColor)
                    Text(a).font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color.accentColor.opacity(0.07))
            }
        }
    }
}

struct FilmLineView: View {
    let line: FilmLine
    let language: CodeLanguage
    let isCursor: Bool

    var body: some View {
        let (bg, opacity, strike, hidden): (Color, Double, Bool, Bool) = {
            switch line.state {
            case .context: return (.clear, 1, false, false)
            case .removing(let p): return (Color.red.opacity(0.22 * (1 - p) + 0.03), 1 - 0.75 * p, true, false)
            case .removed: return (.clear, 0, false, true)
            case .adding(let typed): return (Color.green.opacity(0.20), 1, false, typed == 0 && !isCursor)
            case .added: return (Color.green.opacity(0.12), 1, false, false)
            }
        }()
        if !hidden {
            HStack(alignment: .top, spacing: 0) {
                Text(line.newNumber.map(String.init) ?? line.oldNumber.map(String.init) ?? "")
                    .font(.system(size: 12, design: .monospaced)).foregroundStyle(.tertiary)
                    .frame(width: 44, alignment: .trailing).padding(.trailing, 12)
                Text(line.visibleText.isEmpty ? AttributedString(" ") : SyntaxHighlighter.attributed(line.visibleText, language: language))
                    .font(.system(size: 14, design: .monospaced))
                    .strikethrough(strike, color: .red)
                    .fixedSize(horizontal: false, vertical: true)
                if isCursor, case .adding = line.state {
                    Rectangle().fill(Color.accentColor).frame(width: 2, height: 16).padding(.leading, 1)
                }
            }
            .opacity(opacity)
            .padding(.trailing, 16).padding(.vertical, 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bg)
            .animation(.linear(duration: 0.1), value: line.state)
        }
    }
}

/// Transport plus a strip with one segment per shot. Click a segment to jump.
struct Timeline: View {
    let player: FilmPlayer

    var body: some View {
        @Bindable var player = player
        VStack(spacing: 6) {
            HStack(spacing: 3) {
                ForEach(player.film.shots) { shot in
                    let current = player.frame?.shot == shot.id
                    let done = (player.frame?.shot ?? -1) > shot.id
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.quaternary)
                            Capsule().fill(Color.accentColor.opacity(done ? 0.55 : 1))
                                .frame(width: geo.size.width * (done ? 1 : current ? (player.frame?.progress ?? 0) : 0))
                        }
                    }
                    .frame(height: 6)
                    .frame(maxWidth: .infinity)
                    .help("\(shot.hunk.file) · line \(shot.newStart)")
                    .onTapGesture { player.seek(toShot: shot.id) }
                }
            }
            HStack(spacing: 12) {
                Button { player.previousShot() } label: { Image(systemName: "backward.end.fill") }
                Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 14) }
                Button { player.nextShot() } label: { Image(systemName: "forward.end.fill") }
                if let s = player.film.shot(at: player.frameIndex) {
                    Text("shot \(s.id + 1) of \(player.film.shots.count) · \(s.hunk.file.split(separator: "/").last.map(String.init) ?? "")")
                        .font(.caption.monospacedDigit()).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text("space play · ← → shots · ⇧→ next chapter · 1-4 speed").font(.caption2).foregroundStyle(.tertiary)
                Picker("Speed", selection: $player.speed) {
                    Text("0.5×").tag(0.5); Text("1×").tag(1.0); Text("2×").tag(2.0); Text("4×").tag(4.0)
                }
                .pickerStyle(.segmented).labelsHidden().frame(width: 200)
                Toggle("Auto", isOn: $player.autoAdvance).toggleStyle(.checkbox).fixedSize().help("Roll on to the next shot and chapter")
            }
            .buttonStyle(.borderless)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }
}

/// Owns the clock. The film is precomputed; the player only moves an index.
@MainActor @Observable
final class FilmPlayer {
    private(set) var film = Film()
    private(set) var frameIndex = 0
    private(set) var isPlaying = false
    var speed: Double = 1.0
    var autoAdvance = true
    var finished: Bool { !film.frames.isEmpty && frameIndex >= film.frames.count - 1 }
    var frame: FilmFrame? { film.frames[safe: frameIndex] }
    private var task: Task<Void, Never>?

    func load(_ film: Film) { pause(); self.film = film; frameIndex = 0 }

    func play() {
        guard !film.frames.isEmpty else { return }
        if finished { frameIndex = 0 }
        isPlaying = true
        task?.cancel()
        task = Task { [weak self] in
            while let self, !Task.isCancelled, self.isPlaying, !self.finished {
                try? await Task.sleep(for: .seconds(0.045 / self.speed))
                if Task.isCancelled { break }
                self.frameIndex += 1
            }
            self?.isPlaying = false
        }
    }

    func pause() { isPlaying = false; task?.cancel(); task = nil }
    func toggle() { isPlaying ? pause() : play() }

    func seek(toShot i: Int) {
        guard let s = film.shots[safe: i] else { return }
        let wasPlaying = isPlaying
        pause()
        frameIndex = s.firstFrame
        if wasPlaying || autoAdvance { play() }
    }

    func nextShot() {
        guard let cur = frame?.shot else { return }
        if cur + 1 < film.shots.count { seek(toShot: cur + 1) } else { pause(); frameIndex = max(0, film.frames.count - 1) }
    }

    func previousShot() {
        guard let cur = frame?.shot else { return }
        seek(toShot: max(0, cur - 1))
    }
}
