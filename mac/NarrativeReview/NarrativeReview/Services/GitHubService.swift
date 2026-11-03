import Foundation

enum GitHubError: LocalizedError {
    case notLoggedIn(String)
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .notLoggedIn(let detail): return "GitHub login not found. Run `gh auth login` in Terminal. \(detail)"
        case .http(let code, let body): return "GitHub answered \(code): \(body.prefix(300))"
        }
    }
}

/// Talks to GitHub with the token the `gh` CLI already holds. No login screen in the app.
actor GitHubService {
    private var token: String?

    func login() async throws -> String {
        if let token { return token }
        let out = try await Shell.run("/usr/bin/env", ["gh", "auth", "token"])
        let t = out.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        guard out.status == 0, !t.isEmpty else { throw GitHubError.notLoggedIn(out.stderr) }
        token = t
        return t
    }

    func viewer() async throws -> String {
        let data = try await get("https://api.github.com/user")
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return obj?["login"] as? String ?? "?"
    }

    /// Open PRs that involve the user, with reviews, checks and threads, in one GraphQL call.
    func inboxDetailed(scope: String, limit: Int = 50) async throws -> (viewer: String, prs: [PullRequest]) {
        var q = "is:pr is:open involves:@me archived:false sort:updated-desc"
        if !scope.isEmpty { q += " " + scope }
        let body: [String: Any] = ["query": InboxQuery.text, "variables": ["q": q, "n": limit]]
        let data = try await post("https://api.github.com/graphql", body: body)
        return try InboxQuery.parse(data)
    }

    /// Open PRs that involve the user, newest activity first. `scope` is a GitHub search qualifier
    /// such as `org:sp0n-7` or `user:jorgealegre`; empty means everything the token can see.
    func inbox(scope: String, limit: Int = 50) async throws -> [PRRef] {
        var q = "is:pr is:open involves:@me archived:false"
        if !scope.isEmpty { q += " " + scope }
        let url = "https://api.github.com/search/issues?per_page=\(limit)&sort=updated&order=desc&q=" +
            (q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)
        let data = try await get(url)
        struct Resp: Decodable {
            struct Item: Decodable {
                struct User: Decodable { var login: String }
                struct Label: Decodable { var name: String }
                var number: Int
                var title: String
                var html_url: String
                var repository_url: String
                var updated_at: Date
                var draft: Bool?
                var user: User
                var labels: [Label]
            }
            var items: [Item]
        }
        let resp = try JSONDecoder.review.decode(Resp.self, from: data)
        return resp.items.compactMap { it in
            let parts = it.repository_url.split(separator: "/")
            guard parts.count >= 2 else { return nil }
            return PRRef(owner: String(parts[parts.count - 2]), repo: String(parts.last!), number: it.number,
                         title: it.title, author: it.user.login, url: it.html_url, updatedAt: it.updated_at,
                         isDraft: it.draft ?? false, labels: it.labels.map(\.name))
        }
    }

    func pullRequest(_ ref: PRRef) async throws -> PRInfo {
        let data = try await get("https://api.github.com/repos/\(ref.owner)/\(ref.repo)/pulls/\(ref.number)")
        struct Resp: Decodable {
            struct User: Decodable { var login: String }
            struct Branch: Decodable { var ref: String }
            var title: String
            var body: String?
            var user: User
            var additions: Int
            var deletions: Int
            var changed_files: Int
            var base: Branch
            var head: Branch
        }
        let r = try JSONDecoder.review.decode(Resp.self, from: data)
        return PRInfo(owner: ref.owner, repo: ref.repo, number: ref.number, title: r.title, body: r.body ?? "",
                      author: r.user.login, additions: r.additions, deletions: r.deletions,
                      changedFiles: r.changed_files, baseRef: r.base.ref, headRef: r.head.ref)
    }

    /// What GitHub knows about a failed check run: its output text first, then its annotations.
    func checkFailureText(owner: String, repo: String, checkRunId: Int) async throws -> String {
        let run = try await get("https://api.github.com/repos/\(owner)/\(repo)/check-runs/\(checkRunId)")
        let obj = (try JSONSerialization.jsonObject(with: run) as? [String: Any]) ?? [:]
        let out = obj["output"] as? [String: Any] ?? [:]
        let text = [out["title"] as? String, out["summary"] as? String, out["text"] as? String].compactMap { $0 }.joined(separator: "\n")
        let notes = try await checkAnnotations(owner: owner, repo: repo, checkRunId: checkRunId)
        return [text, notes].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.joined(separator: "\n")
    }

    /// Annotations GitHub attached to a failed check run (compiler errors, test names, lint lines).
    func checkAnnotations(owner: String, repo: String, checkRunId: Int) async throws -> String {
        let data = try await get("https://api.github.com/repos/\(owner)/\(repo)/check-runs/\(checkRunId)/annotations?per_page=50")
        let items = (try JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
        return items.compactMap { a -> String? in
            guard let msg = a["message"] as? String else { return nil }
            let path = a["path"] as? String ?? ""
            let line = a["start_line"] as? Int ?? 0
            return "\(path):\(line) \(a["annotation_level"] as? String ?? "") \(a["title"] as? String ?? ""): \(msg)"
        }.joined(separator: "\n")
    }

    /// Merges the base branch into the PR branch on GitHub (the "Update branch" button).
    func updateBranch(owner: String, repo: String, number: Int) async throws {
        let token = try await login()
        var req = URLRequest(url: URL(string: "https://api.github.com/repos/\(owner)/\(repo)/pulls/\(number)/update-branch")!)
        req.httpMethod = "PUT"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw GitHubError.http(code, String(decoding: data, as: UTF8.self)) }
    }

    func diff(_ ref: PRRef) async throws -> String {
        let data = try await get("https://api.github.com/repos/\(ref.owner)/\(ref.repo)/pulls/\(ref.number)",
                                 accept: "application/vnd.github.v3.diff")
        return String(decoding: data, as: UTF8.self)
    }

    /// The PR conversation in one GraphQL call: reviews, comments, threads, commits and review events.
    func timeline(owner: String, repo: String, number: Int) async throws -> Data {
        let query = """
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              author { __typename login }
              reviews(last: 50) { nodes { author { __typename login } state body submittedAt } }
              comments(last: 50) { nodes { author { __typename login } body createdAt } }
              reviewThreads(last: 50) { nodes { isResolved isOutdated path
                comments(first: 50) { nodes { author { __typename login } body createdAt } } } }
              commits(last: 50) { nodes { commit { messageHeadline committedDate author { name user { __typename login } } } } }
              timelineItems(last: 50, itemTypes: [REVIEW_REQUESTED_EVENT, READY_FOR_REVIEW_EVENT, HEAD_REF_FORCE_PUSHED_EVENT]) {
                nodes {
                  __typename
                  ... on ReviewRequestedEvent { createdAt actor { __typename login }
                    requestedReviewer { ... on User { login } ... on Team { name } ... on Bot { login } } }
                  ... on ReadyForReviewEvent { createdAt actor { __typename login } }
                  ... on HeadRefForcePushedEvent { createdAt actor { __typename login } }
                }
              }
            }
          }
        }
        """
        let body: [String: Any] = ["query": query, "variables": ["owner": owner, "repo": repo, "number": number]]
        return try await post("https://api.github.com/graphql", body: body)
    }

    private func post(_ url: String, body: [String: Any]) async throws -> Data {
        let token = try await login()
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw GitHubError.http(code, String(decoding: data, as: UTF8.self)) }
        return data
    }

    private func get(_ url: String, accept: String = "application/vnd.github+json") async throws -> Data {
        let token = try await login()
        var req = URLRequest(url: URL(string: url)!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue(accept, forHTTPHeaderField: "Accept")
        req.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw GitHubError.http(code, String(decoding: data, as: UTF8.self)) }
        return data
    }
}

enum Shell {
    struct Output: Sendable { var status: Int32; var stdout: String; var stderr: String }

    static func run(_ launchPath: String, _ args: [String]) async throws -> Output {
        try await withCheckedThrowingContinuation { cont in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: launchPath)
            p.arguments = args
            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? "")
            p.environment = env
            let out = Pipe(), err = Pipe()
            p.standardOutput = out
            p.standardError = err
            p.terminationHandler = { proc in
                let o = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                let e = String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                cont.resume(returning: Output(status: proc.terminationStatus, stdout: o, stderr: e))
            }
            do { try p.run() } catch { cont.resume(throwing: error) }
        }
    }
}
