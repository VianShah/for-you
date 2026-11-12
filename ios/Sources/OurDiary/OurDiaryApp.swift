import SwiftUI

/// Us ♥: the iPhone app for our diary. The diary itself is the website
/// (https://vianshah.github.io/for-you/diary/); the app is a full-screen window
/// onto it, with the iPhone's camera, FaceTime and sharing wired in.
@main
struct OurDiaryApp: App {
    var body: some Scene {
        WindowGroup {
            #if canImport(UIKit)
            DiaryView()
                .ignoresSafeArea() // the diary pads itself with the safe-area insets
            #else
            Text("Open Us ♥ on an iPhone.")
            #endif
        }
    }
}
