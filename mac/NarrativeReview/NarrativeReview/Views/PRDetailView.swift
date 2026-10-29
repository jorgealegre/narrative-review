import SwiftUI

/// A PR. In the theater the stage fills the window; details live in the inspector (⌘I).
struct PRDetailView: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    @State private var selectedChapter: Chapter.ID?
    @State private var showInspector = false
    @State private var showChapters = true

    var body: some View {
        let review = model.reviews[ref.id]
        let busy = model.progress[ref.id]
        VStack(spacing: 0) {
            topLine(review: review, busy: busy)
            Divider()
            if let review {
                HStack(spacing: 0) {
                    if showChapters {
                        ChapterRail(review: review, selection: $selectedChapter)
                            .frame(width: 300)
                            .transition(.move(edge: .leading).combined(with: .opacity))
                        Divider()
                    }
                    if let i = review.chapters.firstIndex(where: { $0.id == selectedChapter }) ?? (review.chapters.isEmpty ? nil : 0) {
                        let ch = review.chapters[i]
                        ChapterPlayerView(review: review, chapter: ch, chapterIndex: i, chapterCount: review.chapters.count,
                                          onChapterEnd: { if i + 1 < review.chapters.count { withAnimation { selectedChapter = review.chapters[i + 1].id } } },
                                          onChapterBack: { if i > 0 { withAnimation { selectedChapter = review.chapters[i - 1].id } } })
                            .id(ch.id)
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: showChapters)
            } else if let busy {
                VStack(spacing: 12) {
                    ProgressView(value: busy.fraction).frame(maxWidth: 420)
                    Text(busy.step).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("No story yet", systemImage: "book")
                } description: {
                    Text(model.errors[ref.id] ?? "Tell the story with \(model.storytellerKind.rawValue). The diff is fetched with your GitHub login.")
                } actions: {
                    Button("Tell the story") { model.tellStory(for: ref) }.buttonStyle(.borderedProminent)
                }
            }
        }
        .inspector(isPresented: $showInspector) {
            InspectorView(ref: ref, review: review).inspectorColumnWidth(min: 320, ideal: 380, max: 520)
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { withAnimation { showChapters.toggle() } } label: { Image(systemName: "sidebar.left") }
                    .keyboardShortcut("s", modifiers: [.command, .option]).help("Chapters (⌘⌥S)")
                Button { showInspector.toggle() } label: { Image(systemName: "info.circle") }
                    .keyboardShortcut("i", modifiers: .command).help("Details: threads, checks, cost (⌘I)")
            }
        }
        .navigationTitle(model.gistText[ref.id]?.sentence ?? ref.title)
        .onAppear { if let pr = model.pr(ref.id) { model.explainFailures(pr) } }
    }

    /// One line: platform, gist, people, check dots, story state. Everything else is in the inspector.
    @ViewBuilder
    private func topLine(review: NarrativeReview?, busy: StoryProgress?) -> some View {
        @Bindable var model = model
        let pr = model.pr(ref.id)
        HStack(spacing: 12) {
            PlatformBadge(repo: ref.repo)
            Text(model.gistText[ref.id]?.sentence ?? review?.title ?? ref.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
            Text("#\(ref.number) · \(ref.author)").foregroundStyle(.secondary).lineLimit(1)
            if let pr {
                CheckDots(pr: pr)
                if pr.unresolvedThreads > 0 {
                    Label("\(pr.unresolvedThreads)", systemImage: "bubble.left.fill").foregroundStyle(.orange).help("Open review threads")
                }
            }
            if let r = review, r.isDraft { Label("draft", systemImage: "pencil.line").foregroundStyle(.orange).help("On-device draft; claims may be wrong") }
            Spacer()
            Picker("", selection: $model.storytellerKind) {
                ForEach(StorytellerKind.allCases) { Text($0.rawValue).tag($0) }
            }
            .frame(width: 150)
            Button(review == nil ? "Tell the story" : "Tell it again") { model.tellStory(for: ref) }
                .disabled(busy != nil)
        }
        .font(.callout)
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}

struct CheckDots: View {
    let pr: PullRequest
    var body: some View {
        HStack(spacing: 4) {
            ForEach(pr.checks) { c in
                Circle().fill(color(c.outcome)).frame(width: 8, height: 8).help("\(c.name): \(c.outcome.rawValue)")
            }
            if pr.checks.isEmpty { Text("no checks").foregroundStyle(.tertiary) }
        }
    }
    func color(_ o: CheckItem.Outcome) -> Color {
        switch o {
        case .success: return .green
        case .failure: return .red
        case .pending: return .orange
        case .skipped, .neutral: return .gray
        }
    }
}

/// ⌘I: threads, checks, coverage, cost. Out of the way of the picture.
struct InspectorView: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    let review: NarrativeReview?

    var body: some View {
        let pr = model.pr(ref.id)
        List {
            Section("Pull request") {
                Text(ref.title).font(.callout)
                Link("Open on GitHub", destination: URL(string: ref.url)!)
                if let pr {
                    Text("+\(pr.additions) −\(pr.deletions) in \(pr.changedFiles) files · opened \(pr.ageDays) days ago")
                    let who = Array(Set(pr.requestedReviewers + pr.humanReviewers)).sorted()
                    if !who.isEmpty { Text("Reviewers: \(who.joined(separator: ", "))") }
                    if let d = pr.reviewDecision { Text("Review: \(d.replacingOccurrences(of: "_", with: " ").lowercased())") }
                    if pr.mergeStateStatus == "BEHIND" {
                        Button("Update branch from \(pr.baseRefName)") { model.updateBranch(pr) }
                        Text(model.notes[pr.id] ?? "The branch is behind its base. One click merges the base in.").font(.caption).foregroundStyle(.secondary)
                    } else if pr.mergeable == "CONFLICTING" {
                        Text("Merge conflict: must be resolved by hand.").foregroundStyle(.red)
                    }
                }
            }
            if let pr, !pr.openThreads.isEmpty {
                Section("What reviewers are waiting on") {
                    ForEach(pr.openThreads) { t in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
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
                                Circle().fill(CheckDots(pr: pr).color(c.outcome)).frame(width: 8, height: 8)
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

/// Chapter rail: numbers, titles, which one is playing.
struct ChapterRail: View {
    let review: NarrativeReview
    @Binding var selection: Chapter.ID?

    var body: some View {
        List(selection: $selection) {
            Section("Chapters") {
                ForEach(Array(review.chapters.enumerated()), id: \.element.id) { i, ch in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(i + 1)").font(.title3.monospacedDigit()).foregroundStyle(.secondary).frame(width: 22)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(ch.title).font(.body.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            Text("\(ch.hunks.count) shot\(ch.hunks.count == 1 ? "" : "s") · \(Set(ch.hunks.map(\.file)).count) file\(Set(ch.hunks.map(\.file)).count == 1 ? "" : "s")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 3)
                    .tag(ch.id)
                }
            }
        }
        .onAppear { if selection == nil { selection = review.chapters.first?.id } }
    }
}
