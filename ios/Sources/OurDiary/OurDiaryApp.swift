import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Us ♥: the iPhone app for our diary. The diary itself is the website
/// (https://vianshah.github.io/for-you/diary/); the app is a full-screen window onto it,
/// plus what only an app can do: its own notifications (with reply), Face ID, widgets,
/// and long-press shortcuts.
@main
struct OurDiaryApp: App {
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var phase
    #endif

    var body: some Scene {
        WindowGroup {
            #if canImport(UIKit)
            DiaryView()
                .ignoresSafeArea() // the diary pads itself with the safe-area insets
                .onOpenURL { Router.open($0) } // ourdiary://… from widgets, Shortcuts and Siri
                .onChange(of: phase) { _, now in
                    if now == .active { BackgroundCheck.markSeen() }   // what's on screen needs no notification
                    if now == .background { BackgroundCheck.schedule() }
                }
            #else
            Text("Open Us ♥ on an iPhone.")
            #endif
        }
    }
}

#if canImport(UIKit)
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Notifications.setUp()
        BackgroundCheck.register() // has to happen before launching finishes
        return true
    }

    // Long-press shortcuts on the app icon (see UIApplicationShortcutItems in Info.plist).
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { Router.shortcut(item.type) } // the app was started by one
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        Router.shortcut(shortcutItem.type) // the app was already running
        completionHandler(true)
    }
}
#endif
