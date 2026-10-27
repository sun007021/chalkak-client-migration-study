import Foundation
import Testing
import ChalkakCore

@Suite("분석 이벤트 모델")
struct AnalyticsModelTests {
    /// D-22 / TC-ANL-002의 허용 목록. 구현 상수와 별개로 테스트 안에 철자까지 고정한다.
    static let allowedScreenNames: Set<String> = [
        "login", "terms", "terms_of_service", "privacy_policy",
        "onboarding_signature", "onboarding_signature_preview",
        "change_signature", "change_signature_preview",
        "home", "issue", "notifications", "notification_detail",
        "display", "feed", "record", "settings", "feedback",
        "photo_upload", "photo_upload_success",
    ]

    @Test("TC-ANL-002 screen_name 허용 목록은 정확히 19종이고 철자가 같다")
    func screenNamesMatchAllowList() {
        let names = AnalyticsScreen.allCases.map(\.rawValue)
        #expect(names.count == 19)
        #expect(Set(names) == Self.allowedScreenNames)
    }

    @Test("TC-ANL-001 화면 진입은 screen_view 이름과 screen_name 파라미터로 표현된다", arguments: AnalyticsScreen.allCases)
    func screenViewEvent(screen: AnalyticsScreen) {
        let event = AnalyticsEvent.screenView(screen, screenClass: nil)
        #expect(event.name == "screen_view")
        #expect(event.parameters == ["screen_name": screen.rawValue])
    }

    @Test("TC-ANL-012 screen_class는 선택 파라미터이고 그 외 키는 없다")
    func screenClassIsOptional() {
        let event = AnalyticsEvent.screenView(.home, screenClass: "HomeView")
        #expect(event.parameters == ["screen_name": "home", "screen_class": "HomeView"])
    }

    @Test("TC-ANL-012 모든 화면의 파라미터는 허용 키뿐이고 개인정보·토큰·ID 키가 없다", arguments: AnalyticsScreen.allCases)
    func parametersContainNoPersonalData(screen: AnalyticsScreen) {
        let keys = Set(AnalyticsEvent.screenView(screen, screenClass: "X").parameters.keys)
        #expect(keys.isSubset(of: ["screen_name", "screen_class"]))
        #expect(keys.contains("screen_name"))
        for forbidden in ["user_id", "userId", "email", "token", "post_id", "nickname", "uid"] {
            #expect(!keys.contains(forbidden))
        }
    }

    @Test("TC-ANL-013 destination은 home, display, record, settings 4종뿐이다")
    func destinationsAreFour() {
        #expect(Set(AnalyticsDestination.allCases.map(\.rawValue)) == ["home", "display", "record", "settings"])
        #expect(AnalyticsDestination.allCases.count == 4)
    }

    @Test("TC-ANL-013 탭 이벤트는 bottom_navigation_selected와 destination 파라미터다", arguments: AnalyticsDestination.allCases)
    func tabEvent(destination: AnalyticsDestination) {
        let event = AnalyticsEvent.bottomNavigationSelected(destination)
        #expect(event.name == "bottom_navigation_selected")
        #expect(event.parameters == ["destination": destination.rawValue])
    }

    @Test("TC-ANL-015 업로드 버튼용 destination은 존재하지 않는다")
    func noUploadDestination() {
        #expect(AnalyticsDestination(rawValue: "upload") == nil)
        #expect(AnalyticsDestination(rawValue: "photo_upload") == nil)
    }

    @Test("TC-ANL-022 이벤트 파라미터에 사용자 식별자 키가 없다 (게스트·회원 동일 이벤트)")
    func eventsAreIdenticalForGuestAndMember() {
        // ScreenTracker/AnalyticsTracker에는 사용자 정보를 받는 API가 없다. 같은 호출은 같은 이벤트를 만든다.
        let guest = SpyAnalyticsTracker()
        let member = SpyAnalyticsTracker()
        ScreenTracker(tracker: guest).screenAppeared(.home)
        ScreenTracker(tracker: member).screenAppeared(.home)
        #expect(guest.events == member.events)
        #expect(guest.events == [.screenView(.home, screenClass: nil)])
    }
}

@Suite("LogAnalyticsTracker")
struct LogAnalyticsTrackerTests {
    @Test("TC-ANL-020 기본 구현은 로그 한 줄로 출력하고 던지지 않는다")
    func logsScreenView() throws {
        let sink = LogSink()
        let tracker = LogAnalyticsTracker(log: { sink.append($0) })
        try tracker.track(.screenView(.home, screenClass: nil))
        #expect(sink.lines == ["[Analytics] screen_view screen_name=home"])
    }

