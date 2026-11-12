import CryptoKit
import Foundation

/// Everything the app and its widgets do with the diary without the website:
/// read it, open it with the key, write a reply or a ❤️, and tell the other one.
/// The diary's files are the same ones the website uses (diary/entries.json, vault.json),
/// encrypted the same way (AES-GCM, base64 of nonce | ciphertext | tag).
public enum DiaryKit {
    public static let appGroup = "group.com.vianshah.ourdiary"
    public static let people = ["Vian", "Jovena"]
    static let raw = "https://raw.githubusercontent.com/VianShah/for-you/main/"
    static let api = "https://api.github.com/repos/VianShah/for-you/"

    // MARK: Who this phone is, and its key (put here by the app once the secret word is typed)

    public static var shared: UserDefaults? { UserDefaults(suiteName: appGroup) }
    public static var me: String? { shared?.string(forKey: "name") }
    public static var partner: String? { me.flatMap { m in people.first { $0 != m } } }
    static var key: SymmetricKey? {
        shared?.string(forKey: "key").flatMap { Data(base64Encoded: $0) }.map { SymmetricKey(data: $0) }
    }
    public static var isSetUp: Bool { key != nil && me != nil }

    public enum Problem: LocalizedError {
        case notSetUp, unreadable, github(Int)
        public var errorDescription: String? {
            switch self {
            case .notSetUp: "Open Us ♥ once and type the secret word."
            case .unreadable: "Couldn't read the diary."
            case .github(let code): "GitHub said \(code)."
            }
        }
    }

    // MARK: Encryption, the diary's way

    static func seal(_ data: Data, key: SymmetricKey) throws -> String {
        guard let combined = try AES.GCM.seal(data, using: key).combined else { throw Problem.unreadable }
        return combined.base64EncodedString()
    }

