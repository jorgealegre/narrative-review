import Foundation

// nr-tell: run a storyteller outside the app, for evals and scripts.
// usage: nr-tell apple <diff.patch> <pr.json from GitHub REST> <out.json>
let args = CommandLine.arguments
guard args.count == 5, args[1] == "apple" else {
    FileHandle.standardError.write(Data("usage: nr-tell apple <diff.patch> <pr.json> <out.json>\n".utf8))
    exit(2)
}
let raw = try String(contentsOfFile: args[2], encoding: .utf8)
let prData = try Data(contentsOf: URL(fileURLWithPath: args[3]))
let gh = try JSONSerialization.jsonObject(with: prData) as! [String: Any]
let base = gh["base"] as! [String: Any], head = gh["head"] as! [String: Any]
let repo = base["repo"] as! [String: Any]
let pr = PRInfo(owner: (repo["owner"] as! [String: Any])["login"] as! String, repo: repo["name"] as! String,
                number: gh["number"] as! Int, title: gh["title"] as! String, body: gh["body"] as? String ?? "",
                author: (gh["user"] as! [String: Any])["login"] as! String, additions: gh["additions"] as! Int,
                deletions: gh["deletions"] as! Int, changedFiles: gh["changed_files"] as! Int,
                baseRef: base["ref"] as! String, headRef: head["ref"] as! String)
let diff = DiffParser.parse(raw)
let teller = FoundationStoryteller()
let (draft, metrics) = try await teller.tell(diff: diff, pr: pr) { p in
    FileHandle.standardError.write(Data("[\(Int(p.fraction * 100))%] \(p.step)\n".utf8))
}
let (chapters, coverage) = CoverageVerifier.attach(draft: draft, to: diff)
let review = NarrativeReview(prInfo: pr, title: draft.title, summary: draft.summary, rootCause: draft.rootCause,
                             chapters: chapters, coverage: coverage, metrics: metrics,
                             analyzedAt: ISO8601DateFormatter().string(from: Date()))
try JSONEncoder.review.encode(review).write(to: URL(fileURLWithPath: args[4]))
print("wrote \(args[4]): \(chapters.count) chapters, \(coverage.coveredHunks)/\(coverage.totalHunks) hunks placed, \(metrics.durationMs) ms")
