import CryptoKit
import Foundation
import JavaScriptCore

/// What the widgets show, worked out from the diary itself.
struct DiarySummary: Codable {
    struct Person: Codable {
        var name: String
        var points: Int
        var crying: Bool
    }
    struct Latest: Codable {
        var at: Double      // ms since 1970
        var what: String    // "replied", "added a picture"…
    }
    var me: Person
    var them: Person
    var streak: Int
    var nextPenaltyAt: Double?   // ms; when my next −50 lands (sleep time already counted in)
    var shieldUntil: Double?
    var callsToday: Int          // seconds
    var latest: Latest?

    var nextPenalty: Date? { nextPenaltyAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var latestDate: Date? { latest.map { Date(timeIntervalSince1970: $0.at / 1000) } }
}

enum DiaryData {
    static let appGroup = "group.com.vianshah.ourdiary"
    private static let raw = "https://raw.githubusercontent.com/VianShah/for-you/main/diary/"

    enum Problem: Error { case notSetUp, unreadable }

    /// Reads the diary from GitHub, opens it with the key the app left here, and asks the
    /// diary's own goldie rules (goldies.js) for the numbers, so the widget always agrees with it.
    static func load() async throws -> DiarySummary {
        let shared = UserDefaults(suiteName: appGroup)
        guard let name = shared?.string(forKey: "name"), let keyB64 = shared?.string(forKey: "key"),
              let keyData = Data(base64Encoded: keyB64) else { throw Problem.notSetUp }

        async let diaryFile = fetch("entries.json")
        async let rulesFile = fetch("goldies.js")
        let (diary, rules) = try await (diaryFile, rulesFile)

        let entriesJSON = try open(diary, key: SymmetricKey(data: keyData))
        let summary = try compute(entriesJSON: entriesJSON, rules: String(decoding: rules, as: UTF8.self), me: name)
        if let data = try? JSONEncoder().encode(summary) { shared?.set(data, forKey: "lastSummary") }
        return summary
    }

    /// The last numbers that worked, for when the internet doesn't.
    static func cached() -> DiarySummary? {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: "lastSummary") else { return nil }
        return try? JSONDecoder().decode(DiarySummary.self, from: data)
    }

    static var isSetUp: Bool { UserDefaults(suiteName: appGroup)?.string(forKey: "key") != nil }

    private static func fetch(_ file: String) async throws -> Data {
        var request = URLRequest(url: URL(string: raw + file + "?t=\(Int(Date().timeIntervalSince1970))")!)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Problem.unreadable }
        return data
    }

    /// entries.json is `{ v, enc }`: enc is base64 of a 12-byte nonce, then the AES-GCM ciphertext and tag
    /// (exactly what the diary's vault.js writes). Before the vault it was a plain list.
    private static func open(_ file: Data, key: SymmetricKey) throws -> String {
        let object = try JSONSerialization.jsonObject(with: file)
        if object is [Any] { return String(decoding: file, as: UTF8.self) }
        guard let enc = (object as? [String: Any])?["enc"] as? String,
              let sealed = Data(base64Encoded: enc, options: .ignoreUnknownCharacters) else { throw Problem.unreadable }
        let box = try AES.GCM.SealedBox(combined: sealed)
        return String(decoding: try AES.GCM.open(box, using: key), as: UTF8.self)
    }

    private static func compute(entriesJSON: String, rules: String, me: String) throws -> DiarySummary {
        guard let js = JSContext() else { throw Problem.unreadable }
        js.evaluateScript(rules) // defines globalThis.Goldies
        js.setObject(entriesJSON, forKeyedSubscript: "ENTRIES_JSON" as NSString)
        js.setObject(me, forKeyedSubscript: "ME" as NSString)
        let script = """
        (() => {
          const list = JSON.parse(ENTRIES_JSON), now = Date.now();
          const people = ["Vian", "Jovena"], other = people.find(p => p !== ME);
          const s = p => Goldies.score(list, p, now), mine = s(ME), theirs = s(other);
          const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
          const callsToday = list.filter(e => e.type === "call" && Date.parse(e.at) >= dayStart.getTime())
            .reduce((sum, e) => sum + (e.duration || 0), 0);
          let latest = null;
          const see = (at, what) => { const t = Date.parse(at); if (!latest || t > latest.at) latest = { at: t, what }; };
          for (const e of list) {
            if (e.status) continue;
            if (["note", "photo", "video", "voice"].includes(e.type) && !e.together && (e.by || e.author) === other)
              see(e.at, e.prompt ? "answered a question" : e.type === "photo" ? "added a picture" : e.type === "video" ? "added a video"
                : e.type === "voice" ? "sent a voice note" : "wrote a note");
            for (const r of e.replies || []) if (r.by === other) see(r.at, "replied");
          }
          return JSON.stringify({
            me: { name: ME, points: mine.points, crying: mine.crying },
            them: { name: other, points: theirs.points, crying: theirs.crying },
            streak: Goldies.streak(list, people, now),
            nextPenaltyAt: mine.shieldUntil ? null : mine.nextPenaltyAt,
            shieldUntil: mine.shieldUntil || null,
            callsToday, latest,
          });
        })()
        """
        guard let out = js.evaluateScript(script)?.toString(), js.exception == nil,
              let data = out.data(using: .utf8) else { throw Problem.unreadable }
        return try JSONDecoder().decode(DiarySummary.self, from: data)
    }
}
