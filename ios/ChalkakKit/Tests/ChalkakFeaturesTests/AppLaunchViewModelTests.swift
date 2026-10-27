import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
private struct LaunchSUT {
    let viewModel: AppLaunchViewModel
    let clock: TestClock
    let resolver: FakeSessionResolver
    let versionGate: FakeVersionGate
    let preloader: FakeHomePreloader
    let push: RecordingPushRegistration
    let opener: FakeStoreOpener
    let repository: FakeAuthRepository
    let caches: RecordingUserCaches

    init(
        session: AuthGateResult,
        versionGate: FakeVersionGate = FakeVersionGate(),
        preloader: FakeHomePreloader = FakeHomePreloader(),
        repository: FakeAuthRepository = FakeAuthRepository()
    ) {
        let clock = TestClock()
        let resolver = FakeSessionResolver(session)
        let push = RecordingPushRegistration()
        let opener = FakeStoreOpener()
        let caches = RecordingUserCaches()
        self.clock = clock
        self.resolver = resolver
        self.versionGate = versionGate
        self.preloader = preloader
        self.push = push
        self.opener = opener
        self.repository = repository
        self.caches = caches
        self.viewModel = AppLaunchViewModel(
            sessionResolver: resolver,
            versionGate: versionGate,
            homePreloader: preloader,
            pushRegistration: push,
            storeOpener: opener,
            authRepository: repository,
            userCaches: caches,
            clock: clock
        )
    }
}

@MainActor
@Suite("BOOT 시작 흐름", .timeLimit(.minutes(1)))
struct AppLaunchViewModelTests {
    // MARK: 목적지 판정

