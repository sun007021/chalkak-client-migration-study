import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 설정 탭 섹션. `allCases` 순서가 화면 순서다(REQ-SET-001).
public enum SettingsSection: Sendable, Equatable, CaseIterable {
    case app        // 사인 카드
    case push       // 푸시 스위치 3개
    case account    // 로그아웃·회원탈퇴
    case feedback   // 피드백 보내기
    case info       // 개인정보처리방침·이용약관·버전정보
}

public enum PushSettingsState: Sendable, Equatable {
    /// 조회 중(또는 아직 조회 전). 스위치는 눌리지 않는다(REQ-SET-008).
    case loading
    /// 서버 값이 반영됐다.
    case ready
    /// 조회 실패 또는 계약 위반 응답. 값을 지어내지 않고 스위치는 눌리지 않는다(REQ-SET-010).
    case failed
}

/// 설정 탭의 ViewModel. docs/spec/features/settings-feedback.md REQ-SET-001~021, 테스트: TC-SET-*.
///
/// 구성
/// - `signature`(사인 카드, 기존 `SignatureCardViewModel`)와 `account`(로그아웃·탈퇴, 기존 `AccountSessionViewModel`)를 그대로 들고 있다. 이 ViewModel은 둘을 새로 구현하지 않고 부르기만 한다.
/// - 푸시 수신 설정 세 항목은 `NotificationSettingsRepository`로 읽고 쓴다.
///
/// 규칙 요약
/// - 게스트(`access == .guest`): `sections`가 비고 `showsLoginButton`만 true. 어떤 API도 부르지 않는다(사인·푸시 설정 0건, REQ-SET-002). 분석 `screen_view(settings)`는 보낸다.
/// - 회원 `screenAppeared()`: `screen_view(settings)` 전송 → 사인 조회와 푸시 설정 조회를 **서로 독립으로 동시에** 시작하고 둘 다 끝나면 돌아온다.
///   한쪽 실패가 다른 쪽 표시를 막지 않는다(TC-SET-002, TC-SET-051). 이미 조회 중이면 같은 조회를 또 보내지 않는다.
/// - 푸시 조회: 시작하면 `pushState == .loading`. 성공 `.ready`. 실패/계약 위반(`APIError.invalidResponse`)은 `.failed` + 값 비움 + 토스트 `settings.push.load-error`
///   (401·취소는 토스트 없음, 401은 `needsLogin`). 재조회 실패 때 이전 값을 남기지 않는다(TC-SET-033).
/// - `toggle(_:to:)`: `.ready`가 아니거나 현재 값과 같으면 아무것도 하지 않는다(PATCH 0건, 빈 PATCH 금지 TC-SET-036). 같은 항목이 저장 중이면 무시(REQ-SET-014).
///   기기 권한은 **누른 시점에** `permission.status()`로 확인한다:
///   - 켜려는데 `.denied`: 값·서버를 바꾸지 않고 `systemSettings.openNotificationSettings()` 1회(REQ-SET-015). `.authorized`면 열지 않는다.
///   - 켜려는데 `.notDetermined`: `requestAuthorization()`; 허용이면 저장 진행, 거부면 켜지 않고 PATCH도 없다(REQ-SET-018).
///   - 끄는 것은 권한과 무관하게 저장 흐름(REQ-SET-016).
///   저장 흐름: 응답을 기다리지 않고 즉시 새 값으로 바꾸고(낙관적, REQ-SET-011) 그 항목만 `repository.update`로 PATCH한다. 성공이면 서버 값으로 덮어쓰지 않는다.
///   실패하면 **그 항목만** 이전 값으로 되돌리고 토스트 `settings.push.save-error`(다른 항목의 값·진행 중 요청은 그대로, REQ-SET-013). 항목마다 독립이라 동시에 저장할 수 있다(REQ-SET-014).
///   401은 되돌리되 토스트 없이 `needsLogin`. 취소는 되돌리되 토스트 없음.
/// - `screenDisappeared()`: 진행 중인 모든 조회·저장을 취소한다. 저장 중이던 항목은 이전 값으로 되돌고 오류 토스트는 없다(TC-SET-030).
/// - `viewerDidChange()`: 로그아웃·계정 전환. 푸시 값·사인 이미지를 비우고(`pushState == .loading`) 진행 중 작업을 취소하며, 이전 계정의 늦은 응답은 반영하지 않는다(TC-SET-031·032).
///   `screenAppeared()`도 시작할 때 계정이 달라졌으면 같은 정리를 먼저 한다(TC-SET-037).
/// - `viewDocument(_:)`: `LegalDocumentRouting`대로(inApp이면 `presentedDocument`, external이면 `externalOpener`, 열 수 없으면 토스트 `onb.terms.doc.cannot-open`),
///   inApp일 때 문서 `screen_view`(`privacy_policy`/`terms_of_service`)를 보낸다. 로그인 여부와 무관하게 네트워크 호출은 없다.
@MainActor
@Observable
public final class SettingsViewModel {
    public let access: MainAccess
    /// 사인 카드(조회 상태). "변경하기" 이동은 앱이 처리한다.
    public let signature: SignatureCardViewModel
    /// 로그아웃·탈퇴 유스케이스.
    public let account: AccountSessionViewModel

