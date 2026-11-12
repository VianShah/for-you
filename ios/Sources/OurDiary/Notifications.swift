#if canImport(UIKit)
import BackgroundTasks
import DiaryKit
import UIKit
import UserNotifications
import WidgetKit

/// The app's own notifications. They're made on this phone, from the diary itself, so they can
/// show what was written, and you can reply (or ❤️) right from the lock screen.
enum Notifications {
    static let pageCategory = "page"

    static func setUp() {
        let center = UNUserNotificationCenter.current()
        center.delegate = NotificationHandler.shared
        let reply = UNTextInputNotificationAction(identifier: "reply", title: "Reply", options: [.authenticationRequired],
                                                  textInputButtonTitle: "Send", textInputPlaceholder: "write a reply…")
        let heart = UNNotificationAction(identifier: "heart", title: "❤️", options: [.authenticationRequired])
        center.setNotificationCategories([UNNotificationCategory(identifier: pageCategory, actions: [reply, heart], intentIdentifiers: [])])
    }

    /// Asked once, the first time the diary is unlocked in the app.
    static func ask() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    static func post(_ news: DiaryNews) {
        let content = UNMutableNotificationContent()
        content.title = news.title
        content.body = news.body
        content.sound = .default
        if let page = news.pageID {
            content.threadIdentifier = page            // a page's replies stack together
            content.userInfo = ["page": page]
        } else {
            content.userInfo = ["shop": news.id.hasPrefix("dare-")]
        }
        if news.canReply { content.categoryIdentifier = pageCategory }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: news.id, content: content, trigger: nil))
    }

    static func say(_ title: String, _ body: String, id: String = UUID().uuidString) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    /// "−50 in 30 minutes": set again after every check, so it always matches the diary.
    static func remindBeforePenalty(at penalty: Date?) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["penalty"])
        guard let penalty else { return }
        let when = penalty.addingTimeInterval(-30 * 60).timeIntervalSinceNow
        guard when > 60 else { return }
        let content = UNMutableNotificationContent()
        content.title = "⏳ −50 in 30 minutes"
        content.body = "Write something, and Goldiee stays happy ♥"
        content.sound = .default
        center.add(UNNotificationRequest(identifier: "penalty", content: content,
                                         trigger: UNTimeIntervalNotificationTrigger(timeInterval: when, repeats: false)))
    }
}

/// Taps, replies and ❤️ on the notifications.
final class NotificationHandler: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationHandler()

    // The diary is on screen: it already shows what's new, so no banner.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let page = info["page"] as? String
        switch response.actionIdentifier {
        case "reply":
            guard let page, let text = (response as? UNTextInputNotificationResponse)?.userText else { return completionHandler() }
            inBackground("reply", done: completionHandler) {
                do { try await DiaryKit.reply(to: page, text: text) }
                catch { Notifications.say("Your reply didn't send", "Open the diary and try again: “\(text.prefix(60))”") }
            }
        case "heart":
            guard let page else { return completionHandler() }
            inBackground("heart", done: completionHandler) { try? await DiaryKit.heart(pageID: page) }
        default: // tapped: open that page (or the shop for a dare)
            if let page { Router.perform("open:\(page)") }
            else if info["shop"] as? Bool == true { Router.perform("shop") }
            completionHandler()
        }
    }

    /// Lets a reply finish sending even if the phone goes back to sleep straight away.
    private func inBackground(_ name: String, done: @escaping () -> Void, work: @escaping () async -> Void) {
        let id = UIApplication.shared.beginBackgroundTask(withName: name)
        Task {
            await work()
            done()
            UIApplication.shared.endBackgroundTask(id)
        }
    }
}

/// While the app is closed, iOS wakes it now and then (roughly every 15 minutes to a few hours,
/// depending on how often it's used) to look at the diary and notify what's new.
enum BackgroundCheck {
    static let taskID = "com.vianshah.ourdiary.refresh"
    private static var lastSeen: Date? {
        get { DiaryKit.shared?.object(forKey: "lastSeen") as? Date }
        set { DiaryKit.shared?.set(newValue, forKey: "lastSeen") }
    }

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskID, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            schedule()
            let work = Task {
                await run()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func schedule() {
        guard DiaryKit.isSetUp else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// The app is open: everything up to now has been seen.
    static func markSeen() {
        lastSeen = Date()
    }

    static func run() async {
        guard DiaryKit.isSetUp, let list = try? await DiaryKit.entries() else { return }
        let since = lastSeen ?? Date()
        lastSeen = Date()
        // Newest few only, so a long time away doesn't bring a flood.
        for news in DiaryKit.news(in: list, since: since).suffix(6) { Notifications.post(news) }
        if let summary = try? await DiaryKit.summary() {
            let wasCrying = DiaryKit.shared?.bool(forKey: "wasCrying") ?? false
            if summary.me.crying && !wasCrying {
                Notifications.say("😢 Goldiee is crying", "You're at \(summary.me.points) goldies. Write something to cheer her up?", id: "crying")
            }
            DiaryKit.shared?.set(summary.me.crying, forKey: "wasCrying")
            Notifications.remindBeforePenalty(at: summary.nextPenalty)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}
#endif
