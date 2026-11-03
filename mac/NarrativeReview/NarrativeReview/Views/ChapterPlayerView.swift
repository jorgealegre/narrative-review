import SwiftUI

/// The screening stage. One thing at a time: chapter card, notes, file card, callout, code.
/// It drives itself; the keys only steer.
struct ChapterPlayerView: View {
    @Environment(AppModel.self) private var model
    let review: NarrativeReview
    let chapter: Chapter
    let chapterIndex: Int
    let chapterCount: Int
    var onChapterEnd: () -> Void = {}
    var onChapterBack: () -> Void = {}
    var onReplay: () -> Void = {}
    var onNextPR: () -> Void = {}
    @State private var player = FilmPlayer()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Stage.background
                if let frame = player.frame {
                    switch frame.kind {
                    case .chapterCard:
                        ChapterCard(chapter: chapter, index: chapterIndex, count: chapterCount, progress: frame.progress)
                            .transition(.opacity)
                    case .notesCard:
                        NotesCard(notes: chapter.safetyNotes ?? [], progress: frame.progress).transition(.opacity)
                    case .fileCard:
                        if let shot = player.film.shot(at: player.frameIndex) {
                            FileCard(shot: shot, count: player.film.shots.count, repo: review.prInfo.repo, progress: frame.progress)
                                .transition(.opacity.combined(with: .scale(scale: 0.985)))
                        }
                    case .callout, .code:
                        if let shot = player.film.shot(at: player.frameIndex) {
                            CodeStage(frame: frame, shot: shot, showCallout: frame.kind == .callout)
                                .transition(.opacity)
                        }
                    case .endCard:
                        EndCard(review: review, progress: frame.progress, onReplay: onReplay, onNextPR: onNextPR)
                            .transition(.opacity.combined(with: .scale(scale: 1.02)))
                    }
                } else {
                    ContentUnavailableView("No hunks in this chapter", systemImage: "doc").foregroundStyle(Stage.text)
                }
            }
            .animation(.easeInOut(duration: 0.4), value: player.frame?.kind)
            .animation(.easeInOut(duration: 0.4), value: player.frame?.shot)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .top) { StorySegments(player: player).padding(.horizontal, 14).padding(.top, 10) }
            .overlay(alignment: .topTrailing) {
                if !player.isPlaying, player.frame?.kind != .endCard {
                    Label("paused · space", systemImage: "pause.fill").font(.caption.weight(.semibold)).foregroundStyle(Stage.textBright)
                        .padding(.horizontal, 10).padding(.vertical, 5).background(Stage.backgroundHighlight, in: Capsule())
                        .padding(.top, 22).padding(.trailing, 14).transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
            .overlay { TapZones(player: player) }
            Timeline(player: player, chapterIndex: chapterIndex, chapterCount: chapterCount)
        }
        .background(Stage.background)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(.space) { player.toggle(); return .handled }
        .onKeyPress(.rightArrow, phases: .down) { press in
            if press.modifiers.contains(.shift) { onChapterEnd() } else { player.nextShot() }
            return .handled
        }
        .onKeyPress(.leftArrow, phases: .down) { press in
            if press.modifiers.contains(.shift) { onChapterBack() } else { player.previousShot() }
            return .handled
        }
        .onKeyPress(.downArrow) { onChapterEnd(); return .handled }
        .onKeyPress(.upArrow) { onChapterBack(); return .handled }
        .onKeyPress(characters: .init(charactersIn: "1234")) { press in
            player.speed = [1.0, 0.5, 1.0, 1.5, 2.5][Int(press.characters) ?? 1]; return .handled
        }
        .onAppear {
            player.load(Film.make(chapter: chapter, isLast: chapterIndex == chapterCount - 1, summary: review.summary))
            player.play(); focused = true
        }
        .onChange(of: model.filmSeekToEnd) { _, _ in
            if let last = player.film.frames.lastIndex(where: { $0.kind != .endCard }) { player.seek(toFrame: last + 1) }
        }
        .onChange(of: player.frameIndex) { _, i in
            model.chapterProgress = player.film.frames.isEmpty ? 0 : Double(i) / Double(max(1, player.film.frames.count - 1))
            if player.frame?.kind == .endCard {
                model.markWatched(review.id)
                if review.quiz != nil, player.isPlaying { player.pause() }   // the quiz waits for an answer
            }
        }
        .onChange(of: player.finished) { _, done in
            if done, player.autoAdvance, chapterIndex + 1 < chapterCount { Task { try? await Task.sleep(for: .seconds(0.4)); onChapterEnd() } }
        }
    }
}