    /// 회원이면 `SettingsSection.allCases` 순서 그대로, 게스트면 빈 배열(REQ-SET-001·002).
    public var sections: [SettingsSection] { access == .member ? SettingsSection.allCases : [] }
    /// 게스트에게만 보이는 "로그인" 버튼. 누르면 앱이 `AppLaunchViewModel.loginFromGuest()`를 부른다.
    public var showsLoginButton: Bool { access == .guest }

    public private(set) var pushState: PushSettingsState = .loading
    /// 마지막으로 확인한 기기 알림 권한(조회 전·게스트는 nil). `screenAppeared`와 `appBecameActive`가 갱신한다(REQ-SET-017).
    public private(set) var devicePermission: PushAuthorizationStatus?
    /// 앞 `screenAppeared` 이후 갱신 후에도 401을 받았다 — 앱이 로그인 화면으로 보낸다.
    public private(set) var needsLogin = false
    /// 앱 안 웹뷰로 열린 약관 문서. `documentDismissed()`로 닫는다.
    public private(set) var presentedDocument: TermsDocumentPresentation?

    /// 버전정보 행의 값(접두 없이 버전 문자열 그대로, 확인 필요 4번). 탭해도 동작 없음(REQ-SET-005).
    public var versionText: String { appVersion }

    /// 스위치에 보일 값. 조회 실패(`.failed`)이거나 받은 적 없으면 nil(값을 지어내지 않는다). 저장 중인 항목은 낙관적 새 값이다.
    /// 재조회 중(`.loading`)에는 직전에 받은 값을 비활성으로 계속 보인다 — 명세 확인 대상: REQ-SET-008은 "로딩 중 스위치 비활성화"만 정하고 값을 숨길지는 정하지 않았다.
    public func pushValue(_ kind: NotificationSettingKind) -> Bool? {
        pushState == .failed ? nil : settings?.value(of: kind)
    }
    /// 스위치를 누를 수 있는가: `.ready`일 때만 true(저장 중인 항목 때문에 다른 스위치가 꺼지지 않는다, TC-SET-029).
    public var isPushEnabled: Bool { pushState == .ready }

    @ObservationIgnored private let viewer: any ViewerContext
    @ObservationIgnored private let repository: any NotificationSettingsRepository
    @ObservationIgnored private let permission: any PushAuthorizationProviding
    @ObservationIgnored private let systemSettings: any SystemSettingsOpening
    @ObservationIgnored private let externalOpener: any ExternalURLOpening
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let appVersion: String
    @ObservationIgnored private let documentURLs: [LegalDocument: String]?
    @ObservationIgnored private let activeWork = ActiveWork()
    /// 서버에서 받아 반영 중인 값(낙관적 변경 포함). `.ready`가 아니면 보이지 않고, 조회 실패·계정 전환 때 비운다.
    private var settings: NotificationSettings?
    /// 계정이 바뀔 때마다 올라가는 세대. 이전 계정의 저장 응답이 새 계정 값을 바꾸지 못하게 한다.
    @ObservationIgnored private var generation = 0
    /// 푸시 조회마다(그리고 화면이 가려지거나 계정이 바뀔 때) 올라가는 세대. 낡은 조회 응답을 버린다.
    @ObservationIgnored private var loadGeneration = 0
    @ObservationIgnored private var isLoadingPush = false
    /// 저장 흐름(권한 확인 포함)이 진행 중인 항목과 그 저장의 번호. 같은 항목의 추가 입력을 무시하는 데 쓴다.
    @ObservationIgnored private var inFlight: [NotificationSettingKind: Int] = [:]
    @ObservationIgnored private var saveSequence = 0
    /// 마지막으로 본 계정(소문자 userId). 달라지면 이전 계정의 값을 버린다.
    @ObservationIgnored private var owner: String?

