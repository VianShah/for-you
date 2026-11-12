import Foundation

/// Something new from the other one, worth a notification on this phone.
public struct DiaryNews {
    public let id: String          // stable, so the same thing never notifies twice
    public let pageID: String?     // the page it belongs to (tapping or replying goes there)
    public let title: String
    public let body: String
    public let canReply: Bool
    public let at: Date
}

extension DiaryKit {
    /// What the other one did since `since`: new pages, replies, dares, flowers, gifts and surprises.
    /// Notifications are made on this phone only, so they can show what was written.
    public static func news(in list: [[String: Any]], since: Date) -> [DiaryNews] {
        guard let me, let them = partner else { return [] }
        var out: [DiaryNews] = []
        let pageKinds = ["note", "photo", "video", "voice"]
        func answered(_ qid: String) -> Bool {
            list.contains { e in
                ((e["prompt"] as? [String: Any])?["id"] as? String) == qid &&
                    (e["together"] as? Bool == true || (e["author"] as? String) == me)
            }
        }
        func snippet(_ s: String?) -> String? {
            guard let s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
            return s.count > 160 ? String(s.prefix(157)) + "…" : s
        }

        for e in list {
            guard let id = e["id"] as? String, e["status"] == nil else { continue }
            let type = e["type"] as? String ?? ""
            let by = e["by"] as? String ?? e["author"] as? String

            // A new page from them
            if pageKinds.contains(type), e["together"] as? Bool != true, by == them, let at = date(e["at"]), at > since {
                if let prompt = e["prompt"] as? [String: Any] {
                    let q = prompt["q"] as? String ?? "a question"
                    let locked = (prompt["id"] as? String).map { !answered($0) } ?? false // answer it too to see theirs
                    out.append(DiaryNews(id: "page-\(id)", pageID: id, title: "💭 \(them) answered a question",
                                         body: locked ? "“\(q)” Answer it too to see theirs." : (snippet(e["text"] as? String) ?? q),
                                         canReply: !locked, at: at))
                } else {
                    let what: String = switch type {
                        case "photo": "📷 \(them) added a picture"
                        case "video": "🎬 \(them) added a video"
                        case "voice": "🎙 \(them) sent a voice note"
                        default: "💌 \(them) wrote a note"
                    }
                    let body = snippet(e["text"] as? String) ?? snippet(e["caption"] as? String) ?? snippet(e["title"] as? String) ?? "Open the diary to see it."
                    out.append(DiaryNews(id: "page-\(id)", pageID: id, title: what, body: body, canReply: true, at: at))
                }
            }

            // Replies from them, on any page
            for r in e["replies"] as? [[String: Any]] ?? [] {
                guard r["by"] as? String == them, let rid = r["id"] as? String, let at = date(r["at"]), at > since else { continue }
                let kind = r["kind"] as? String
                let body = snippet(r["text"] as? String) ?? (kind == "photo" ? "📷 a picture" : kind == "video" ? "🎬 a video" : kind == "voice" ? "🎙 a voice note" : "a reply")
                out.append(DiaryNews(id: "reply-\(rid)", pageID: id, title: "💬 \(them) replied", body: body, canReply: true, at: at))
            }

            // From the shop, for me
            if type == "buy", e["for"] as? String == me, e["cancelled"] == nil, let at = date(e["at"]), at > since {
                let note = snippet(e["note"] as? String)
                switch e["item"] as? String {
                case "coupon":
                    out.append(DiaryNews(id: "dare-\(id)", pageID: nil, title: "😈 \(them) dared you",
                                         body: note.map { "“\($0)” Open the shop to see the dare." } ?? "Open the shop to see the dare.", canReply: false, at: at))
                case "flowers":
                    out.append(DiaryNews(id: "flowers-\(id)", pageID: nil, title: "💐 \(them) sent you flowers",
                                         body: note ?? "Open the diary to see them.", canReply: false, at: at))
                case "gift":
                    let n = e["amount"] as? Int ?? 0
                    out.append(DiaryNews(id: "gift-\(id)", pageID: nil, title: "🎁 \(them) gifted you \(n) goldies", body: "Just because ♥", canReply: false, at: at))
                case "surprise":
                    out.append(DiaryNews(id: "surprise-\(id)", pageID: nil, title: "🎉 A surprise from \(them)", body: "Open the diary to see it.", canReply: false, at: at))
                default: break
                }
            }
        }
        return out.sorted { $0.at < $1.at }
    }
}
