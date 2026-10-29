import SwiftUI

/// Always visible: who you are, which brain is on, what it costs.
struct StatusBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 14) {
            Label(model.viewerLogin.map { "GitHub: \($0)" } ?? "GitHub: not signed in", systemImage: "person.crop.circle")
            Divider().frame(height: 14)
            HStack(spacing: 5) {
                Circle().fill(brainColor).frame(width: 7, height: 7)
                Text(brainText)
            }
            if let t = model.lastRefreshed {
                Divider().frame(height: 14)
                Text(model.isLoadingInbox ? "Checking GitHub…" : "GitHub checked \(Date().timeIntervalSince(t) < 60 ? "just now" : PRCard.relative(t)), every \(model.pollMinutes) min")
            }
            if let (id, p) = model.progress.first(where: { $0.value.step != "Queued" }) ?? model.progress.first {
                Divider().frame(height: 14)
                ProgressView(value: p.fraction).frame(width: 90)
                Text("\(id.split(separator: "/").last ?? ""): \(p.step)").lineLimit(1)
                if model.progress.count > 1 { Text("+\(model.progress.count - 1) queued") }
            }
            Spacer()
            let month = model.ledger.totalThisMonth
            Text(String(format: "Spent today $%.3f · this month $%.2f of $%.0f", model.ledger.totalToday, month, model.monthlyBudget))
                .monospacedDigit()
                .foregroundStyle(month >= model.monthlyBudget ? .red : month >= model.monthlyBudget * 0.8 ? .orange : .secondary)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }

    private var brainColor: Color {
        switch model.storytellerKind {
        case .apple: return model.appleAvailable ? .green : .red
        case .claude: return (Keychain.read("anthropic") ?? "").isEmpty ? .red : .green
        }
    }

    private var brainText: String {
        switch model.storytellerKind {
        case .apple: return model.appleAvailable ? "Apple on-device, free" : "Apple on-device unavailable (turn on Apple Intelligence)"
        case .claude: return (Keychain.read("anthropic") ?? "").isEmpty ? "Claude: no API key (Settings)" : "Claude \(ClaudeModel.named(model.claudeModelID).name)"
        }
    }
}