    @Test("TC-ANL-020 파라미터는 키 오름차순으로 출력한다")
    func logsSortedParameters() throws {
        let sink = LogSink()
        let tracker = LogAnalyticsTracker(log: { sink.append($0) })
        try tracker.track(.screenView(.feed, screenClass: "FeedView"))
        try tracker.track(.bottomNavigationSelected(.record))
        #expect(sink.lines == [
            "[Analytics] screen_view screen_class=FeedView screen_name=feed",
            "[Analytics] bottom_navigation_selected destination=record",
        ])
    }

    @Test("TC-ANL-020 기본 log 인자(print)로도 크래시하지 않는다")
    func defaultLoggerDoesNotCrash() throws {
        try LogAnalyticsTracker().track(.screenView(.login, screenClass: nil))
    }
}

@Suite("ScreenTracker 중복 방지")
struct ScreenTrackerTests {
    @Test("TC-ANL-018 같은 화면이 여러 번 그려져도 screen_view는 1회다")
    func repeatedAppearSendsOnce() {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        for _ in 0..<10 { tracker.screenAppeared(.home) }
        #expect(spy.events == [.screenView(.home, screenClass: nil)])
    }

    @Test("TC-ANL-017 다른 화면으로 갔다가 복귀하면 다시 전송한다")
    func returningSendsAgain() {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        tracker.screenAppeared(.home)
        tracker.screenAppeared(.feed)
        tracker.screenAppeared(.feed)
        tracker.screenAppeared(.home)
        tracker.screenAppeared(.home)
        #expect(spy.events == [
            .screenView(.home, screenClass: nil),
            .screenView(.feed, screenClass: nil),
            .screenView(.home, screenClass: nil),
        ])
    }

    @Test("TC-ANL-017 screenClass가 있으면 함께 전송한다")
    func carriesScreenClass() {
        let spy = SpyAnalyticsTracker()
        ScreenTracker(tracker: spy).screenAppeared(.settings, screenClass: "SettingsView")
        #expect(spy.events == [.screenView(.settings, screenClass: "SettingsView")])
    }

    @Test("TC-ANL-017 reset 후에는 같은 화면도 다시 전송한다")
    func resetAllowsResend() {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        tracker.screenAppeared(.home)
        tracker.reset()
        tracker.screenAppeared(.home)
        #expect(spy.events.count == 2)
    }

    @Test("TC-ANL-013 탭 선택은 선택마다 1회씩 전송한다 (재선택 포함)")
    func tabSelectionSendsEveryTime() {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        for destination in AnalyticsDestination.allCases { tracker.tabSelected(destination) }
        tracker.tabSelected(.home)
        #expect(spy.events == [
            .bottomNavigationSelected(.home), .bottomNavigationSelected(.display),
            .bottomNavigationSelected(.record), .bottomNavigationSelected(.settings),
            .bottomNavigationSelected(.home),
        ])
    }

    @Test("TC-ANL-018 탭 이벤트는 화면 중복 방지 기억에 영향을 주지 않는다")
    func tabEventDoesNotResetDedup() {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        tracker.screenAppeared(.home)
        tracker.tabSelected(.home)
        tracker.screenAppeared(.home)
        #expect(spy.events == [.screenView(.home, screenClass: nil), .bottomNavigationSelected(.home)])
    }

    @Test("TC-ANL-021 tracker가 throw해도 호출 측에 전파되지 않고 이후 호출도 계속 시도한다")
    func trackerErrorsAreSwallowed() {
        let boom = ThrowingAnalyticsTracker()
        let tracker = ScreenTracker(tracker: boom)
        tracker.screenAppeared(.home)
        tracker.tabSelected(.display)
        tracker.screenAppeared(.feed)
        #expect(boom.attempts == 3)
    }

    @Test("TC-ANL-021 실패는 onError로만 알린다")
    func errorsReportedViaCallback() {
        let sink = LogSink()
        let tracker = ScreenTracker(tracker: ThrowingAnalyticsTracker(), onError: { sink.append("\($0)") })
        tracker.screenAppeared(.home)
        #expect(sink.lines.count == 1)
    }

    @Test("TC-ANL-021 전송에 실패한 화면도 중복 방지 기억에 남아 같은 화면 재호출에서 재시도 폭주하지 않는다")
    func failedSendStillCountsAsShown() {
        let boom = ThrowingAnalyticsTracker()
        let tracker = ScreenTracker(tracker: boom)
        tracker.screenAppeared(.home)
        tracker.screenAppeared(.home)
        #expect(boom.attempts == 1)
    }

    @Test("TC-ANL-018 여러 스레드에서 동시에 호출해도 같은 화면은 1회다")
    func concurrentAppearSendsOnce() async {
        let spy = SpyAnalyticsTracker()
        let tracker = ScreenTracker(tracker: spy)
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<50 { group.addTask { tracker.screenAppeared(.display) } }
        }
        #expect(spy.events.count == 1)
    }
}