    /// - Parameter documentURLs: 기본은 `LegalDocument.urlString`. 테스트가 외부 URL 분기를 만들 때 바꾼다.
    public init(
        access: MainAccess,
        viewer: any ViewerContext,
        repository: any NotificationSettingsRepository,
        signature: SignatureCardViewModel,
        account: AccountSessionViewModel,
        permission: any PushAuthorizationProviding,
        systemSettings: any SystemSettingsOpening,
        externalOpener: any ExternalURLOpening,
        toast: any ToastPresenting,
        screens: ScreenTracker?,
        appVersion: String,
        documentURLs: [LegalDocument: String]? = nil
    ) {
        self.access = access
        self.viewer = viewer
        self.repository = repository
        self.signature = signature
        self.account = account
        self.permission = permission
        self.systemSettings = systemSettings
        self.externalOpener = externalOpener
        self.toast = toast
        self.screens = screens
        self.appVersion = appVersion
        self.documentURLs = documentURLs
        owner = viewer.userId?.lowercased()
    }

    // MARK: 생명주기

    /// 설정 탭이 보일 때마다(REQ-SET-003·004·008). 위 "규칙 요약" 참고. 모든 조회가 끝나면 돌아온다.
    public func screenAppeared() async {
        screens?.screenAppeared(.settings)
        guard access == .member else { return }
        syncOwner()
        // 사인·푸시·권한 확인은 서로 독립이다. 한쪽이 느리거나 실패해도 다른 쪽을 막지 않는다.
        async let signatureLoad: Void = signature.screenAppeared()
        async let pushLoad: Void = loadPush()
        async let permissionCheck: Void = refreshDevicePermission()
        _ = await (signatureLoad, pushLoad, permissionCheck)
    }

    /// 설정 탭이 가려질 때. 진행 중인 조회·저장을 취소한다.
    public func screenDisappeared() {
        // 곧바로 다시 보여도 새로 조회할 수 있게 진행 상태를 즉시 푼다. 저장은 취소되어 `toggle`이 그 항목을 되돌린다.
        loadGeneration += 1
        isLoadingPush = false
        signature.onDisappear()
        activeWork.cancel()
    }

    /// 앱이 포그라운드로 돌아올 때: 기기 알림 권한 상태만 다시 확인한다. 스위치 값은 서버 값 그대로 둔다(REQ-SET-017).
    public func appBecameActive() async {
        guard access == .member else { return }
        await refreshDevicePermission()
    }

    /// 로그아웃·계정 전환.
    public func viewerDidChange() {
        syncOwner()
    }

    // MARK: 푸시 수신 설정

    /// 푸시 조회가 `.failed`일 때 "다시 시도"(TC-SET-016): 다시 조회한다. 사인 카드는 건드리지 않는다.
    public func retryPushSettings() async {
        guard access == .member, pushState == .failed else { return }
        await loadPush()
    }

    /// 스위치 입력. 위 "규칙 요약" 참고. 저장이 끝날 때까지(또는 취소될 때까지) 돌아오지 않는다.
    public func toggle(_ kind: NotificationSettingKind, to enabled: Bool) async {
        guard access == .member else { return }
        syncOwner()
        // 값이 없거나(조회 전·실패·재조회 중) 같은 값이면 보내지 않는다. 같은 항목이 저장 중이면 입력을 무시한다.
        guard pushState == .ready, let previous = settings?.value(of: kind), previous != enabled, inFlight[kind] == nil else { return }
        saveSequence += 1
        let id = saveSequence
        let ticket = generation
        inFlight[kind] = id
        await activeWork.run { [self] in
            defer { if inFlight[kind] == id { inFlight[kind] = nil } }
            if enabled {
                guard await isPermitted(), ticket == generation, !Task.isCancelled else { return }
            }
            // 권한을 기다리는 동안 값이 바뀌었을 수 있다(조회 실패·계정 전환 등).
            guard pushState == .ready, settings?.value(of: kind) == previous else { return }
            settings = settings?.setting(kind, to: enabled)
            do {
                try await repository.update(kind, enabled: enabled)
            } catch {
                guard ticket == generation else { return }
                // 저장 중 재조회가 실패했거나 다른 값이 들어왔으면 그 값을 덮어쓰지 않는다.
                if pushState == .ready, settings?.value(of: kind) == enabled {
                    settings = settings?.setting(kind, to: previous)
                }
                handleSaveFailure(error)
            }
        }
    }

