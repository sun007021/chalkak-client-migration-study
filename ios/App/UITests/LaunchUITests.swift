import XCTest

/// 설정(Secrets.xcconfig)이 없는 CI에서도 크래시 없이 스플래시·로그인·설정 오류 중 하나가 보여야 한다.
@MainActor
final class LaunchUITests: XCTestCase {
    func testLaunchShowsSplashLoginOrConfigError() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))

        let candidates = ["login.root", "splash.logo", "config-error.root"].map { app.descendants(matching: .any)[$0] }
        let deadline = Date().addingTimeInterval(10)
        var found = false
        while !found && Date() < deadline {
            found = candidates.contains { $0.exists }
            if !found { _ = XCTWaiter.wait(for: [expectation(description: "poll")], timeout: 0.25) }
        }
        XCTAssertTrue(found, "login.root, splash.logo, config-error.root 중 하나가 나타나야 한다")
    }
}