/// The chapter in large type, held long enough to read. A thin bar shows the hold.
struct ChapterCard: View {
    let chapter: Chapter
    let index: Int
    let count: Int
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()
            Text("CHAPTER \(index + 1) OF \(count)").font(.caption.weight(.semibold)).tracking(3).foregroundStyle(Stage.accent)
            Text(chapter.title).font(.system(size: 40, weight: .bold, design: .rounded)).foregroundStyle(Color.white.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
            Text(chapter.narrative).font(.system(size: 20)).lineSpacing(6).foregroundStyle(Stage.text)
                .fixedSize(horizontal: false, vertical: true)
            if let c = chapter.connectionToPrevious, !c.isEmpty, index > 0 {
                Label(c, systemImage: "link").font(.system(size: 16)).foregroundStyle(Stage.gutter)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            HoldBar(progress: progress)
        }
        .padding(.horizontal, 72).padding(.vertical, 40)
        .frame(maxWidth: 1000, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct NotesCard: View {
    let notes: [String]
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Label("WATCH OUT", systemImage: "shield.fill").font(.caption.weight(.semibold)).foregroundStyle(Color(red: 0.796, green: 0.294, blue: 0.086))
            ForEach(notes, id: \.self) { n in
                Text(n).font(.system(size: 20)).lineSpacing(5).foregroundStyle(Stage.textBright).fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            HoldBar(progress: progress)
        }
        .padding(.horizontal, 72).padding(.vertical, 40)
        .frame(maxWidth: 1000, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Between files: where we are going next.
struct FileCard: View {
    let shot: FilmShot
    let count: Int
    let repo: String
    let progress: Double

    var body: some View {
        let p = Platform.of(repo: repo)
        let parts = shot.hunk.file.split(separator: "/").map(String.init)
        VStack(spacing: 14) {
            Spacer()
            HStack(spacing: 8) { Image(systemName: p.symbol); Text(p.name.uppercased()).tracking(3) }
                .font(.caption.weight(.semibold)).foregroundStyle(p.color)
            Text(parts.last ?? shot.hunk.file).font(.system(size: 38, weight: .bold, design: .rounded)).foregroundStyle(Color.white.opacity(0.92))
                .multilineTextAlignment(.center)
            if parts.count > 1 {
                Text(parts.dropLast().joined(separator: " / ")).font(.system(size: 14, design: .monospaced)).foregroundStyle(Stage.gutter)
            }
            Text("Shot \(shot.id + 1) of \(count) · from line \(shot.newStart)").font(.callout).foregroundStyle(Stage.gutter)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .opacity(min(1, 0.35 + progress * 6))
    }
}

/// WhatsApp-style: one thin segment per shot (and per card), filling as the film plays.
struct StorySegments: View {
    let player: FilmPlayer

    var body: some View {
        let shots = player.film.shots
        let cur = player.frame?.shot ?? -1
        let kind = player.frame?.kind
        let inCards = kind == .chapterCard || kind == .notesCard
        let atEnd = kind == .endCard
        HStack(spacing: 4) {
            segment(fill: inCards ? (player.frame?.progress ?? 0) : 1)   // the chapter card
            ForEach(shots) { s in
                segment(fill: atEnd || cur > s.id ? 1 : cur == s.id ? (player.frame?.progress ?? 0) : 0)
            }
            if player.film.frames.contains(where: { $0.kind == .endCard }) {
                segment(fill: atEnd ? (player.frame?.progress ?? 0) : 0)
            }
        }
        .frame(height: 3)
    }

    private func segment(fill: Double) -> some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Stage.textBright.opacity(0.22))
                Capsule().fill(Stage.textBright.opacity(0.95)).frame(width: g.size.width * min(1, max(0, fill)))
            }
        }
    }
}

/// Stories controls: click the left third to go back, the right side to go on, hold to pause.
struct TapZones: View {
    let player: FilmPlayer
    @State private var holding = false

    var body: some View {
        GeometryReader { g in
            HStack(spacing: 0) {
                Color.clear.contentShape(Rectangle())
                    .onTapGesture { player.previousShot() }
                    .frame(width: g.size.width / 3)
                Color.clear.contentShape(Rectangle())
                    .onTapGesture { player.nextShot() }
            }
        }
        .onLongPressGesture(minimumDuration: 0.25, maximumDistance: 50, perform: {}, onPressingChanged: { pressing in
            if pressing { holding = player.isPlaying; if holding { player.pause() } }
            else if holding { player.play(); holding = false }
        })
        .overlay(alignment: .center) {
            if holding {
                Label("paused", systemImage: "pause.fill").font(.caption.weight(.semibold)).foregroundStyle(Stage.textBright)
                    .padding(.horizontal, 10).padding(.vertical, 5).background(Stage.backgroundHighlight, in: Capsule())
                    .transition(.opacity)
            }
        }
    }
}

/// After the last chapter: the story in one breath, and the three things to do next.
struct EndCard: View {
    @Environment(AppModel.self) private var model
    let review: NarrativeReview
    let progress: Double
    let onReplay: () -> Void
    let onNextPR: () -> Void
    @State private var picked: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()
            HStack(spacing: 14) {
                Text("THE END").font(.caption.weight(.semibold)).tracking(3).foregroundStyle(Stage.accent)
                Text("\(model.watchedToday) watched today · \(model.streakDays)-day streak").font(.caption).foregroundStyle(Stage.gutter)
            }
            if let q = review.quiz {
                VStack(alignment: .leading, spacing: 10) {
                    Text("QUICK CHECK").font(.caption.weight(.semibold)).tracking(3).foregroundStyle(Stage.accent)
                    Text(q.question).font(.system(size: 20, weight: .semibold)).foregroundStyle(Stage.textBright).fixedSize(horizontal: false, vertical: true)
                    ForEach(Array(q.options.enumerated()), id: \.offset) { i, opt in
                        Button { withAnimation(.spring(duration: 0.3)) { picked = i } } label: {
                            HStack(spacing: 10) {
                                Image(systemName: picked == nil ? "circle" : i == q.answerIndex ? "checkmark.circle.fill" : picked == i ? "xmark.circle.fill" : "circle")
                                    .foregroundStyle(picked == nil ? Stage.gutter : i == q.answerIndex ? Stage.added : picked == i ? Stage.removed : Stage.gutter)
                                Text(opt).font(.system(size: 16)).foregroundStyle(Stage.textBright).fixedSize(horizontal: false, vertical: true)
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(picked == i ? (i == q.answerIndex ? Stage.added.opacity(0.15) : Stage.removed.opacity(0.15)) : Stage.backgroundHighlight.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [])
                    }
                    if let p = picked {
                        Text(p == q.answerIndex ? "Right. \(q.why)" : "Not quite. \(q.why)").font(.system(size: 15)).foregroundStyle(Stage.text).fixedSize(horizontal: false, vertical: true)
                            .transition(.opacity)
                    }
                }
                .padding(18).background(Stage.backgroundHighlight.opacity(0.35), in: RoundedRectangle(cornerRadius: 14))
            }
            Text(review.title).font(.system(size: review.quiz == nil ? 34 : 26, weight: .bold, design: .rounded)).foregroundStyle(Stage.textBright)
                .fixedSize(horizontal: false, vertical: true)
            if review.quiz == nil {
                Text(review.summary).font(.system(size: 19)).lineSpacing(5).foregroundStyle(Stage.text).fixedSize(horizontal: false, vertical: true)
            }
            Text("\(review.chapters.count) chapters · \(Set(review.chapters.flatMap { $0.hunks.map(\.file) }).count) files · +\(review.prInfo.additions) −\(review.prInfo.deletions)")
                .font(.callout).foregroundStyle(Stage.gutter)
            HStack(spacing: 12) {
                Button { onReplay() } label: { Label("Watch again", systemImage: "arrow.counterclockwise") }
                Button { onNextPR() } label: { Label("Next in queue", systemImage: "forward.fill") }
                    .keyboardShortcut(.return, modifiers: [])
                Link(destination: URL(string: "https://github.com/\(review.prInfo.owner)/\(review.prInfo.repo)/pull/\(review.prInfo.number)")!) {
                    Label("Review on GitHub", systemImage: "arrow.up.right.square")
                }
            }
            .buttonStyle(.bordered).controlSize(.large).tint(Stage.accent)
            Spacer()
            HoldBar(progress: progress)
        }
        .padding(.horizontal, 72).padding(.vertical, 40)
        .frame(maxWidth: 1000, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct HoldBar: View {
    let progress: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Stage.backgroundHighlight)
                Capsule().fill(Stage.accent.opacity(0.8)).frame(width: g.size.width * progress)
            }
        }
        .frame(height: 3)
    }
}

/// The picture: a quiet gutter, Solarized code, the callout as a banner before typing starts.
struct CodeStage: View {
    let frame: FilmFrame
    let shot: FilmShot
    let showCallout: Bool

