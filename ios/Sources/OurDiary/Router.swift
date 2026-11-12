#if canImport(UIKit)
import Foundation

/// Asks the diary page to do something: from a long-press shortcut, a widget button, a
/// Shortcut/Siri, or a tapped notification. The page runs it with `appAction(…)` (diary/core.js)
/// once it's loaded and unlocked; until then it waits.
///
/// Actions: "new" (write a page), "camera", "call" (FaceTime), "ping", "heart" (thinking of you),
/// "open:<page id>".
enum Router {
    static let action = Notification.Name("OurDiaryAction")

    static func perform(_ action: String) {
        NotificationCenter.default.post(name: Router.action, object: action)
    }

    /// ourdiary://new, ourdiary://camera, ourdiary://call, ourdiary://ping, ourdiary://heart,
    /// ourdiary://open/<page id>
    static func open(_ url: URL) {
        guard url.scheme == "ourdiary", let host = url.host else { return }
        switch host {
        case "new", "camera", "call", "ping", "heart": perform(host)
        case "open":
            let id = url.pathComponents.dropFirst().first ?? ""
            if !id.isEmpty { perform("open:\(id)") }
        default: break
        }
    }

    /// The UIApplicationShortcutItemType values in Info.plist.
    static func shortcut(_ type: String) {
        let action = type.replacingOccurrences(of: "com.vianshah.ourdiary.", with: "")
        if ["new", "camera", "call", "ping"].contains(action) { perform(action) }
    }
}
#endif
