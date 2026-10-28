import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 메인 화면(하단 탭 4개 + 가운데 업로드 버튼 + 쌓이는 화면)의 상태. screen_view/탭 이벤트는 `screens`로 보낸다.
///
/// 규칙(docs/spec/features/navigation.md):
/// - 처음 선택 탭은 홈. 게스트는 기록 탭이 막히고(토스트 `nav.guest.record`) 전시·홈·설정은 열린다.
/// - 업로드 버튼은 탭이 아니라 선택 표시를 바꾸지 않는다. 게스트는 게이트 호출 없이 토스트, 인증 사용자는 게이트를 1회 시작하고
///   확인 중 재탭은 무시한다. 게이트 결과: open → `.upload` 쌓기, declined → 문구 토스트, loginRequired → `needsLogin`.
/// - 쌓임 화면(`path`)이 있으면 하단 바는 숨는다. 같은 화면 연타는 한 번만 쌓고(같은 게시물이면 교체) 뒤로 가면 직전 탭으로 돌아간다.
/// - 게스트는 피드·알림함·피드백을 열 수 없다(토스트, 쌓임 없음, 네트워크 0건).
/// - 앱 자체 딥링크는 없다. `handleExternalURL`은 어떤 화면 이동도 만들지 않는다(REQ-NAV-034).
/// - 알림·푸시 목적지(`navigate(to:)`)는 D-11 표대로 홈 탭·게시물 상세·알림 상세·알림함으로 이동한다.
/// - 로그아웃·계정 전환(`resetForNewSession`)은 홈 탭·빈 쌓임·요청 없음으로 되돌린다.
@MainActor
@Observable
public final class MainShellViewModel: HomeNavigating, NotificationNavigating {
    public private(set) var access: MainAccess
    public private(set) var selectedTab: MainTab = .home
    public private(set) var path: [MainRoute] = []
    /// 전시 탭이 소비할 요청(홈 "더 보기").
    public private(set) var displayRequest: DisplayRequest?
    /// 기록 탭이 소비할 요청(홈 주간 기록 칸·"보러가기").
    public private(set) var recordRequest: RecordRequest?
    /// 홈이 소비할 요청(TOPIC 푸시: 맨 위 + 새로고침).
    public private(set) var homeRequest: HomeRequest?
    /// AI 결과 자동 열기 요청(AI 푸시·알림).
    public private(set) var aiResultRequest: AIResultRequest?
    /// 업로드 게이트가 갱신 후에도 401을 돌려줘 로그인 화면으로 가야 한다.
    public private(set) var needsLogin = false

    /// 하단 바는 탭 루트에서만 보인다.
    public var isBottomBarVisible: Bool { path.isEmpty }

    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let uploadGate: any UploadEntryGating
    @ObservationIgnored private var isCheckingUpload = false
    @ObservationIgnored private var requestSequence = 0
    /// 세션이 바뀔 때마다 올라간다. 이전 세션에서 시작한 게이트 결과를 버리는 데 쓴다.
    @ObservationIgnored private var sessionGeneration = 0

    public init(access: MainAccess, toast: any ToastPresenting, screens: ScreenTracker?, uploadGate: any UploadEntryGating) {
        self.access = access
        self.toast = toast
        self.screens = screens
        self.uploadGate = uploadGate
    }

    private var isGuest: Bool { access == .guest }

    @discardableResult
    public func selectTab(_ tab: MainTab) -> TabSelectionResult {
        if isGuest, tab == .record {
            toast.show(NavCopy.guestRecord)
            return .blocked
        }
        screens?.tabSelected(tab.analyticsDestination)
        guard tab != selectedTab else { return .reselected }
        selectedTab = tab
        return .selected
    }

    /// 가운데 업로드 버튼(= 홈 히어로 Empty 탭).
    public func startUpload() async {
        if isGuest {
            toast.show(NavCopy.guestUpload)
            return
        }
        guard !isCheckingUpload else { return }
        isCheckingUpload = true
        let generation = sessionGeneration
        let result = await uploadGate.checkEntry()
        guard generation == sessionGeneration else { return }
        isCheckingUpload = false
        switch result {
        case let .open(topicDate):
            if !path.contains(where: \.isUpload) { path.append(.upload(topicDate: topicDate)) }
        case let .declined(message):
            if let message { toast.show(message) }
        case .loginRequired:
            needsLogin = true
        }
    }

    public func openFeed(_ entry: PostDetailEntry) {
        if isGuest {
            toast.show(NavCopy.guestFeed)
            return
        }
        // 같은 게시물이 맨 위에 있으면 새로 쌓지 않고 교체한다.
        if case let .feed(top)? = path.last, top.postId == entry.postId {
            path[path.count - 1] = .feed(entry)
        } else {
            path.append(.feed(entry))
        }
    }

    public func openNotifications() {
        if isGuest {
            toast.show(NavCopy.guestNotification)
            return
        }
        push(.notifications)
    }

    public func openFeedback() {
        if isGuest {
            toast.show(NavCopy.guestFeedback)
            return
        }
        push(.feedback)
    }

