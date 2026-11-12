// swift-tools-version: 6.0

import PackageDescription

// The iPhone app for our diary, and its widgets, built with xtool (see README.md).
let package = Package(
    name: "OurDiary",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project contains exactly one library product: the app.
        .library(
            name: "OurDiary",
            targets: ["OurDiary"]
        ),
        // The home-screen and lock-screen widgets (an app extension, see xtool.yml).
        .library(
            name: "OurDiaryWidget",
            targets: ["OurDiaryWidget"]
        ),
    ],
    targets: [
        // Reading, opening and writing the diary natively: shared by the app and the widgets.
        .target(
            name: "DiaryKit",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .target(
            name: "OurDiary",
            dependencies: ["DiaryKit"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .target(
            name: "OurDiaryWidget",
            dependencies: ["DiaryKit"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
