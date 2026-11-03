import SwiftUI

/// Home: a board. One column per kind of attention, biggest first. Cards tell you the state of the PR
/// without opening it: the gist, why it is here, what happened in the conversation, who is waiting.
struct DashboardView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 0) {
            header
            if let err = model.inboxError {
                Label(err, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.warn).padding(.horizontal, 28).padding(.bottom, 8)
            }
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(model.columns, id: \.title) { col in
                        BoardColumn(column: col)
                    }
                    if !model.archivedStories.isEmpty { archivedColumn }
                }
                .padding(.horizontal, 28)
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity)
        }
        .background(Theme.background)
        .navigationTitle("Narrative Review")
        .overlay {
            if model.prs.isEmpty && model.lastRefreshed == nil { ProgressView("Asking GitHub…").tint(Theme.accent) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    let hour = Calendar.current.component(.hour, from: Date())
                    Text("\(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"), \(model.viewerLogin ?? "there").")
                        .font(Theme.display(30)).foregroundStyle(Theme.text)
                    Text(subtitle).font(.title3).foregroundStyle(Theme.muted)
                }
                Spacer()
            }
            HStack(spacing: 8) {
                FilterChip(title: "All", count: model.prs.count, color: Theme.muted, selected: model.platformFilter == nil) { model.platformFilter = nil }
                ForEach(model.platformsPresent, id: \.self) { p in
                    FilterChip(title: p.name, count: model.prs.filter { Platform.of(repo: $0.repo) == p }.count, color: p.color,
                               symbol: p.symbol, selected: model.platformFilter == p) { model.platformFilter = model.platformFilter == p ? nil : p }
                }
                Spacer()
                Text("⌘1-\(min(model.platformsPresent.count + 1, 7)) filter · ↵ open · ⌥↑↓ walk the queue").font(.caption).foregroundStyle(Theme.faint)
            }
        }
        .padding(.horizontal, 28).padding(.top, 22).padding(.bottom, 18)
    }

    private var subtitle: String {
        if model.prs.isEmpty && model.lastRefreshed == nil { return "Loading your pull requests…" }
        if model.prs.isEmpty { return "No open PRs involve you. Enjoy it." }
        let n = model.needsYouCount
        return n == 0 ? "Nothing needs you right now. \(model.prs.count) open PRs involve you."
                      : "\(n) thing\(n == 1 ? "" : "s") need\(n == 1 ? "s" : "") you, out of \(model.prs.count) open PRs that involve you."
    }

    private var archivedColumn: some View {
        ScrollView(.vertical) { VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "film.stack").foregroundStyle(Theme.faint)
                Text("Still watchable").font(Theme.headline(15)).foregroundStyle(Theme.muted)
            }
            ForEach(model.archivedStories) { r in
                Button { model.path.append(r.id) } label: {
                    HStack(spacing: 10) {
                        PlatformBadge(repo: r.prInfo.repo, compact: true)
                        Text(r.title).font(.callout).foregroundStyle(Theme.text).lineLimit(2)
                        Spacer()
                        Text("\(max(1, r.estimatedWatchSeconds / 60)) min").font(.caption).foregroundStyle(Theme.faint)
                    }
                    .padding(12).background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
        } }
        .scrollIndicators(.hidden)
        .frame(width: 300)
    }
}

struct FilterChip: View {
    let title: String
    let count: Int
    let color: Color
    var symbol: String? = nil
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).font(.system(size: 11, weight: .semibold)) }
                Text(title).font(.callout.weight(.medium))
                Text("\(count)").font(.caption.monospacedDigit()).opacity(0.7)
            }
            .foregroundStyle(selected ? Theme.background : color)
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(selected ? color : color.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct BoardColumn: View {
    let column: BoardColumnModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: column.symbol).foregroundStyle(column.color)
                Text(column.title).font(Theme.headline(15)).foregroundStyle(Theme.text)
                Text("\(column.items.count)").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(Theme.elevated, in: Capsule())
                Spacer()
            }
            .padding(.horizontal, 4)
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 10) {
                    if column.items.isEmpty {
                        Text(column.emptyText).font(.callout).foregroundStyle(Theme.faint).padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.surface.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                    }
                    ForEach(column.items) { t in BoardCard(triaged: t, tint: column.color, compact: column.compact) }
                }
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
        }
        .frame(width: column.compact ? 300 : 380)
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