    @Test("TC-BOOT-001 TC-BOOT-014 세션 없음이면 프리로드를 기다리지 않고 로그인이 열리며 홈 호출은 0건")
    func signedOut() async {
        let sut = LaunchSUT(session: .signedOut, preloader: FakeHomePreloader(hold: Hold()))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .login)
        #expect(await sut.preloader.accesses.isEmpty)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-BOOT-002 인증 세션이면 로그인 없이 메인(회원)이 열리고 푸시 기기 등록을 1회 시작한다")
    func authenticated() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u1"))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .main(.member))
        #expect(await sut.preloader.accesses == [.member])
        #expect(await sut.push.count == 1)
    }

    @Test("TC-BOOT-003 TC-BOOT-013 게스트면 메인(게스트)이 열리고 프리로드는 게스트 접근으로만, 푸시 등록 없음")
    func guest() async {
        let sut = LaunchSUT(session: .guest)
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .main(.guest))
        #expect(await sut.preloader.accesses == [.guest])
        #expect(await sut.push.count == 0)
    }

    @Test("시작 직후(start 전)와 세션 읽는 동안은 스플래시 상태")
    func splashBeforeStart() {
        let sut = LaunchSUT(session: .signedOut)
        #expect(sut.viewModel.root == .splash)
    }

    // MARK: 스플래시 700ms

    @Test("TC-BOOT-010 프리로드가 100ms에 끝나면 100ms에 해제하고 700ms를 기다리지 않는다")
    func earlyPreload() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), preloader: FakeHomePreloader(hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.clock.waitUntilSleeperCount(atLeast: 1)
        sut.clock.advance(by: .milliseconds(100))
        #expect(sut.viewModel.root == .splash)
        await hold.open()
        await task.value
        #expect(sut.viewModel.root == .main(.member))
        #expect(sut.clock.uptime == .milliseconds(100))
        #expect(sut.clock.sleeperCount == 0)
    }

    @Test("TC-BOOT-011 프리로드가 안 끝나면 699ms까지 유지하고 700ms에 해제한다")
    func splashDeadline() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), preloader: FakeHomePreloader(hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.clock.waitUntilSleeperCount(atLeast: 1)
        sut.clock.advance(by: .milliseconds(699))
        #expect(sut.clock.sleeperCount == 1)
        #expect(sut.viewModel.root == .splash)
        sut.clock.advance(by: .milliseconds(1))
        await task.value
        #expect(sut.viewModel.root == .main(.member))
        await hold.open()
    }

    @Test("TC-BOOT-011 상한은 AppConstants.splashPreloadMax")
    func deadlineMatchesConstant() {
        #expect(AppConstants.splashPreloadMax == .milliseconds(700))
    }

    @Test("TC-BOOT-012 프리로드 오류도 즉시 해제하고 메인이 열린다(오류 표시는 홈 몫)")
    func preloadError() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"), preloader: FakeHomePreloader(error: LookupFailure()))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .main(.member))
    }

    // MARK: 강제 업데이트

    @Test("TC-BOOT-016 TC-BOOT-034 강제 업데이트면 닫을 수 없는 업데이트 상태이고 홈·푸시 기기 등록·홈 호출이 0건")
    func updateRequiredBlocksEverything() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.updateRequired]))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .updateRequired)
        #expect(await sut.preloader.accesses.isEmpty)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-BOOT-034 업데이트 필요 상태에서는 로그인 완료·세션 종료·재인증이 와도 루트가 바뀌지 않는다")
    func updateRequiredIsSticky() async {
        let sut = LaunchSUT(session: .signedOut, versionGate: FakeVersionGate([.updateRequired]))
        await sut.viewModel.start()
        sut.viewModel.loginCompleted(.main(.member))
        #expect(sut.viewModel.root == .updateRequired)
        sut.viewModel.accountSessionEnded()
        #expect(sut.viewModel.root == .updateRequired)
        await sut.viewModel.handleReauthenticationRequired()
        #expect(sut.viewModel.root == .updateRequired)
    }

    @Test("TC-BOOT-002 TC-BOOT-003 게이트 확인 중에는 700ms가 지나도 스플래시를 유지하고, 700ms는 게이트 통과 시점부터 센다")
    func splashWaitsForGateThenSevenHundred() async {
        let versionHold = Hold()
        let preloadHold = Hold()
        let sut = LaunchSUT(
            session: .authenticated(userId: "u"),
            versionGate: FakeVersionGate([.passed], hold: versionHold),
            preloader: FakeHomePreloader(hold: preloadHold)
        )
        let task = Task { await sut.viewModel.start() }
        await sut.versionGate.entered.wait()
        sut.clock.advance(by: .milliseconds(700))
        #expect(sut.viewModel.root == .splash)
        #expect(sut.clock.sleeperCount == 0)        // 게이트를 통과하기 전에는 700ms 타이머가 없다
        #expect(await sut.preloader.accesses.isEmpty)

        await versionHold.open()
        await sut.clock.waitUntilSleeperCount(atLeast: 1)
        sut.clock.advance(by: .milliseconds(699))
        #expect(sut.clock.sleeperCount == 1)
        #expect(sut.viewModel.root == .splash)
        sut.clock.advance(by: .milliseconds(1))
        await task.value
        #expect(sut.viewModel.root == .main(.member))
        await preloadHold.open()
    }

    @Test("TC-BOOT-016 TC-BOOT-034 게이트가 늦게 강제 업데이트로 끝나면 목적지를 열지 않고 업데이트 상태, 홈·푸시 0건")
    func lateUpdateRequiredNeverOpensDestination() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.updateRequired], hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.versionGate.entered.wait()
        sut.clock.advance(by: .seconds(1))
        #expect(sut.viewModel.root == .splash)
        await hold.open()
        await task.value
        #expect(sut.viewModel.root == .updateRequired)
        #expect(await sut.preloader.accesses.isEmpty)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-BOOT-004 세션 없음은 게이트 통과 즉시 로그인이 열리고 700ms 타이머를 쓰지 않는다")
    func signedOutAfterGateWithoutTimer() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .signedOut, versionGate: FakeVersionGate([.passed], hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.versionGate.entered.wait()
        #expect(sut.viewModel.root == .splash)
        await hold.open()
        await task.value
        #expect(sut.viewModel.root == .login)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    // MARK: 스플래시 중 재인증, 중복 시작

    @Test("TC-AUTH-056 스플래시 중(프리로드 대기) 재인증 이벤트가 오면 로그인이 유지되고 이후 프리로드가 끝나도 메인·푸시 등록이 없다")
    func reauthDuringPreloadWins() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), preloader: FakeHomePreloader(hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.preloader.entered.wait()
        await sut.viewModel.handleReauthenticationRequired()
        #expect(sut.viewModel.root == .login)
        await task.value
        await hold.open()
        sut.clock.advance(by: .seconds(1))
        #expect(sut.viewModel.root == .login)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-AUTH-056 게이트 확인 중 재인증 이벤트가 오면 로그인이 유지되고 통과 뒤에도 메인·프리로드·푸시가 없다")
    func reauthDuringGateWins() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.passed], hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.versionGate.entered.wait()
        await sut.viewModel.handleReauthenticationRequired()
        #expect(sut.viewModel.root == .login)
        await hold.open()
        await task.value
        #expect(sut.viewModel.root == .login)
        #expect(await sut.preloader.accesses.isEmpty)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-BOOT-034 게이트 확인 중 재인증 이벤트가 와도 게이트가 강제 업데이트로 끝나면 업데이트 상태가 이긴다")
    func reauthDuringGateThenUpdateRequired() async {
        let hold = Hold()
        let sut = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.updateRequired], hold: hold))
        let task = Task { await sut.viewModel.start() }
        await sut.versionGate.entered.wait()
        await sut.viewModel.handleReauthenticationRequired()
        await hold.open()
        await task.value
        #expect(sut.viewModel.root == .updateRequired)
    }

    @Test("start()를 겹쳐 불러도 세션 판정·푸시 등록은 1회뿐이고, 끝난 뒤 다시 불러도 아무 일이 없다")
    func startIsIdempotent() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"))
        let first = Task { await sut.viewModel.start() }
        let second = Task { await sut.viewModel.start() }
        await first.value
        await second.value
        await sut.viewModel.start()
        #expect(await sut.resolver.count == 1)
        #expect(await sut.push.count == 1)
        #expect(await sut.preloader.accesses == [.member])
    }

    @Test("TC-BOOT-025 TC-BOOT-027 재확인에서 새로 강제 대상이면 업데이트 상태가 된다(scene active, 온라인 복귀)")
    func recheckBecomesRequired() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.passed, .updateRequired]))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .main(.member))
        await sut.viewModel.recheckVersionGate()
        #expect(sut.viewModel.root == .updateRequired)
    }

    @Test("TC-BOOT-025 재확인이 통과면 루트는 그대로")
    func recheckPassKeepsRoot() async {
        let sut = LaunchSUT(session: .guest, versionGate: FakeVersionGate([.passed]))
        await sut.viewModel.start()
        await sut.viewModel.recheckVersionGate()
        #expect(sut.viewModel.root == .main(.guest))
    }

    @Test("TC-BOOT-029 업데이트 버튼은 스토어를 열고, 연타해도 1회(재확인 뒤에는 다시 가능)")
    func updateButtonOpensStoreOnce() async {
        let sut = LaunchSUT(session: .signedOut, versionGate: FakeVersionGate([.updateRequired]))
        await sut.viewModel.start()
        await sut.viewModel.updateButtonTapped()
        await sut.viewModel.updateButtonTapped()
        await sut.viewModel.updateButtonTapped()
        #expect(await sut.opener.count == 1)
        await sut.viewModel.recheckVersionGate()
        await sut.viewModel.updateButtonTapped()
        #expect(await sut.opener.count == 2)
    }

    @Test("TC-BOOT-029 업데이트 필요 상태가 아니면 버튼을 눌러도 스토어를 열지 않는다")
    func updateButtonIgnoredWhenNotRequired() async {
        let sut = LaunchSUT(session: .guest)
        await sut.viewModel.start()
        await sut.viewModel.updateButtonTapped()
        #expect(await sut.opener.count == 0)
    }

    // MARK: 푸시 딥링크

    @Test("TC-BOOT-035 메인이 열렸고 강제 업데이트가 아닐 때만 딥링크를 처리할 수 있다")
    func deepLinkReadiness() async {
        let blocked = LaunchSUT(session: .authenticated(userId: "u"), versionGate: FakeVersionGate([.updateRequired]))
        #expect(!blocked.viewModel.isDeepLinkReady)      // splash
        await blocked.viewModel.start()
        #expect(!blocked.viewModel.isDeepLinkReady)      // updateRequired

        let login = LaunchSUT(session: .signedOut)
        await login.viewModel.start()
        #expect(!login.viewModel.isDeepLinkReady)        // login

        let main = LaunchSUT(session: .authenticated(userId: "u"))
        await main.viewModel.start()
        #expect(main.viewModel.isDeepLinkReady)          // main
    }

    // MARK: 로그인 완료, 세션 종료, 재인증

    @Test("로그인 완료: 메인(회원)·메인(게스트)로 루트 전환, 푸시 등록은 다시 하지 않는다")
    func loginCompletedMain() async {
        let sut = LaunchSUT(session: .signedOut)
        await sut.viewModel.start()
        sut.viewModel.loginCompleted(.main(.member))
        #expect(sut.viewModel.root == .main(.member))
        sut.viewModel.loginCompleted(.main(.guest))
        #expect(sut.viewModel.root == .main(.guest))
        #expect(await sut.push.count == 0)
    }

    @Test("TC-AUTH-010 약관으로 가는 로그인 완료는 루트를 바꾸지 않는다")
    func loginCompletedTerms() async {
        let sut = LaunchSUT(session: .signedOut)
        await sut.viewModel.start()
        sut.viewModel.loginCompleted(.terms(SignUpContext(idToken: "i", rawNonce: "n")))
        #expect(sut.viewModel.root == .login)
    }

    @Test("TC-AUTH-035 TC-AUTH-043 로그아웃·탈퇴가 끝나면 로그인 화면")
    func accountSessionEnded() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"))
        await sut.viewModel.start()
        sut.viewModel.accountSessionEnded()
        #expect(sut.viewModel.root == .login)
    }

    @Test("TC-AUTH-033 게스트 설정의 로그인 버튼은 게스트 플래그를 지우고 로그인 화면으로 보낸다")
    func loginFromGuest() async {
        let sut = LaunchSUT(session: .guest)
        await sut.viewModel.start()
        await sut.viewModel.loginFromGuest()
        #expect(await sut.repository.exitGuestCount == 1)
        #expect(sut.viewModel.root == .login)
    }

    @Test("TC-AUTH-056 REAUTHENTICATION_REQUIRED 이벤트는 사용자 캐시를 비우고 로그인 화면으로 루트를 교체한다")
    func reauthenticationRequired() async {
        let sut = LaunchSUT(session: .authenticated(userId: "u"))
        await sut.viewModel.start()
        #expect(sut.viewModel.root == .main(.member))
        await AuthEventBridge(launch: sut.viewModel).reauthenticationRequired()
        #expect(sut.viewModel.root == .login)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-AUTH-033 게스트 플래그 삭제가 실패해도 로그인 화면으로 간다(다음 시작에 SessionResolver가 치유)")
    func loginFromGuestEvenWhenFlagClearFails() async {
        struct FlagFailure: Error {}
        let repository = FakeAuthRepository(exitGuestError: FlagFailure())
        let sut = LaunchSUT(session: .guest, repository: repository)
        await sut.viewModel.start()
        await sut.viewModel.loginFromGuest()
        #expect(await repository.exitGuestCount == 1)
        #expect(sut.viewModel.root == .login)
    }

    @Test("TC-AUTH-056 로그인 요청이 진행 중일 때 재인증 이벤트가 와도 로그인 화면은 그대로이고 요청은 계속되어 결과가 정상 반영된다")
    func reauthDuringLoginRequestKeepsRequest() async {
        let hold = Hold()
        let loginRepository = FakeAuthRepository(loginHold: hold)
        let sut = LaunchSUT(session: .signedOut)
        await sut.viewModel.start()
        let login = LoginViewModel(
            authRepository: loginRepository,
            socialLogin: FakeSocialLoginClient(),
            nonceFactory: KakaoNonceFactory(random: SequenceRandomBytes()),
            pushRegistration: sut.push,
            screenTracker: nil
        )
        let task = Task { await login.kakaoTapped() }
        await loginRepository.loginEntered.wait()
        await AuthEventBridge(launch: sut.viewModel).reauthenticationRequired()
        #expect(sut.viewModel.root == .login)
        #expect(login.state == .signingIn)
        await hold.open()
        await task.value
        #expect(login.state == .completed(.main(.member)))
        sut.viewModel.loginCompleted(.main(.member))
        #expect(sut.viewModel.root == .main(.member))
    }
}
