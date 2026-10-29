import Foundation

/// Stories on disk, one JSON per PR, so a story told once is free the next time.
enum ReviewStore {
    static func fileURL(_ id: String) -> URL {
        let safe = id.replacingOccurrences(of: "/", with: "__").replacingOccurrences(of: "#", with: "-")
        return AppPaths.reviews.appendingPathComponent(safe + ".json")
    }

    static func load(_ id: String) -> NarrativeReview? {
        guard let data = try? Data(contentsOf: fileURL(id)) else { return nil }
        return try? JSONDecoder.review.decode(NarrativeReview.self, from: data)
    }

    static func save(_ review: NarrativeReview) {
        try? JSONEncoder.review.encode(review).write(to: fileURL(review.id))
    }

    static func loadAll() -> [NarrativeReview] {
        let files = (try? FileManager.default.contentsOfDirectory(at: AppPaths.reviews, includingPropertiesForKeys: nil)) ?? []
        return files.compactMap { try? JSONDecoder.review.decode(NarrativeReview.self, from: Data(contentsOf: $0)) }
    }

    static func importFixture(_ url: URL) throws -> NarrativeReview {
        let review = try JSONDecoder.review.decode(NarrativeReview.self, from: Data(contentsOf: url))
        save(review)
        return review
    }
}
