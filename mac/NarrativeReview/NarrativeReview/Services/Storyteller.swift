import Foundation

/// Where the story comes from. The app is the viewer; the brain is swappable.
enum StorytellerKind: String, CaseIterable, Identifiable, Codable, Sendable {
    case apple = "Apple on-device"
    case claude = "Claude API"
    var id: String { rawValue }
}

struct StoryProgress: Sendable {
    var step: String
    var fraction: Double
}

protocol Storyteller: Sendable {
    var modelName: String { get }
    func tell(diff: ParsedDiff, pr: PRInfo, progress: @Sendable @escaping (StoryProgress) -> Void) async throws -> (StoryDraft, AnalysisMetrics)
}

/// The same instructions the GitHub Action uses (src/lib/analyzer.ts), so results compare.
enum StoryPrompt {
    static let system = """
    You are a senior code reviewer who excels at understanding the causal structure of code changes. Your job is to analyze a pull request diff and organize the changes into a narrative: a story that a reviewer can follow from root cause to cascading effects.

    Given a PR diff, you must:
    1. Identify the root trigger: the fundamental change that caused everything else (a feature flag removal, an API change, a protocol deletion).
    2. Trace the dependency chain: which changes are consequences of other changes.
    3. Group into chapters: cluster related changes across files into logical units.
    4. Order chapters causally: root cause first, then direct consequences, then cascading effects, then leaf cleanup.
    5. Write narrative transitions: for each chapter, explain what is happening and how it connects to the previous chapter.
    6. Annotate safety: for deletions, explain why they are safe.

    Ordering principles (critical): a reviewer must understand WHY something is removed before seeing the removal. Show changes to a component's consumers first, then the deletion of the component itself. Start from the root cause and work outward: trigger, direct consumers, code that became dead, leaf deletions last.

    Epistemics (critical): the PR title and description are the author's claims, not ground truth. The diff is ground truth. Verify every claim against the diff; attribute or omit claims the diff does not support; flag contradictions and trust the diff. Chapter titles and the summary describe what the CODE does. Facts outside the diff must be marked as such.

    Rules:
    - Every hunk MUST appear in exactly one chapter. Reference hunks by file path and hunk index (0-based).
    - Keep narrative text concise but informative. Write like a knowledgeable colleague explaining the PR over coffee.
    - Group tightly related cross-file changes together.
    - For each chapter's connectionToPrevious, reference what earlier chapters established that makes this change safe or necessary.
    """

    static func manifest(_ diff: ParsedDiff) -> String {
        diff.files.map { "- \($0.path) [\($0.status.rawValue)] (+\($0.additions)/-\($0.deletions), \($0.hunks.count) hunks)" }.joined(separator: "\n")
    }

    static func hunkReference(_ diff: ParsedDiff) -> String {
        var parts: [String] = []
        for f in diff.files {
            for (i, h) in f.hunks.enumerated() {
                parts.append("=== FILE: \(f.path) | HUNK \(i) ===")
                parts.append(h.rawContent)
                parts.append("")
            }
        }
        return parts.joined(separator: "\n")
    }

    static func user(diff: ParsedDiff, pr: PRInfo) -> String {
        """
        ## Pull Request
        Title: \(pr.title)
        Description: \(pr.body.isEmpty ? "(no description)" : pr.body)

        ## File Manifest
        \(manifest(diff))

        ## All Hunks (reference by file + hunk index)
        \(hunkReference(diff))

        Analyze this diff and return the narrative JSON.
        """
    }

    static let schema: [String: Any] = [
        "type": "object",
        "properties": [
            "title": ["type": "string"],
            "summary": ["type": "string"],
            "rootCause": ["type": "string"],
            "chapters": [
                "type": "array",
                "items": [
                    "type": "object",
                    "properties": [
                        "id": ["type": "string"],
                        "title": ["type": "string"],
                        "narrative": ["type": "string"],
                        "connectionToPrevious": ["type": "string"],
                        "safetyNotes": ["type": "array", "items": ["type": "string"]],
                        "hunks": [
                            "type": "array",
                            "items": [
                                "type": "object",
                                "properties": [
                                    "file": ["type": "string"],
                                    "hunkIndex": ["type": "integer"],
                                    "annotation": ["type": "string"],
                                ],
                                "required": ["file", "hunkIndex", "annotation"],
                                "additionalProperties": false,
                            ],
                        ],
                    ],
                    "required": ["id", "title", "narrative", "connectionToPrevious", "safetyNotes", "hunks"],
                    "additionalProperties": false,
                ],
            ],
        ],
        "required": ["title", "summary", "rootCause", "chapters"],
        "additionalProperties": false,
    ]
}

