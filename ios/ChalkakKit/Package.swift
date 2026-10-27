// swift-tools-version: 6.0
import PackageDescription

// 플랫폼 독립 로직(상태 전이, 네트워크, DTO, ViewModel)은 모두 이 패키지에 둔다.
// Linux(Docker swift 이미지)와 macOS 양쪽에서 `swift test`로 돈다. UIKit·SwiftUI·Security는 쓰지 않는다.
let package = Package(
    name: "ChalkakKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "ChalkakCore", targets: ["ChalkakCore"]),
        .library(name: "ChalkakNetwork", targets: ["ChalkakNetwork"]),
        .library(name: "ChalkakData", targets: ["ChalkakData"]),
        .library(name: "ChalkakFeatures", targets: ["ChalkakFeatures"]),
    ],
    targets: [
        .target(name: "ChalkakCore"),
        // 테스트 전용 공용 Fake(TestClock 등). 앱 타깃·product에는 포함하지 않는다.
        .target(name: "ChalkakTestSupport", dependencies: ["ChalkakCore"]),
        .target(name: "ChalkakNetwork", dependencies: ["ChalkakCore"]),
        .target(name: "ChalkakData", dependencies: ["ChalkakCore", "ChalkakNetwork"]),
        .target(name: "ChalkakFeatures", dependencies: ["ChalkakCore", "ChalkakNetwork", "ChalkakData"]),
        .testTarget(name: "ChalkakCoreTests", dependencies: ["ChalkakCore", "ChalkakTestSupport"]),
        .testTarget(name: "ChalkakNetworkTests", dependencies: ["ChalkakCore", "ChalkakNetwork", "ChalkakTestSupport"]),
        .testTarget(name: "ChalkakDataTests", dependencies: ["ChalkakCore", "ChalkakNetwork", "ChalkakData", "ChalkakTestSupport"]),
        .testTarget(name: "ChalkakFeaturesTests", dependencies: ["ChalkakCore", "ChalkakNetwork", "ChalkakData", "ChalkakFeatures", "ChalkakTestSupport"]),
    ]
)