    var body: some View {
        let lang = CodeLanguage.detect(path: shot.hunk.file)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(shot.hunk.file).font(.system(size: 12, design: .monospaced)).foregroundStyle(Stage.gutter).lineLimit(1).truncationMode(.head)
                Spacer()
                Text(frame.caption == "Writing" || showCallout ? "" : frame.caption).font(.caption).foregroundStyle(Stage.gutter)
            }
            .padding(.horizontal, 20).padding(.vertical, 8)
            .background(Stage.backgroundHighlight.opacity(0.6))
            if showCallout, let a = shot.hunk.annotation {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "text.bubble.fill").foregroundStyle(Stage.accent)
                    Text(a).font(.system(size: 17)).lineSpacing(3).foregroundStyle(Stage.textBright).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 20).padding(.vertical, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Stage.accent.opacity(0.12))
                .overlay(alignment: .bottom) { HoldBar(progress: frame.progress).padding(.horizontal, 20) }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(frame.lines) { line in
                            FilmLineView(line: line, language: lang, isCursor: frame.cursorLine == line.id,
                                         distance: frame.cursorLine.map { abs($0 - line.id) } ?? 0,
                                         ghost: showCallout || frame.caption == "Before").id(line.id)
                        }
                    }
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: frame.cursorLine) { _, c in
                    if let c { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(c, anchor: UnitPoint(x: 0, y: 0.6)) } }
                }
            }
            if !showCallout, let a = shot.hunk.annotation, !a.isEmpty {
                Text(a).font(.system(size: 13)).foregroundStyle(Stage.gutter).lineLimit(2)
                    .padding(.horizontal, 20).padding(.vertical, 8)
            }
        }
    }
}