    // MARK: 약관 문서

    public func viewDocument(_ document: LegalDocument) async {
        switch LegalDocumentRouting.route(for: documentURLs?[document] ?? document.urlString) {
        case .inApp(let url):
            presentedDocument = TermsDocumentPresentation(document: document, url: url, title: document.title)
            screens?.screenAppeared(document.analyticsScreen)
        case .external(let url):
            if await !externalOpener.open(url) { toast.show(OnboardingCopy.termsDocCannotOpen) }
        case .unopenable:
            toast.show(OnboardingCopy.termsDocCannotOpen)
        }
    }

    public func documentDismissed() {
        presentedDocument = nil
    }

    /// 앱이 `needsLogin`을 소비(로그인 화면으로 이동)한 뒤 false로 되돌린다.
    public func consumeNeedsLogin() {
        needsLogin = false
    }

    // MARK: 내부

    private func refreshDevicePermission() async {
        devicePermission = await permission.status()
    }

    /// 켜도 되는가. 권한은 누른 시점에 확인한다: 거부면 시스템 설정을 열고 false, 미결정이면 시스템 요청 결과, 허용이면 true.
    private func isPermitted() async -> Bool {
        let ticket = generation
        switch await permission.status() {
        case .authorized:
            return true
        case .denied:
            if ticket == generation, !Task.isCancelled { await systemSettings.openNotificationSettings() }
            return false
        case .notDetermined:
            return await permission.requestAuthorization()
        }
    }

    /// 계정이 달라졌으면 이전 계정의 값·사인·진행 중 작업을 버린다. 계정이 그대로면 아무것도 하지 않는다.
    private func syncOwner() {
        let current = viewer.userId?.lowercased()
        guard current != owner else { return }
        owner = current
        generation += 1
        loadGeneration += 1
        isLoadingPush = false
        inFlight = [:]
        settings = nil
        pushState = .loading
        needsLogin = false
        activeWork.cancel()
        signature.reset()
    }

    /// 푸시 설정 조회. 이미 조회 중이면 보내지 않는다. 시작하면 `.loading`(스위치는 눌리지 않는다).
    private func loadPush() async {
        guard !isLoadingPush else { return }
        loadGeneration += 1
        let current = loadGeneration
        let before = pushState
        isLoadingPush = true
        pushState = .loading
        await activeWork.run { [self] in
            defer { if current == loadGeneration { isLoadingPush = false } }
            do {
                var fetched = try await repository.fetch()
                guard current == loadGeneration else { return }
                // 조회 중에 저장이 시작됐다면 그 항목은 낙관적 값을 유지한다(서버 응답이 저장 전 값일 수 있다).
                if let shown = settings {
                    for kind in inFlight.keys { fetched = fetched.setting(kind, to: shown.value(of: kind)) }
                }
                settings = fetched
                pushState = .ready
            } catch {
                guard current == loadGeneration else { return }
                handleLoadFailure(error, before: before)
            }
        }
    }

    private func handleLoadFailure(_ error: any Error, before: PushSettingsState) {
        // 취소는 오류가 아니다. 조회 전 상태로 돌려 놓고(값도 그대로) 다음에 보일 때 다시 조회한다.
        if error.isCancellation {
            pushState = before
            return
        }
        // 이전 값을 남기지 않는다(오래된 값 기준으로 저장하지 않는다, REQ-SET-010).
        settings = nil
        pushState = .failed
        if case APIError.http(401, _, _) = error {
            needsLogin = true
            return
        }
        toast.show(SettingsCopy.pushLoadError)
    }

    /// 저장 실패(값은 호출 쪽이 이미 되돌렸다). 취소는 토스트 없이, 401은 토스트 없이 로그인으로.
    private func handleSaveFailure(_ error: any Error) {
        if error.isCancellation || Task.isCancelled { return }
        if case APIError.http(401, _, _) = error {
            needsLogin = true
            return
        }
        toast.show(SettingsCopy.pushSaveError)
    }
}
