import Foundation
import Security

/// Secrets live in a file only this user can read (mode 600), like the GitHub CLI's token.
/// The Keychain was tried first: every rebuild of an unsigned app is a new app to it, so it asked every time.
nonisolated enum Keychain {
    static let service = "dev.alegre.NarrativeReview"
    private static var dir: URL {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NarrativeReview/secrets", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return u
    }
    private static func file(_ account: String) -> URL { dir.appendingPathComponent(account) }

    static func read(_ account: String) -> String? {
        if let s = try? String(contentsOf: file(account), encoding: .utf8), !s.isEmpty { return s }
        // One-time move out of the Keychain, for keys saved by earlier builds.
        if let old = legacyRead(account) { write(account, old); legacyDelete(account); return old }
        return nil
    }

    static func write(_ account: String, _ value: String) {
        if value.isEmpty { delete(account); return }
        try? value.write(to: file(account), atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file(account).path)
    }

    static func delete(_ account: String) { try? FileManager.default.removeItem(at: file(account)) }

    private static func legacyRead(_ account: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: account, kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    private static func legacyDelete(_ account: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: account]
        SecItemDelete(q as CFDictionary)
    }
}