struct FilmLineView: View {
    let line: FilmLine
    let language: CodeLanguage
    let isCursor: Bool
    var distance: Int = 0
    var ghost: Bool = false        // before typing starts: show what is coming, faintly

    var body: some View {
        let (bg, opacity, strike, hidden): (Color, Double, Bool, Bool) = {
            switch line.state {
            case .context: return (.clear, 1, false, false)
            case .removing(let p): return (Stage.removed.opacity(0.22 * (1 - p) + 0.04), 1 - 0.75 * p, true, false)
            case .removed: return (.clear, 0, false, true)
            case .adding(let typed): return ghost && typed == 0 ? (.clear, 0.28, false, false) : (Stage.added.opacity(0.14), 1, false, typed == 0 && !isCursor)
            case .added: return (Stage.added.opacity(0.09), 1, false, false)
            }
        }()
        if !hidden {
            HStack(alignment: .top, spacing: 0) {
                Text(line.newNumber.map(String.init) ?? line.oldNumber.map(String.init) ?? "")
                    .font(.system(size: 11, design: .monospaced)).foregroundStyle(Stage.gutter.opacity(0.8))
                    .frame(width: 40, alignment: .trailing).padding(.trailing, 14).padding(.top, 2)
                Text({ let t = ghost ? line.text : line.visibleText; return t.isEmpty ? AttributedString(" ") : SyntaxHighlighter.attributed(t, language: language, theme: .solarizedDark) }())
                    .font(.system(size: 14.5, design: .monospaced))
                    .foregroundStyle(Stage.text)
                    .strikethrough(strike, color: Stage.removed)
                    .fixedSize(horizontal: false, vertical: true)
                if isCursor, case .adding = line.state {
                    Rectangle().fill(Stage.textBright).frame(width: 2, height: 17).padding(.leading, 1)
                }
            }
            .opacity(opacity * (distance > 14 ? 0.55 : distance > 7 ? 0.8 : 1))
            .padding(.trailing, 20).padding(.vertical, 1.5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bg)
            .overlay(alignment: .leading) { if isCursor { Rectangle().fill(Stage.accent).frame(width: 3) } }
            .animation(.linear(duration: 0.1), value: line.state)
            .animation(.easeOut(duration: 0.25), value: distance > 7)
        }
    }
}

