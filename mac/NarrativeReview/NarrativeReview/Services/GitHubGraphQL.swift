import Foundation

/// The inbox query: one round trip for every open PR that involves the viewer.
enum InboxQuery {
    static let text = """
    query($q: String!, $n: Int!) {
      viewer { login }
      search(query: $q, type: ISSUE, first: $n) {
        nodes {
          ... on PullRequest {
            number title body url isDraft createdAt updatedAt additions deletions changedFiles
            reviewDecision mergeable mergeStateStatus baseRefName
            author { login }
            repository { name owner { login } }
            labels(first: 10) { nodes { name } }
            reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }
            latestReviews(first: 20) { nodes { author { login } state submittedAt } }
            reviews { totalCount }
            comments { totalCount }
            reviewThreads(first: 100) { totalCount nodes { isResolved isOutdated path line comments(first: 1) { nodes { author { login } body url createdAt } } } }
            commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup { state contexts(first: 40) { nodes {
              ... on CheckRun { name conclusion status detailsUrl databaseId }
              ... on StatusContext { context state targetUrl } } } } } } }
          }
        }
      }
    }
    """

    static func parse(_ data: Data) throws -> (viewer: String, prs: [PullRequest]) {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw GitHubError.http(0, "not JSON") }
        if let errors = root["errors"] as? [[String: Any]], let first = errors.first {
            throw GitHubError.http(200, first["message"] as? String ?? "GraphQL error")
        }
        let d = root["data"] as? [String: Any] ?? [:]
        let viewer = (d["viewer"] as? [String: Any])?["login"] as? String ?? "?"
        let nodes = ((d["search"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []
        let iso = ISO8601DateFormatter()
        func date(_ v: Any?) -> Date? { (v as? String).flatMap { iso.date(from: $0) } }
        func str(_ v: Any?) -> String? { v as? String }

        return (viewer, nodes.compactMap { n -> PullRequest? in
            guard let number = n["number"] as? Int, let repo = n["repository"] as? [String: Any] else { return nil }
            let commit = (((n["commits"] as? [String: Any])?["nodes"] as? [[String: Any]])?.first?["commit"] as? [String: Any]) ?? [:]
            let rollup = commit["statusCheckRollup"] as? [String: Any]
            let contexts = ((rollup?["contexts"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []
            let checks: [CheckItem] = contexts.compactMap { c in
                if let name = str(c["name"]) {
                    let status = str(c["status"]) ?? "", conclusion = str(c["conclusion"]) ?? ""
                    let outcome: CheckItem.Outcome = status != "COMPLETED" ? .pending :
                        ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].contains(conclusion) ? .failure :
                        conclusion == "SUCCESS" ? .success : conclusion == "SKIPPED" ? .skipped : .neutral
                    return CheckItem(name: name, outcome: outcome, url: str(c["detailsUrl"]), checkRunId: c["databaseId"] as? Int)
                }
                if let name = str(c["context"]) {
                    let state = str(c["state"]) ?? ""
                    let outcome: CheckItem.Outcome = state == "SUCCESS" ? .success : ["FAILURE", "ERROR"].contains(state) ? .failure : state == "PENDING" ? .pending : .neutral
                    return CheckItem(name: name, outcome: outcome, url: str(c["targetUrl"]))
                }
                return nil
            }
            let threads = (n["reviewThreads"] as? [String: Any]) ?? [:]
            let threadNodes = (threads["nodes"] as? [[String: Any]]) ?? []
            let reviews = (((n["latestReviews"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []).compactMap { r -> ReviewItem? in
                guard let a = (r["author"] as? [String: Any])?["login"] as? String, let s = str(r["state"]) else { return nil }
                return ReviewItem(author: a, state: s, submittedAt: date(r["submittedAt"]))
            }
            let requested = (((n["reviewRequests"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []).compactMap { r -> String? in
                let rr = r["requestedReviewer"] as? [String: Any]
                return str(rr?["login"]) ?? str(rr?["name"])
            }
            return PullRequest(
                owner: ((repo["owner"] as? [String: Any])?["login"] as? String) ?? "", repo: str(repo["name"]) ?? "",
                number: number, title: str(n["title"]) ?? "", body: str(n["body"]) ?? "", url: str(n["url"]) ?? "",
                author: ((n["author"] as? [String: Any])?["login"] as? String) ?? "ghost", isDraft: n["isDraft"] as? Bool ?? false,
                createdAt: date(n["createdAt"]) ?? .distantPast, updatedAt: date(n["updatedAt"]) ?? .distantPast,
                additions: n["additions"] as? Int ?? 0, deletions: n["deletions"] as? Int ?? 0, changedFiles: n["changedFiles"] as? Int ?? 0,
                reviewDecision: str(n["reviewDecision"]), mergeable: str(n["mergeable"]),
                mergeStateStatus: str(n["mergeStateStatus"]), baseRefName: str(n["baseRefName"]) ?? "main",
                labels: (((n["labels"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []).compactMap { str($0["name"]) },
                requestedReviewers: requested, latestReviews: reviews,
                reviewCount: (n["reviews"] as? [String: Any])?["totalCount"] as? Int ?? 0,
                commentCount: (n["comments"] as? [String: Any])?["totalCount"] as? Int ?? 0,
                threadCount: threads["totalCount"] as? Int ?? 0,
                openThreads: threadNodes.compactMap { t -> OpenThread? in
                    guard (t["isResolved"] as? Bool) == false, (t["isOutdated"] as? Bool) != true,
                          let c = ((t["comments"] as? [String: Any])?["nodes"] as? [[String: Any]])?.first,
                          let a = (c["author"] as? [String: Any])?["login"] as? String,
                          a != ((n["author"] as? [String: Any])?["login"] as? String) else { return nil }
                    return OpenThread(author: a, path: str(t["path"]), line: t["line"] as? Int, body: str(c["body"]) ?? "",
                                      url: str(c["url"]), createdAt: date(c["createdAt"]))
                },
                headSha: str(commit["oid"]) ?? "", headCommittedAt: date(commit["committedDate"]),
                checksState: str(rollup?["state"]), checks: checks)
        })
    }
}
