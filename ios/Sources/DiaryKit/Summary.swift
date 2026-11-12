import Foundation
import JavaScriptCore

/// The numbers the widgets and notifications use, worked out by the diary's own goldie rules
/// (diary/goldies.js, run in JavaScriptCore), so they always agree with the diary.
public struct DiarySummary: Codable {
    public struct Person: Codable {
        public var name: String
        public var points: Int
        public var crying: Bool
        public init(name: String, points: Int, crying: Bool) { self.name = name; self.points = points; self.crying = crying }
    }
    public struct Latest: Codable {
        public var at: Double      // ms since 1970
        public var what: String    // "replied", "added a picture"…
        public init(at: Double, what: String) { self.at = at; self.what = what }
    }
    public var me: Person
    public var them: Person
    public var streak: Int
    public var nextPenaltyAt: Double?   // ms; when my next −50 lands (sleep time already counted in)
    public var shieldUntil: Double?
    public var callsToday: Int          // seconds
    public var latest: Latest?

    public var nextPenalty: Date? { nextPenaltyAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    public var shieldEnds: Date? { shieldUntil.map { Date(timeIntervalSince1970: $0 / 1000) } }
    public var latestDate: Date? { latest.map { Date(timeIntervalSince1970: $0.at / 1000) } }

    public init(me: Person, them: Person, streak: Int, nextPenaltyAt: Double?, shieldUntil: Double?, callsToday: Int, latest: Latest?) {
        self.me = me; self.them = them; self.streak = streak; self.nextPenaltyAt = nextPenaltyAt
        self.shieldUntil = shieldUntil; self.callsToday = callsToday; self.latest = latest
    }
}

extension DiaryKit {
    /// Reads the diary and works out the summary; keeps the last good one for when the internet doesn't.
    public static func summary() async throws -> DiarySummary {
        guard let me else { throw Problem.notSetUp }
        async let entriesFile = entriesJSON()
        async let rulesFile = fetchRaw("diary/goldies.js")
        let (entries, rules) = try await (entriesFile, rulesFile)
        let summary = try compute(entriesJSON: String(decoding: entries, as: UTF8.self), rules: String(decoding: rules, as: UTF8.self), me: me)
        if let data = try? JSONEncoder().encode(summary) { shared?.set(data, forKey: "lastSummary") }
        return summary
    }

    public static func cachedSummary() -> DiarySummary? {
        guard let data = shared?.data(forKey: "lastSummary") else { return nil }
        return try? JSONDecoder().decode(DiarySummary.self, from: data)
    }

    static func compute(entriesJSON: String, rules: String, me: String) throws -> DiarySummary {
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