struct BoardCard: View {
    @Environment(AppModel.self) private var model
    let triaged: TriagedPR
    let tint: Color
    var compact = false

    var body: some View {
        let pr = triaged.pr
        let gist = model.gistText[pr.id]
        let story = model.reviews[pr.id]
        let busy = model.progress[pr.id]
        let brief = model.briefs[pr.id]
        let waitingOn = Array(Set(pr.requestedReviewers + pr.humanReviewers)).sorted()
        Button { model.path.append(pr.id) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    PlatformBadge(repo: pr.repo, compact: true)
                    Text("#\(pr.number)").font(.caption.monospacedDigit()).foregroundStyle(Theme.faint)
                    Spacer()
                    Text(PRCardTime.relative(pr.updatedAt)).font(.caption).foregroundStyle(Theme.faint)
                }
                Text(gist?.sentence ?? pr.title)
                    .font(Theme.headline(compact ? 14 : 16)).foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true).lineLimit(3)
                if !compact || triaged.attention != .watching {
                    Text(triaged.reason).font(.callout).foregroundStyle(tint).fixedSize(horizontal: false, vertical: true)
                }
                if !compact, let brief, !brief.summary.isEmpty {
                    Text(brief.summary).font(.callout).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineLimit(4)
                    if let ask = brief.asks.first {
                        Label(ask, systemImage: "hand.point.right.fill").font(.callout).foregroundStyle(Theme.warn).fixedSize(horizontal: false, vertical: true).lineLimit(2)
                    }
                }
                if !compact, pr.mergeStateStatus == "BEHIND", pr.author == model.viewerLogin {
                    HStack(spacing: 8) {
                        Button("Update branch") { model.updateBranch(pr) }.buttonStyle(.bordered).controlSize(.small)
                        if let n = model.notes[pr.id] { Text(n).font(.caption).foregroundStyle(Theme.muted) }
                    }
                }
                if !compact, let note = pr.failedChecks.first.flatMap({ model.failureNotes["\(pr.id)|\($0.name)"] }) {
                    Label(note, systemImage: "lightbulb").font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                }
                HStack(spacing: 8) {
                    PeopleRow(author: pr.author, others: waitingOn, size: 20)
                    Spacer()
                    ChecksPill(pr: pr)
                }
                HStack(spacing: 8) {
                    if let brief { FrictionPill(friction: brief.friction, why: compact ? "" : brief.frictionWhy) }
                    Spacer()
                    if let story {
                        Label(story.isDraft ? "draft · \(max(1, story.estimatedWatchSeconds / 60)) min" : "watch \(max(1, story.estimatedWatchSeconds / 60)) min",
                              systemImage: "play.circle.fill").font(.caption).foregroundStyle(Theme.accent)
                    } else if let busy {
                        Label(busy.step == "Queued" ? "queued" : "writing the story…", systemImage: "hourglass").font(.caption).foregroundStyle(Theme.muted)
                    } else {
                        Label("story on open", systemImage: "play.circle").font(.caption).foregroundStyle(Theme.faint)
                    }
                }
            }
            .padding(14)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.line, lineWidth: 1))
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2).fill(Platform.of(repo: pr.repo).color).frame(width: 3).padding(.vertical, 12).padding(.leading, 1)
            }
        }
        .buttonStyle(.plain)
        .task(id: pr.updatedAt) { if !pr.failedChecks.isEmpty { model.explainFailures(pr) } }
    }
}

enum PRCardTime {
    static func relative(_ d: Date) -> String {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short
        return f.localizedString(for: d, relativeTo: Date())
    }
}
