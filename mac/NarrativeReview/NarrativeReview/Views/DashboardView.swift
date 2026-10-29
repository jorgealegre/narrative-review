import SwiftUI

/// Home. Not a list of PRs: a list of reasons something needs you, biggest first.
struct DashboardView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                greeting
                if let err = model.inboxError {
                    Label(err, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                }
                ForEach(model.board, id: \.0) { bucket, items in
                    BucketSection(bucket: bucket, items: items)
                }
                if !model.archivedStories.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Stories you can still watch").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                        ForEach(model.archivedStories) { r in
                            Button { model.path.append(r.id) } label: {
                                HStack {
                                    Image(systemName: "book.closed.fill").foregroundStyle(Color.accentColor)
                                    Text(r.title)
                                    Spacer()
                                    Text("\(r.prInfo.repo) #\(r.prInfo.number) · \(r.chapters.count) chapters").foregroundStyle(.secondary)
                                }
                                .padding(12).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, 36).padding(.vertical, 28)
            .frame(maxWidth: 1100, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Narrative Review")
        .overlay {
            if model.prs.isEmpty && model.isLoadingInbox { ProgressView("Asking GitHub…") }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 6) {
            let hour = Calendar.current.component(.hour, from: Date())
            let name = model.viewerLogin ?? "there"
            Text("\(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"), \(name).")
                .font(.system(size: 30, weight: .bold))
            if model.prs.isEmpty && model.lastRefreshed == nil {
                Text("Loading your pull requests…").font(.title3).foregroundStyle(.secondary)
            } else if model.prs.isEmpty {
                Text("No open PRs involve you in \(model.inboxScope.isEmpty ? "any repo" : model.inboxScope). Enjoy it.").font(.title3).foregroundStyle(.secondary)
            } else {
                Text(model.needsYouCount == 0 ? "Nothing needs you right now. \(model.prs.count) open PRs involve you."
                     : "\(model.needsYouCount) thing\(model.needsYouCount == 1 ? "" : "s") need\(model.needsYouCount == 1 ? "s" : "") you, out of \(model.prs.count) open PRs that involve you.")
                    .font(.title3).foregroundStyle(.secondary)
            }
        }
    }
}

struct BucketSection: View {
    let bucket: Attention
    let items: [TriagedPR]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: bucket.symbol).foregroundStyle(tint)
                Text(bucket.rawValue).font(.title3.weight(.semibold))
                Text("\(items.count)").font(.callout.monospacedDigit()).foregroundStyle(.secondary)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(.quaternary, in: Capsule())
            }
            if bucket == .watching || bucket == .drafts {
                ForEach(items) { t in CompactPRRow(triaged: t) }
            } else {
                ForEach(items) { t in PRCard(triaged: t, tint: tint) }
            }
        }
    }

    private var tint: Color {
        switch bucket {
        case .readyToMerge: return .green
        case .fixChecks: return .red
        case .answerReviewer, .youBlockThem: return .orange
        case .reviewRequested: return .blue
        case .yoursInReview: return .secondary
        case .watching, .drafts: return .gray
        }
    }
}

/// One line per PR for the quiet buckets, so the ten things you already approved do not bury the three that need you.
struct CompactPRRow: View {
    @Environment(AppModel.self) private var model
    let triaged: TriagedPR

    var body: some View {
        let pr = triaged.pr
        Button { model.path.append(pr.id) } label: {
            HStack(spacing: 10) {
                PlatformBadge(repo: pr.repo, compact: true)
                Text(model.gistText[pr.id]?.sentence ?? pr.title).lineLimit(1)
                Spacer()
                Text("\(pr.author) · \(pr.repo) #\(pr.number)").foregroundStyle(.secondary).lineLimit(1)
                Text(PRCard.relative(pr.updatedAt)).foregroundStyle(.tertiary).frame(width: 70, alignment: .trailing)
            }
            .font(.callout)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

struct PRCard: View {
    @Environment(AppModel.self) private var model
    let triaged: TriagedPR
    let tint: Color

    var body: some View {
        let pr = triaged.pr
        let gist = model.gistText[pr.id]
        let story = model.reviews[pr.id]
        let busy = model.progress[pr.id]
        Button { model.path.append(pr.id) } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(gist?.sentence ?? pr.title)
                        .font(.system(size: 17, weight: .semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(triaged.reason).font(.callout).foregroundStyle(tint)
                    HStack(spacing: 10) {
                        PlatformBadge(repo: pr.repo)
                        Text("#\(pr.number)")
                        Text("·").foregroundStyle(.tertiary)
                        people(pr)
                        if gist == nil { Text("· \(pr.title)").lineLimit(1) }
                        Spacer(minLength: 0)
                    }
                    .font(.callout).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 6) {
                    checks(pr)
                    HStack(spacing: 6) {
                        heat(pr.heat)
                        if let story {
                            Label(story.isDraft ? "draft · watch \(max(1, story.estimatedWatchSeconds / 60)) min" : "watch \(max(1, story.estimatedWatchSeconds / 60)) min",
                                  systemImage: "play.circle.fill").foregroundStyle(Color.accentColor)
                        } else if let busy {
                            Label(busy.step == "Queued" ? "queued" : "writing…", systemImage: "hourglass")
                        } else {
                            Label("no story yet", systemImage: "book.closed").foregroundStyle(.tertiary)
                        }
                    }
                    .font(.caption)
                    Text(Self.relative(pr.updatedAt)).font(.caption).foregroundStyle(.tertiary)
                }
            }
            .padding(14)
            .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tint.opacity(0.35), lineWidth: 1))
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2).fill(Platform.of(repo: pr.repo).color).frame(width: 4).padding(.vertical, 10).padding(.leading, 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func people(_ pr: PullRequest) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "person.fill")
            Text(pr.author)
            let others = Array(Set(pr.requestedReviewers + pr.humanReviewers)).sorted().prefix(3)
            if !others.isEmpty {
                Image(systemName: "arrow.right").foregroundStyle(.tertiary)
                Text(others.joined(separator: ", "))
            }
        }
    }

    @ViewBuilder
    private func checks(_ pr: PullRequest) -> some View {
        let failed = pr.failedChecks.count, pending = pr.pendingChecks.count, total = pr.checks.count
        if total == 0 {
            Text("no checks").font(.caption).foregroundStyle(.tertiary)
        } else if failed > 0 {
            Label("\(failed) of \(total) checks red", systemImage: "xmark.circle.fill").font(.caption).foregroundStyle(.red)
        } else if pending > 0 {
            Label("\(pending) checks running", systemImage: "circle.dotted").font(.caption).foregroundStyle(.orange)
        } else {
            Label("checks green", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.green)
        }
    }

    @ViewBuilder
    private func heat(_ h: PullRequest.Heat) -> some View {
        switch h {
        case .feather: Label("quiet", systemImage: "leaf").foregroundStyle(.secondary)
        case .warm: Label("some back and forth", systemImage: "flame").foregroundStyle(.orange)
        case .spicy: Label("spicy", systemImage: "flame.fill").foregroundStyle(.red)
        }
    }

    static func relative(_ d: Date) -> String {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short
        return f.localizedString(for: d, relativeTo: Date())
    }
}
