import SwiftUI

/// A PR is a screening. Open it and the story is told and played; nothing to press.
/// Marquee on top, the stage in the middle, the chapter strip below, details in ⌘I.
struct PRDetailView: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    @State private var showInspector = false
    @State private var replayToken = 0
    private var selectedChapter: Chapter.ID? { model.selectedChapterID }

    var body: some View {
        let review = model.reviews[ref.id]
        let busy = model.progress[ref.id]
        VStack(spacing: 0) {
            Marquee(ref: ref, review: review)
            if let review, !review.chapters.isEmpty {
                let i = review.chapters.firstIndex { $0.id == selectedChapter } ?? 0
                let ch = review.chapters[i]
                ZStack {
                    ChapterPlayerView(review: review, chapter: ch, chapterIndex: i, chapterCount: review.chapters.count,
                                      onChapterEnd: { if i + 1 < review.chapters.count { select(review.chapters[i + 1].id) } },
                                      onChapterBack: { if i > 0 { select(review.chapters[i - 1].id) } },
                                      onReplay: { select(review.chapters[0].id, replay: true) },
                                      onNextPR: { model.stepQueue(1) })
                        .id(ch.id + (replayToken == 0 ? "" : "-\(replayToken)"))
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                                removal: .move(edge: .leading).combined(with: .opacity)))
                }
                .clipped()
                ChapterStrip(review: review, current: i, progress: model.chapterProgress) { select($0) }
            } else if let busy {
                WritingScreen(ref: ref, progress: busy)
            } else if let err = model.errors[ref.id] {
                ContentUnavailableView {
                    Label("The story could not be told", systemImage: "exclamationmark.triangle")
                } description: { Text(err) } actions: {
                    Button("Try again") { model.tellStory(for: ref) }.buttonStyle(.borderedProminent)
                }
                .frame(maxHeight: .infinity)
            } else {
                WritingScreen(ref: ref, progress: StoryProgress(step: "Starting", fraction: 0))
            }
        }
        .background(Theme.background)
        .sheet(isPresented: $showInspector) {
            InspectorView(ref: ref, review: review).frame(width: 420, height: 640)
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Menu {
                    Button("Tell it again with \(model.storytellerKind.rawValue)") { model.tellStory(for: ref) }.disabled(busy != nil)
                    Picker("Brain", selection: Bindable(model).storytellerKind) {
                        ForEach(StorytellerKind.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Divider()
                    Link("Open on GitHub", destination: URL(string: ref.url)!)
                } label: { Image(systemName: "ellipsis.circle") }
                Button { showInspector.toggle() } label: { Image(systemName: "info.circle") }
                    .keyboardShortcut("i", modifiers: .command).help("Threads, checks, cost (⌘I)")
            }
        }
        .navigationTitle(model.gistText[ref.id]?.sentence ?? ref.title)
        .onAppear {
            model.openStoryIfNeeded(ref)
            if let pr = model.pr(ref.id) { model.explainFailures(pr) }
        }
        .onKeyPress(.escape) { model.path = []; return .handled }
    }

    private func select(_ id: Chapter.ID, replay: Bool = false) {
        withAnimation(.easeInOut(duration: 0.45)) { model.selectedChapterID = id; if replay { replayToken += 1 } }
    }
}

/// One line that says everything about the PR before the film starts.
struct Marquee: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    let review: NarrativeReview?

    var body: some View {
        let pr = model.pr(ref.id)
        let brief = model.briefs[ref.id]
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                PlatformBadge(repo: ref.repo)
                Text(model.gistText[ref.id]?.sentence ?? review?.title ?? ref.title)
                    .font(Theme.headline(18)).foregroundStyle(Theme.text).lineLimit(2)
                Spacer(minLength: 8)
                if let pr {
                    PeopleRow(author: pr.author, others: Array(Set(pr.requestedReviewers + pr.humanReviewers)).sorted())
                } else {
                    Avatar(login: ref.author)
                }
            }
            HStack(spacing: 8) {
                Text("#\(ref.number) · \(ref.title)").font(.callout).foregroundStyle(Theme.muted).lineLimit(1)
                Spacer(minLength: 8)
                if let pr {
                    if pr.unresolvedThreads > 0 {
                        Label("\(pr.unresolvedThreads) open thread\(pr.unresolvedThreads == 1 ? "" : "s")", systemImage: "bubble.left.fill")
                            .font(.caption.weight(.medium)).foregroundStyle(Theme.warn)
                            .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.warn.opacity(0.12), in: Capsule())
                    }
                    if let brief { FrictionPill(friction: brief.friction, why: brief.frictionWhy) }
                    ChecksPill(pr: pr)
                }
                if let r = review, r.isDraft {
                    Label("draft story", systemImage: "pencil.line").font(.caption.weight(.medium)).foregroundStyle(Theme.warn)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.warn.opacity(0.12), in: Capsule())
                        .help("Told by the on-device model: the grouping helps, the claims may be wrong")
                }
            }
            if let brief, !brief.summary.isEmpty {
                Text(brief.summary).font(.callout).foregroundStyle(Theme.muted).lineLimit(2)
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(Theme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}

/// While the story is written: the gist, the brain, and progress. Still feels like the lights dimming.
struct WritingScreen: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    let progress: StoryProgress

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "film").font(.system(size: 44, weight: .light)).foregroundStyle(Stage.accent)
            Text("Writing the story").font(Theme.display(26)).foregroundStyle(Stage.textBright)
            Text(model.storytellerKind == .apple ? "On this Mac, free. A few seconds per hunk." : "With \(ClaudeModel.named(model.claudeModelID).name).")
                .font(.callout).foregroundStyle(Stage.text)
            ProgressView(value: progress.fraction).tint(Stage.accent).frame(width: 360)
            Text(progress.step).font(.callout.monospacedDigit()).foregroundStyle(Stage.gutter)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Stage.background)
    }
}