    public func openIssue(url: URL) { push(.issue(url)) }

    public func openDisplay(date: KSTDate, sort: PostSort) {
        requestSequence += 1
        displayRequest = DisplayRequest(id: requestSequence, date: date, sort: sort)
        selectedTab = .display
    }

    public func openRecord(date: KSTDate?) {
        if isGuest {
            toast.show(NavCopy.guestRecord)
            return
        }
        requestSequence += 1
        recordRequest = RecordRequest(id: requestSequence, date: date)
        selectedTab = .record
    }

    public func openSignatureChange() { push(.changeSignature) }
    public func openSignaturePreview() { push(.changeSignaturePreview) }

    /// 맨 위 화면을 닫는다(뒤로 가기). 쌓임이 비면 아무 일도 없다.
    public func pop() {
        if !path.isEmpty { path.removeLast() }
    }

    /// 게시물 삭제 성공: 맨 위가 그 게시물 상세면 닫고 토스트 `nav.post-deleted`를 띄운다.
    public func postDeleted(postId: UUID) {
        guard case let .feed(entry)? = path.last, entry.postId == postId else { return }
        path.removeLast()
        toast.show(NavCopy.postDeleted)
    }

    /// 사인 변경 성공: 그리기·미리보기를 모두 닫고 설정으로 돌아간다.
    public func signatureChangeCompleted() {
        path.removeAll { $0 == .changeSignature || $0 == .changeSignaturePreview }
    }

    /// 앱 밖에서 들어온 URL. 앱은 자체 딥링크를 만들지 않으므로 화면 이동을 만들지 않고 false를 돌려준다(카카오 스킴 처리는 SDK 몫).
    @discardableResult
    public func handleExternalURL(_ url: URL) -> Bool { false }

    public func consumeDisplayRequest() -> DisplayRequest? {
        defer { displayRequest = nil }
        return displayRequest
    }

    public func consumeRecordRequest() -> RecordRequest? {
        defer { recordRequest = nil }
        return recordRequest
    }

    public func consumeNeedsLogin() { needsLogin = false }

    /// 알림함 행 탭·푸시 탭의 목적지로 이동한다(D-11).
    /// - `.home`: 쌓임을 비우고 홈 탭으로(이미 홈이면 더 쌓지 않음). `refreshing`이면 `homeRequest`를 새로 만든다.
    /// - `.post`: 맨 위가 같은 게시물 상세면 교체, 아니면 `.feed(.mine(postId, nil))`을 쌓는다. `opensAIResult`면 `aiResultRequest`를 만든다.
    /// - `.notificationDetail`: 같은 상세가 맨 위면 쌓지 않는다.
    /// - `.inbox`: 이미 쌓여 있으면 그 위의 화면만 닫고, 없으면 쌓는다. 게스트는 토스트 `NavCopy.guestNotification`.
    public func navigate(to destination: NotificationDestination) {
        switch destination {
        case let .home(refreshing):
            selectedTab = .home
            path = []
            if refreshing {
                // 이미 홈이어도 연속 탭마다 새 요청이 생겨 홈이 다시 새로고침한다.
                requestSequence += 1
                homeRequest = HomeRequest(id: requestSequence)
            }
        case let .post(postId, opensAIResult):
            // 게스트 차단(토스트)과 같은 게시물 교체는 `openFeed`가 한다. 차단되면 AI 결과 요청도 만들지 않는다.
            openFeed(.mine(postId: postId, thumbnailURL: nil))
            if opensAIResult, !isGuest {
                requestSequence += 1
                aiResultRequest = AIResultRequest(id: requestSequence, postId: postId)
            }
        case let .notificationDetail(notificationId):
            guard !isGuest else { return toast.show(NavCopy.guestNotification) }
            push(.notificationDetail(notificationId: notificationId))
        case .inbox:
            guard !isGuest else { return toast.show(NavCopy.guestNotification) }
            if let index = path.lastIndex(of: .notifications) {
                path.removeSubrange((index + 1)...) // 알림함이 이미 있으면 그 위의 화면만 닫는다.
            } else {
                path.append(.notifications)
            }
        }
    }

    public func consumeHomeRequest() -> HomeRequest? {
        defer { homeRequest = nil }
        return homeRequest
    }

    public func consumeAIResultRequest() -> AIResultRequest? {
        defer { aiResultRequest = nil }
        return aiResultRequest
    }

    /// 로그아웃·재인증·계정 전환·게스트→로그인: 홈 탭, 빈 쌓임, 요청 없음으로 되돌린다.
    public func resetForNewSession(access: MainAccess) {
        sessionGeneration += 1
        isCheckingUpload = false
        self.access = access
        selectedTab = .home
        path = []
        displayRequest = nil
        recordRequest = nil
        homeRequest = nil
        aiResultRequest = nil
        needsLogin = false
    }

    /// 같은 화면이 맨 위에 있으면 연타로 보고 쌓지 않는다.
    private func push(_ route: MainRoute) {
        if path.last != route { path.append(route) }
    }
}

private extension MainRoute {
    var isUpload: Bool {
        if case .upload = self { true } else { false }
    }
}
