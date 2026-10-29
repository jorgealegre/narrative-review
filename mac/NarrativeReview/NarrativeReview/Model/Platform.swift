import SwiftUI

/// Which part of the product a repo belongs to. Color and symbol are used everywhere a repo is named.
enum Platform: String, CaseIterable, Sendable {
    case ios, android, backend, data, infra, dashboards, skills, other

    static func of(repo: String) -> Platform {
        let r = repo.lowercased()
        if r.contains("ios") || r.hasSuffix("-apple") { return .ios }
        if r.contains("android") { return .android }
        if r.contains("data") || r.contains("dbt") || r.contains("warehouse") { return .data }
        if r.contains("lookout") || r.contains("dashboard") || r.contains("grafana") { return .dashboards }
        if r.contains("infra") || r.contains("k8s") || r.contains("terraform") || r.contains("ops") { return .infra }
        if r.contains("skill") || r.contains("agent") { return .skills }
        if r == "citizen" || r.contains("backend") || r.contains("server") || r.contains("api") { return .backend }
        return .other
    }

    var name: String {
        switch self {
        case .ios: return "iOS"
        case .android: return "Android"
        case .backend: return "Backend"
        case .data: return "Data"
        case .infra: return "Infra"
        case .dashboards: return "Dashboards"
        case .skills: return "Skills"
        case .other: return "Repo"
        }
    }

    var symbol: String {
        switch self {
        case .ios: return "apple.logo"
        case .android: return "smartphone"
        case .backend: return "server.rack"
        case .data: return "cylinder.split.1x2.fill"
        case .infra: return "gearshape.2.fill"
        case .dashboards: return "chart.bar.xaxis"
        case .skills: return "sparkles"
        case .other: return "shippingbox.fill"
        }
    }

    var color: Color {
        switch self {
        case .ios: return Color(red: 0.55, green: 0.65, blue: 1.0)
        case .android: return Color(red: 0.36, green: 0.86, blue: 0.54)
        case .backend: return Color(red: 0.95, green: 0.62, blue: 0.30)
        case .data: return Color(red: 0.95, green: 0.78, blue: 0.30)
        case .infra: return Color(red: 0.70, green: 0.70, blue: 0.75)
        case .dashboards: return Color(red: 0.90, green: 0.45, blue: 0.70)
        case .skills: return Color(red: 0.70, green: 0.55, blue: 1.0)
        case .other: return .secondary
        }
    }
}

/// The repo badge: symbol plus repo name on a tinted pill. Same look on cards, detail and the film.
struct PlatformBadge: View {
    let repo: String
    var compact = false

    var body: some View {
        let p = Platform.of(repo: repo)
        HStack(spacing: 5) {
            Image(systemName: p.symbol).font(.system(size: compact ? 10 : 12, weight: .semibold))
            if !compact { Text(repo).font(.system(size: 12, weight: .semibold)) }
        }
        .foregroundStyle(p.color)
        .padding(.horizontal, compact ? 6 : 8).padding(.vertical, 3)
        .background(p.color.opacity(0.16), in: Capsule())
        .help("\(p.name) · \(repo)")
    }
}