/// The strip: one segment per shot plus the transport. Everything here has a key.
struct Timeline: View {
    let player: FilmPlayer
    let chapterIndex: Int
    let chapterCount: Int

    var body: some View {
        @Bindable var player = player
        VStack(spacing: 8) {
            HStack(spacing: 3) {
                ForEach(player.film.shots) { shot in
                    let current = player.frame?.shot == shot.id
                    let done = (player.frame?.shot ?? -1) > shot.id
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Stage.backgroundHighlight)
                            Capsule().fill(Stage.accent.opacity(done ? 0.5 : 1))
                                .frame(width: geo.size.width * (done ? 1 : current ? (player.frame?.progress ?? 0) : 0))
                        }
                    }
                    .frame(height: 5)
                    .help("\(shot.hunk.file) · line \(shot.newStart)")
                    .onTapGesture { player.seek(toShot: shot.id) }
                }
            }
            HStack(spacing: 14) {
                Button { player.previousShot() } label: { Image(systemName: "backward.end.fill") }
                Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 14) }
                Button { player.nextShot() } label: { Image(systemName: "forward.end.fill") }
                Text("chapter \(chapterIndex + 1)/\(chapterCount)" + (player.film.shot(at: player.frameIndex).map { " · shot \($0.id + 1)/\(player.film.shots.count)" } ?? ""))
                    .font(.caption.monospacedDigit()).foregroundStyle(Stage.text)
                Spacer()
                Text("space · ← → shots · ↑ ↓ chapters · 1-4 pace · esc leaves the theater").font(.caption2).foregroundStyle(Stage.gutter)
                Picker("Pace", selection: $player.speed) {
                    Text("slow").tag(0.5); Text("read").tag(1.0); Text("brisk").tag(1.5); Text("skim").tag(2.5)
                }
                .pickerStyle(.segmented).labelsHidden().frame(width: 230)
                Toggle("Roll on", isOn: $player.autoAdvance).toggleStyle(.checkbox).fixedSize().foregroundStyle(Stage.text)
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Stage.textBright)
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .background(Stage.backgroundHighlight.opacity(0.5))
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
    private var generation = 0

    func load(_ film: Film) { pause(); self.film = film; frameIndex = 0 }

    func play() {
        guard !film.frames.isEmpty else { return }
        if finished { frameIndex = 0 }
        isPlaying = true
        task?.cancel()
        generation += 1
        let gen = generation
        task = Task { [weak self] in
            while let self, !Task.isCancelled, self.isPlaying, !self.finished {
                try? await Task.sleep(for: .seconds(Film.frameSeconds / self.speed))
                if Task.isCancelled { break }
                self.frameIndex += 1
            }
            // Only the clock that is still current may stop the film; a cancelled one must not.
            if let self, self.generation == gen { self.isPlaying = false }
        }
    }

    func pause() { isPlaying = false; task?.cancel(); task = nil }
    func toggle() { isPlaying ? pause() : play() }

    func seek(toFrame i: Int) {
        pause(); frameIndex = min(max(0, i), max(film.frames.count - 1, 0)); play()
    }

    func seek(toShot i: Int) {
        guard let s = film.shots[safe: i] else { return }
        let wasPlaying = isPlaying
        pause()
        frameIndex = s.firstFrame
        if wasPlaying || autoAdvance { play() }
    }

    func nextShot() {
        let cur = frame?.shot ?? -1
        if cur + 1 < film.shots.count { seek(toShot: cur + 1) } else { pause(); frameIndex = max(0, film.frames.count - 1) }
    }

    func previousShot() {
        let cur = frame?.shot ?? 0
        if cur <= 0 { pause(); frameIndex = 0; play() } else { seek(toShot: cur - 1) }
    }
}