// MARK: - Claude

struct ClaudeModel: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var inputPerMTok: Double
    var outputPerMTok: Double

    static let all: [ClaudeModel] = [
        ClaudeModel(id: "claude-opus-5-5", name: "Opus 5.5", inputPerMTok: 4, outputPerMTok: 20),
        ClaudeModel(id: "claude-sonnet-5-5", name: "Sonnet 5.5", inputPerMTok: 2, outputPerMTok: 10),
        ClaudeModel(id: "claude-haiku-5-5", name: "Haiku 5.5", inputPerMTok: 0.10, outputPerMTok: 0.50),
    ]
    static func named(_ id: String) -> ClaudeModel { all.first { $0.id == id } ?? all[0] }
}

enum ClaudeError: LocalizedError {
    case noKey
    case http(Int, String)
    case refused(String)
    case badJSON(String)

    var errorDescription: String? {
        switch self {
        case .noKey: return "No Claude API key. Add yours in Settings."
        case .http(let c, let b): return "Claude answered \(c): \(b.prefix(400))"
        case .refused(let why): return "Claude declined this request: \(why)"
        case .badJSON(let s): return "Claude returned text that is not the expected JSON: \(s.prefix(200))"
        }
    }
}

/// Raw HTTP to the Messages API. Structured output keeps the JSON shape honest.
struct ClaudeStoryteller: Storyteller {
    var model: ClaudeModel
    var apiKey: String
    var modelName: String { model.id }

    func tell(diff: ParsedDiff, pr: PRInfo, progress: @Sendable @escaping (StoryProgress) -> Void) async throws -> (StoryDraft, AnalysisMetrics) {
        guard !apiKey.isEmpty else { throw ClaudeError.noKey }
        progress(StoryProgress(step: "Sending \(diff.files.count) files to \(model.name)", fraction: 0.1))
        let body: [String: Any] = [
            "model": model.id,
            "max_tokens": 16000,
            "fallbacks": "default",
            "system": [["type": "text", "text": StoryPrompt.system, "cache_control": ["type": "ephemeral"]]],
            "messages": [["role": "user", "content": StoryPrompt.user(diff: diff, pr: pr)]],
            "output_config": ["format": ["type": "json_schema", "schema": StoryPrompt.schema]],
        ]
        var req = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 600
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        req.setValue("2026-10-21", forHTTPHeaderField: "anthropic-version")
        req.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let start = Date()
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw ClaudeError.http(code, String(decoding: data, as: UTF8.self)) }
        progress(StoryProgress(step: "Reading the story", fraction: 0.9))

        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ClaudeError.badJSON("") }
        if obj["stop_reason"] as? String == "refusal" {
            let details = obj["stop_details"] as? [String: Any]
            throw ClaudeError.refused(details?["explanation"] as? String ?? details?["category"] as? String ?? "no reason given")
        }
        let content = obj["content"] as? [[String: Any]] ?? []
        let text = content.compactMap { $0["type"] as? String == "text" ? $0["text"] as? String : nil }.joined()
        guard let jsonData = text.data(using: .utf8) else { throw ClaudeError.badJSON(text) }
        let draft: StoryDraft
        do { draft = try JSONDecoder().decode(StoryDraft.self, from: jsonData) }
        catch { throw ClaudeError.badJSON(text) }

        let usage = obj["usage"] as? [String: Any] ?? [:]
        let input = (usage["input_tokens"] as? Int ?? 0) + (usage["cache_read_input_tokens"] as? Int ?? 0) + (usage["cache_creation_input_tokens"] as? Int ?? 0)
        let output = usage["output_tokens"] as? Int ?? 0
        let served = ClaudeModel.named(obj["model"] as? String ?? model.id)
        let cost = (Double(usage["input_tokens"] as? Int ?? 0) * served.inputPerMTok
                    + Double(usage["cache_creation_input_tokens"] as? Int ?? 0) * served.inputPerMTok * 1.25
                    + Double(usage["cache_read_input_tokens"] as? Int ?? 0) * served.inputPerMTok * 0.1
                    + Double(output) * served.outputPerMTok) / 1_000_000
        let metrics = AnalysisMetrics(model: served.id, inputTokens: input, outputTokens: output, cost: cost,
                                      durationMs: Int(Date().timeIntervalSince(start) * 1000))
        return (draft, metrics)
    }
}