/// The chapters as a strip of scenes under the stage. The current one is lit; click or ↑↓ to move.
struct ChapterStrip: View {
    let review: NarrativeReview
    let current: Int
    var progress: Double = 0
    let select: (Chapter.ID) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Array(review.chapters.enumerated()), id: \.element.id) { i, ch in
                        Button { select(ch.id) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                HStack(spacing: 6) {
                                    Text("\(i + 1)").font(.caption.monospacedDigit().weight(.bold))
                                        .foregroundStyle(i == current ? Theme.background : Theme.muted)
                                        .frame(width: 18, height: 18)
                                        .background(i == current ? Theme.accent : Theme.elevated, in: Circle())
                                    Text("\(ch.hunks.count) shot\(ch.hunks.count == 1 ? "" : "s")").font(.caption2).foregroundStyle(Theme.faint)
                                    if i < current { Image(systemName: "checkmark").font(.caption2).foregroundStyle(Theme.good) }
                                }
                                Text(ch.title).font(.callout.weight(i == current ? .semibold : .regular))
                                    .foregroundStyle(i == current ? Theme.text : Theme.muted)
                                    .lineLimit(2).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(10)
                            .frame(width: 220, alignment: .topLeading)
                            .background(i == current ? Theme.elevated : Theme.surface, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(i == current ? Theme.accent.opacity(0.6) : Theme.line, lineWidth: 1))
                            .overlay(alignment: .bottomLeading) {
                                if i == current {
                                    GeometryReader { g in
                                        Capsule().fill(Theme.accent).frame(width: max(0, g.size.width * progress), height: 3)
                                            .frame(maxHeight: .infinity, alignment: .bottom)
                                    }
                                    .padding(.horizontal, 8).padding(.bottom, 5)
                                }
                            }
                            .scaleEffect(i == current ? 1.0 : 0.97)
                            .animation(.spring(duration: 0.35), value: current)
                        }
                        .buttonStyle(.plain)
                        .id(ch.id)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .scrollIndicators(.hidden)
            .background(Theme.surface)
            .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
            .onChange(of: current) { _, i in
                withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(review.chapters[i].id, anchor: .center) }
            }
        }
        .frame(height: 92)
    }
}

/// ⌘I: threads, checks, coverage, cost.
struct InspectorView: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    let review: NarrativeReview?

    var body: some View {
        let pr = model.pr(ref.id)
        let brief = model.briefs[ref.id]
        List {
            Section("Pull request") {
                Text(ref.title).font(.callout)
                Link("Open on GitHub", destination: URL(string: ref.url)!)
                if let pr {
                    Text("+\(pr.additions) −\(pr.deletions) in \(pr.changedFiles) files · opened \(pr.ageDays) days ago")
                    if let d = pr.reviewDecision { Text("Review: \(d.replacingOccurrences(of: "_", with: " ").lowercased())") }
                    if pr.mergeStateStatus == "BEHIND" {
                        Button("Update branch from \(pr.baseRefName)") { model.updateBranch(pr) }
                        Text(model.notes[pr.id] ?? "The branch is behind its base. One click merges the base in.").font(.caption).foregroundStyle(.secondary)
                    } else if pr.mergeable == "CONFLICTING" {
                        Text("Merge conflict: must be resolved by hand.").foregroundStyle(.red)
                    }
                }
            }
            if let brief {
                Section("Conversation") {
                    Text(brief.summary).font(.callout)
                    Text(brief.lastEvent).font(.caption).foregroundStyle(.secondary)
                    ForEach(brief.asks, id: \.self) { Label($0, systemImage: "hand.point.right.fill").font(.callout) }
                }
            }
            if let pr, !pr.openThreads.isEmpty {
                Section("Open review threads") {
                    ForEach(pr.openThreads) { t in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Avatar(login: t.author, size: 16)
                                Text(t.author).font(.callout.weight(.medium))
                                if let path = t.path { Text("\(path.split(separator: "/").last.map(String.init) ?? path)\(t.line.map { ":\($0)" } ?? "")").font(.caption.monospaced()).foregroundStyle(.secondary) }
                            }
                            Text(t.body.prefix(500)).font(.callout).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if let pr, !pr.checks.isEmpty {
                Section("Checks") {
                    ForEach(pr.checks) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Image(systemName: c.outcome == .success ? "checkmark.circle.fill" : c.outcome == .failure ? "xmark.circle.fill" : "circle.dotted")
                                    .foregroundStyle(c.outcome == .success ? Theme.good : c.outcome == .failure ? Theme.bad : Theme.warn)
                                if let u = c.url, let url = URL(string: u) { Link(c.name, destination: url) } else { Text(c.name) }
                            }
                            if c.outcome == .failure {
                                Text(model.failureNotes["\(pr.id)|\(c.name)"] ?? "Reading the failure…").font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            if let r = review {
                Section("Story") {
                    Text(r.summary).font(.callout)
                    Label(r.rootCause, systemImage: "arrow.down.to.line").font(.callout)
                    Text(r.coverage.isComplete ? "Every hunk placed in a chapter" : "\(r.coverage.uncoveredHunks.count) hunks not placed")
                        .foregroundStyle(r.coverage.isComplete ? .green : .orange)
                    if let m = r.metrics {
                        Text(m.cost > 0 ? String(format: "%@ · $%.3f · %d s", m.model, m.cost, m.durationMs / 1000) : "\(m.model) · free · \(m.durationMs / 1000) s")
                    }
                    Text("Watch time about \(max(1, r.estimatedWatchSeconds / 60)) min")
                }
            }
        }
    }
}