    static func unseal(_ b64: String, key: SymmetricKey) throws -> Data {
        guard let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else { throw Problem.unreadable }
        return try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key)
    }

    static func unsealBytes(_ data: Data, key: SymmetricKey) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key)
    }

    // MARK: Reading (public files, no GitHub key needed)

    static func fetchRaw(_ path: String) async throws -> Data {
        var request = URLRequest(url: URL(string: raw + path + "?t=\(Int(Date().timeIntervalSince1970))")!)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 25
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Problem.unreadable }
        return data
    }

    /// entries.json is `{ v, enc }` (or a plain list from before the vault): this gives the list as JSON text.
    static func openIndex(_ file: Data, key: SymmetricKey) throws -> Data {
        let object = try JSONSerialization.jsonObject(with: file)
        if object is [Any] { return file }
        guard let enc = (object as? [String: Any])?["enc"] as? String else { throw Problem.unreadable }
        return try unseal(enc, key: key)
    }

    public static func entriesJSON() async throws -> Data {
        guard let key else { throw Problem.notSetUp }
        return try openIndex(try await fetchRaw("diary/entries.json"), key: key)
    }

    public static func entries() async throws -> [[String: Any]] {
        try (JSONSerialization.jsonObject(with: try await entriesJSON()) as? [[String: Any]]) ?? []
    }

    /// A picture or other file from the diary, decrypted if it's a .enc.
    public static func media(_ path: String) async throws -> Data {
        guard let key else { throw Problem.notSetUp }
        let data = try await fetchRaw(path)
        return path.hasSuffix(".enc") ? try unsealBytes(data, key: key) : data
    }

    // MARK: The GitHub key and notification channels (inside vault.json, encrypted)

    struct Secrets: Decodable {
        var token: String?
        var topics: [String: String]?
    }

    static func secrets() async throws -> Secrets {
        guard let key else { throw Problem.notSetUp }
        let vault = try JSONSerialization.jsonObject(with: try await fetchRaw("diary/vault.json")) as? [String: Any]
        guard let enc = vault?["secrets"] as? String else { throw Problem.unreadable }
        return try JSONDecoder().decode(Secrets.self, from: try unseal(enc, key: key))
    }

    // MARK: Writing (needs the GitHub key from the vault)

    static func github(_ method: String, _ path: String, token: String, body: [String: Any]? = nil) async throws -> (Data, Int) {
        var request = URLRequest(url: URL(string: api + path)!)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    /// Reads the latest diary, changes it, and saves it back, again if the other phone saved at the
    /// same moment. `change` returns nil when there's nothing to change (e.g. already done).
    static func updateEntries(message: String, change: @escaping ([[String: Any]]) -> [[String: Any]]?) async throws {
        guard let key else { throw Problem.notSetUp }
        guard let token = try await secrets().token, !token.isEmpty else { throw Problem.notSetUp }
        for attempt in 0..<5 {
            let (data, status) = try await github("GET", "contents/diary/entries.json?ref=main", token: token)
            guard status == 200, let file = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let content = file["content"] as? String, let sha = file["sha"] as? String,
                  let bytes = Data(base64Encoded: content, options: .ignoreUnknownCharacters) else { throw Problem.github(status) }
            let list = (try JSONSerialization.jsonObject(with: try openIndex(bytes, key: key)) as? [[String: Any]]) ?? []
            guard let next = change(list) else { return }
            let text = try JSONSerialization.data(withJSONObject: next, options: [.prettyPrinted, .withoutEscapingSlashes])
            let saved = Data("{\"v\":1,\"enc\":\"\(try seal(text, key: key))\"}\n".utf8)
            let (_, put) = try await github("PUT", "contents/diary/entries.json", token: token, body: [
                "message": message, "content": saved.base64EncodedString(), "branch": "main", "sha": sha,
            ])
            if put == 200 || put == 201 { return }
            if put == 409 || put == 422 { try await Task.sleep(nanoseconds: UInt64(attempt + 1) * 700_000_000); continue }
            throw Problem.github(put)
        }
        throw Problem.github(409)
    }

    // MARK: Things the app does from a notification

    /// A reply to a page, just like one written in the diary (and it tells the other one).
    public static func reply(to pageID: String, text: String) async throws {
        guard let me else { throw Problem.notSetUp }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        let reply: [String: Any] = ["id": newID(), "by": me, "at": isoNow(), "text": String(words.prefix(2000))]
        var theirs = false
        try await updateEntries(message: "A reply from \(me)") { list in
            list.map { page in
                guard page["id"] as? String == pageID else { return page }
                theirs = (page["by"] as? String ?? page["author"] as? String) != me
                var page = page
                page["replies"] = ((page["replies"] as? [[String: Any]]) ?? []) + [reply]
                return page
            }
        }
        await notifyPartner(title: "\(me) replied to \(theirs ? "your" : "a") page 💬", message: "Open the diary to see it.")
    }

    /// ❤️ a page (the same heart as a double tap in the diary).
    public static func heart(pageID: String) async throws {
        guard let me else { throw Problem.notSetUp }
        var added = false
        try await updateEntries(message: "\(me) ❤️ a page") { list in
            var changed = false
            let next = list.map { page -> [String: Any] in
                guard page["id"] as? String == pageID else { return page }
                var hearts = page["hearts"] as? [String] ?? []
                if hearts.contains(me) { return page }
                hearts.append(me); changed = true; added = true
                var page = page
                page["hearts"] = hearts
                return page
            }
            return changed ? next : nil
        }
        if added { await notifyPartner(title: "\(me) ❤️ your page", message: "Open the diary to see it.") }
    }

    /// Tells the other one: through the diary's notify workflow (opens their app when tapped),
    /// or the ntfy app if that doesn't work.
    public static func notifyPartner(title: String, message: String) async {
        guard let partner, let secrets = try? await secrets() else { return }
        if let token = secrets.token,
           let sent = try? await github("POST", "dispatches", token: token, body: [
               "event_type": "notify", "client_payload": ["to": partner, "title": title, "message": message, "url": "diary/"],
           ]), sent.1 == 204 { return }
        guard let topic = secrets.topics?[partner] else { return }
        var request = URLRequest(url: URL(string: "https://ntfy.sh/")!)
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["topic": topic, "title": title, "message": message, "tags": ["love_letter"]])
        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: Little helpers, matching the website's

    /// Like the diary's ids: milliseconds in base 36 plus 4 random characters.
    static func newID() -> String {
        let chars = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        return String(Int(Date().timeIntervalSince1970 * 1000), radix: 36) + String((0..<4).map { _ in chars.randomElement()! })
    }

    static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoPlain = ISO8601DateFormatter()

    static func isoNow() -> String { isoFormatter.string(from: Date()) }
    public static func date(_ value: Any?) -> Date? {
        guard let s = value as? String else { return nil }
        return isoFormatter.date(from: s) ?? isoPlain.date(from: s)
    }
}
