import SwiftUI

struct PRDetailView: View {
    @Environment(AppModel.self) private var model
    let ref: PRRef
    @State private var selectedChapter: Chapter.ID?

    var body: some View {
        let review = model.reviews[ref.id]
        let busy = model.progress[ref.id]
        VStack(spacing: 0) {
            header(review: review, busy: busy)
            Divider()
            if let review {
                HSplitView {
                    ChapterListView(review: review, selection: $selectedChapter)
                        .frame(minWidth: 300, idealWidth: 380, maxWidth: 460)
                    if let ch = review.chapters.first(where: { $0.id == selectedChapter }) ?? review.chapters.first {
                        ChapterPlayerView(review: review, chapter: ch, onChapterEnd: {
                            if let i = review.chapters.firstIndex(where: { $0.id == ch.id }), i + 1 < review.chapters.count {
                                withAnimation { selectedChapter = review.chapters[i + 1].id }
                            }
                        })
                        .id(ch.id)
                        .frame(minWidth: 520)
                    }
                }
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
        .navigationTitle(model.gistText[ref.id]?.sentence ?? ref.title)
        .onAppear { if let pr = model.pr(ref.id) { model.explainFailures(pr) } }
    }

    @ViewBuilder
    private func header(review: NarrativeReview?, busy: StoryProgress?) -> some View {
        @Bindable var model = model
        let pr = model.pr(ref.id)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.gistText[ref.id]?.sentence ?? review?.title ?? ref.title)
                        .font(.system(size: 22, weight: .bold)).fixedSize(horizontal: false, vertical: true)
                    Text(ref.title).font(.callout).foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        PlatformBadge(repo: ref.repo)
                        Link("#\(ref.number)", destination: URL(string: ref.url)!)
                        Text("by \(ref.author)")
                        if let pr {
                            let who = Array(Set(pr.requestedReviewers + pr.humanReviewers)).sorted()
                            if !who.isEmpty { Text("reviewers: \(who.joined(separator: ", "))") }
                            Text("+\(pr.additions) −\(pr.deletions) in \(pr.changedFiles) files")
                        } else if let r = review {
                            Text("+\(r.prInfo.additions) −\(r.prInfo.deletions) in \(r.prInfo.changedFiles) files")
                        }
                    }
                    .font(.callout).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 24)
                Picker("", selection: $model.storytellerKind) {
                    ForEach(StorytellerKind.allCases) { Text($0.rawValue).tag($0) }
                }
                .frame(width: 170)
                Button(review == nil ? "Tell the story" : "Tell it again") { model.tellStory(for: ref) }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy != nil)
            }
            if let pr {
                ChecksRow(pr: pr)
                if !pr.openThreads.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("What reviewers are waiting on").font(.callout.weight(.semibold)).foregroundStyle(.orange)
                        ForEach(pr.openThreads) { t in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "bubble.left.fill").foregroundStyle(.orange).font(.caption)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(t.author).font(.callout.weight(.medium))
                                        if let path = t.path { Text("\(path.split(separator: "/").last.map(String.init) ?? path)\(t.line.map { ":\($0)" } ?? "")").font(.caption.monospaced()).foregroundStyle(.secondary) }
                                        if let c = t.createdAt { Text(PRCard.relative(c)).font(.caption).foregroundStyle(.tertiary) }
                                    }
                                    Text(t.body.prefix(400)).font(.callout).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
            }
            if let r = review {
                HStack(spacing: 8) {
                    Label(r.coverage.isComplete ? "every hunk placed in a chapter" : "\(r.coverage.uncoveredHunks.count) hunks the storyteller did not place",
                          systemImage: r.coverage.isComplete ? "checkmark.circle" : "questionmark.circle")
                        .foregroundStyle(r.coverage.isComplete ? .green : .orange)
                    if r.isDraft {
                        Label("draft by the on-device model: grouping is useful, claims may be wrong", systemImage: "pencil.line").foregroundStyle(.orange)
                    } else {
                        Text(r.metrics.map { "· told by \($0.model)" } ?? "· imported story")
                    }
                    if let m = r.metrics, m.cost > 0 { Text(String(format: "· $%.3f", m.cost)) }
                    if model.isStale(pr ?? PullRequest.placeholder) , pr != nil { Text("· new commits since this story").foregroundStyle(.orange) }
                }
                .font(.callout).foregroundStyle(.secondary)
            }
        }
        .padding(16)
    }
}

/// Checks on the head commit, with a one-line on-device explanation for each red one.
struct ChecksRow: View {
    @Environment(AppModel.self) private var model
    let pr: PullRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if pr.checks.isEmpty {
                Text("No checks on this commit.").font(.callout).foregroundStyle(.tertiary)
            } else {
                HStack(spacing: 6) {
                    ForEach(pr.checks) { c in
                        Circle().fill(color(c.outcome)).frame(width: 9, height: 9).help("\(c.name): \(c.outcome.rawValue)")
                    }
                    Text("\(pr.checks.count) checks · \(pr.failedChecks.count) red · \(pr.pendingChecks.count) running")
                        .font(.callout).foregroundStyle(.secondary)
                    if pr.unresolvedThreads > 0 {
                        Text("· \(pr.unresolvedThreads) open review thread\(pr.unresolvedThreads == 1 ? "" : "s")").font(.callout).foregroundStyle(.orange)
                    }
                }
                ForEach(pr.failedChecks) { c in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "xmark.octagon.fill").foregroundStyle(.red)
                        VStack(alignment: .leading, spacing: 2) {
                            if let url = c.url, let u = URL(string: url) { Link(c.name, destination: u).font(.callout.weight(.medium)) }
                            else { Text(c.name).font(.callout.weight(.medium)) }
                            Text(model.failureNotes["\(pr.id)|\(c.name)"] ?? "Reading the failure…")
                                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    private func color(_ o: CheckItem.Outcome) -> Color {
        switch o {
        case .success: return .green
        case .failure: return .red
        case .pending: return .orange
        case .skipped, .neutral: return .gray
        }
    }
}

extension PullRequest {
    static let placeholder = PullRequest(owner: "", repo: "", number: 0, title: "", body: "", url: "", author: "", isDraft: false,
                                         createdAt: .distantPast, updatedAt: .distantPast, additions: 0, deletions: 0, changedFiles: 0,
                                         reviewDecision: nil, mergeable: nil, labels: [], requestedReviewers: [], latestReviews: [],
                                         reviewCount: 0, commentCount: 0, threadCount: 0, openThreads: [], headSha: "",
                                         headCommittedAt: nil, checksState: nil, checks: [])
}

struct ChapterListView: View {
    let review: NarrativeReview
    @Binding var selection: Chapter.ID?

    var body: some View {
        List(selection: $selection) {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(review.summary).font(.body).fixedSize(horizontal: false, vertical: true)
                    Label(review.rootCause, systemImage: "arrow.down.to.line").font(.callout).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 4)
            }
            Section("Chapters") {
                ForEach(Array(review.chapters.enumerated()), id: \.element.id) { i, ch in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(i + 1)").font(.title3.monospacedDigit()).foregroundStyle(.secondary).frame(width: 22)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(ch.title).font(.body.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            Text("\(ch.hunks.count) hunk\(ch.hunks.count == 1 ? "" : "s") · \(Set(ch.hunks.map(\.file)).count) file\(Set(ch.hunks.map(\.file)).count == 1 ? "" : "s")")
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
