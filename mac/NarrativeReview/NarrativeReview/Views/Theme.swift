import SwiftUI

/// One palette for the whole app: a dark, warm room with the stage (Solarized) as the brightest thing in it.
enum Theme {
    static let background = Color(red: 0.071, green: 0.071, blue: 0.082)      // #121215
    static let surface = Color(red: 0.106, green: 0.106, blue: 0.122)         // #1b1b1f
    static let elevated = Color(red: 0.137, green: 0.137, blue: 0.161)        // #232329
    static let line = Color.white.opacity(0.07)
    static let text = Color(red: 0.93, green: 0.93, blue: 0.95)
    static let muted = Color(red: 0.62, green: 0.62, blue: 0.68)
    static let faint = Color(red: 0.42, green: 0.42, blue: 0.48)
    static let accent = Color(red: 0.55, green: 0.56, blue: 0.95)              // violet
    static let good = Color(red: 0.40, green: 0.80, blue: 0.52)
    static let warn = Color(red: 0.98, green: 0.70, blue: 0.30)
    static let bad = Color(red: 0.95, green: 0.38, blue: 0.38)

    static func headline(_ size: CGFloat = 17) -> Font { .system(size: size, weight: .semibold, design: .rounded) }
    static func display(_ size: CGFloat = 30) -> Font { .system(size: size, weight: .bold, design: .rounded) }
}

/// A GitHub avatar, round, with the login as a fallback initial. No API call: github.com serves it.
struct Avatar: View {
    let login: String
    var size: CGFloat = 22

    var body: some View {
        AsyncImage(url: URL(string: "https://github.com/\(login).png?size=\(Int(size * 2))")) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else { ZStack { Theme.elevated; Text(login.prefix(1).uppercased()).font(.system(size: size * 0.5, weight: .semibold)).foregroundStyle(Theme.muted) } }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.line, lineWidth: 1))
        .help(login)
    }
}

/// Author on the left, the people the PR waits on stacked on the right.
struct PeopleRow: View {
    let author: String
    let others: [String]
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: 6) {
            Avatar(login: author, size: size)
            if !others.isEmpty {
                Image(systemName: "arrow.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.faint)
                HStack(spacing: -6) {
                    ForEach(others.prefix(4), id: \.self) { Avatar(login: $0, size: size) }
                }
                if others.count > 4 { Text("+\(others.count - 4)").font(.caption2).foregroundStyle(Theme.faint) }
            }
        }
    }
}

/// One pill that says what the checks mean, instead of a row of dots.
struct ChecksPill: View {
    let pr: PullRequest

    var body: some View {
        let failed = pr.failedChecks, pending = pr.pendingChecks
        let (text, color, symbol): (String, Color, String) = {
            if pr.checks.isEmpty { return ("no checks", Theme.faint, "minus.circle") }
            if let f = failed.first { return (failed.count == 1 ? "\(f.name) failing" : "\(failed.count) checks failing", Theme.bad, "xmark.circle.fill") }
            if !pending.isEmpty { return ("\(pending.count) running", Theme.warn, "circle.dotted") }
            return ("CI green", Theme.good, "checkmark.circle.fill")
        }()
        Label(text, systemImage: symbol)
            .font(.caption.weight(.medium)).lineLimit(1)
            .foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct FrictionPill: View {
    let friction: ConversationBrief.Friction
    let why: String

    var body: some View {
        let (text, color, symbol): (String, Color, String) = {
            switch friction {
            case .smooth: return ("smooth", Theme.good, "leaf.fill")
            case .someBackAndForth: return ("back and forth", Theme.warn, "flame")
            case .contested: return ("contested", Theme.bad, "flame.fill")
            }
        }()
        Label(why.isEmpty ? text : "\(text) · \(why)", systemImage: symbol)
            .font(.caption.weight(.medium)).lineLimit(1)
            .foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}
