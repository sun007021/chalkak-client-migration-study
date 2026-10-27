import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
private struct LoginSUT {
    let viewModel: LoginViewModel
    let repository: FakeAuthRepository
    let client: FakeSocialLoginClient
    let push: RecordingPushRegistration
    let analytics: RecordingAnalytics

    init(
        repository: FakeAuthRepository = FakeAuthRepository(),
        client: FakeSocialLoginClient = FakeSocialLoginClient(),
        hasher: any SHA256Hashing = PureSwiftSHA256()
    ) {
        let push = RecordingPushRegistration()
        let analytics = RecordingAnalytics()
        self.repository = repository
        self.client = client
        self.push = push
        self.analytics = analytics
        self.viewModel = LoginViewModel(
            authRepository: repository,
            socialLogin: client,
            nonceFactory: KakaoNonceFactory(random: SequenceRandomBytes(), hasher: hasher),
            pushRegistration: push,
            screenTracker: ScreenTracker(tracker: analytics)
        )
    }
}

@MainActor
@Suite("AUTH 로그인 화면 상태", .timeLimit(.minutes(1)))
struct LoginViewModelTests {
    // MARK: 분석, 초기 상태

    @Test("TC-BOOT-021 화면이 보일 때 screen_view(login)을 보낸다")
    func screenView() {
        let sut = LoginSUT()
        sut.viewModel.onAppear()
        #expect(sut.analytics.events == [.screenView(.login, screenClass: nil)])
    }

    @Test("초기 상태는 idle이고 두 버튼이 눌린다")
    func initialState() {
        let sut = LoginSUT()
        #expect(sut.viewModel.state == .idle)
        #expect(sut.viewModel.isInteractionEnabled)
    }

    // MARK: nonce

    @Test("TC-AUTH-004 SDK에는 해시 nonce, 서버에는 원문 rawNonce를 쓰고 둘이 섞이지 않는다")
    func hashedToSDKRawToServer() async throws {
        let sut = LoginSUT()
        await sut.viewModel.kakaoTapped()
        let sdkNonce = try #require(await sut.client.hashedNonces.first)
        let call = try #require(await sut.repository.loginCalls.first)
        #expect(sdkNonce != call.rawNonce)
        #expect(sdkNonce == hex(PureSwiftSHA256().sha256(Array(call.rawNonce.utf8))))
        #expect(sdkNonce.count == 64)
        #expect(call.rawNonce.count == 43)
    }

    @Test("TC-AUTH-004 가짜 해시기로도 SDK는 해시 값, 서버는 원문을 받는다")
    func hashedToSDKWithFakeHasher() async throws {
        let sut = LoginSUT(hasher: RecordingHasher())
        await sut.viewModel.kakaoTapped()
        #expect(await sut.client.hashedNonces == [String(repeating: "ab", count: 32)])
        let call = try #require(await sut.repository.loginCalls.first)
        #expect(call.rawNonce != String(repeating: "ab", count: 32))
        #expect(call.idToken == "ID-1")
    }

    // MARK: 성공 분기

    @Test("TC-AUTH-008 LOGIN_SUCCESS면 푸시 기기 등록을 트리거하고 메인(회원)으로 완료한다")
    func loginSuccess() async {
        let sut = LoginSUT()
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state == .completed(.main(.member)))
        #expect(await sut.push.count == 1)
    }

    @Test("TC-AUTH-010 SIGN_UP_REQUIRED면 푸시 등록 없이 약관으로 가며 idToken·rawNonce를 메모리에 들고 간다")
    func signUpRequired() async throws {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.success(.signUpRequired)]))
        await sut.viewModel.kakaoTapped()
        let call = try #require(await sut.repository.loginCalls.first)
        #expect(sut.viewModel.state == .completed(.terms(SignUpContext(idToken: "ID-1", rawNonce: call.rawNonce))))
        #expect(await sut.push.count == 0)
    }

    @Test("TC-AUTH-010 SignUpContext는 문자열화해도 토큰 값이 새지 않는다")
    func signUpContextRedacted() {
        let context = SignUpContext(idToken: "SECRET-ID", rawNonce: "SECRET-NONCE")
        for text in ["\(context)", String(describing: context), String(reflecting: context)] {
            #expect(!text.contains("SECRET"))
        }
    }

    @Test("진행 단계: SDK 중에는 authenticatingWithKakao, 서버 중에는 signingIn이며 버튼이 비활성이다")
    func phases() async {
        let clientHold = Hold()
        let repoHold = Hold()
        let sut = LoginSUT(
            repository: FakeAuthRepository(loginHold: repoHold),
            client: FakeSocialLoginClient(hold: clientHold)
        )
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.client.entered.wait()
        #expect(sut.viewModel.state == .authenticatingWithKakao)
        #expect(!sut.viewModel.isInteractionEnabled)
        await clientHold.open()
        await sut.repository.loginEntered.wait()
        #expect(sut.viewModel.state == .signingIn)
        #expect(!sut.viewModel.isInteractionEnabled)
        await repoHold.open()
        await task.value
        #expect(sut.viewModel.state == .completed(.main(.member)))
    }

    // MARK: SDK 단계 실패

    @Test("TC-AUTH-013 사용자 취소는 오류 문구 없이 idle로 돌아가고 서버를 부르지 않는다", arguments: [
        SocialLoginError.cancelled as any Error, CancellationError() as any Error,
    ])
    func cancelledIsSilent(error: any Error) async {
        let sut = LoginSUT(client: FakeSocialLoginClient(results: [.failure(error)]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state == .idle)
        #expect(sut.viewModel.isInteractionEnabled)
        #expect(await sut.repository.loginCalls.isEmpty)
    }

    @Test("TC-AUTH-018 idToken이 없으면 설정 오류 문구, 서버 호출 0건")
    func missingIdToken() async {
        let sut = LoginSUT(client: FakeSocialLoginClient(results: [.success(KakaoCredential(idToken: nil))]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state.errorMessage == "카카오 로그인 설정을 확인해 주세요.")
        #expect(await sut.repository.loginCalls.isEmpty)
    }

    @Test("TC-AUTH-018 SDK 설정 오류도 같은 문구")
    func sdkConfiguration() async {
        let sut = LoginSUT(client: FakeSocialLoginClient(results: [.failure(SocialLoginError.configuration)]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state.errorMessage == "카카오 로그인 설정을 확인해 주세요.")
        #expect(await sut.repository.loginCalls.isEmpty)
    }

    @Test("TC-AUTH-019 SDK 일반 실패는 kakao-failed 문구, 서버 호출 0건", arguments: [
        SocialLoginError.failed as any Error, URLError(.badURL) as any Error,
    ])
    func sdkFailure(error: any Error) async {
        let sut = LoginSUT(client: FakeSocialLoginClient(results: [.failure(error)]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state.errorMessage == "카카오 로그인에 실패했어요. 다시 시도해 주세요.")
        #expect(await sut.repository.loginCalls.isEmpty)
    }

    // MARK: 서버 단계 실패

    @Test("서버 오류 → 문구 매핑 (TC-AUTH-011 TC-AUTH-020 TC-AUTH-021 TC-AUTH-022 TC-AUTH-023 TC-AUTH-024 TC-AUTH-025 TC-AUTH-026)", arguments: [
        (APIError.invalidResponse, "로그인 응답을 확인할 수 없어요. 다시 시도해 주세요."),
        (APIError.http(status: 401, code: .unauthorized, message: "x"), "카카오 계정을 확인할 수 없어요. 다시 시도해 주세요."),
        (APIError.http(status: 403, code: .forbidden, message: "차단된 소셜 계정입니다."), "차단된 소셜 계정입니다."),
        (APIError.http(status: 403, code: .forbidden, message: "탈퇴한 차단 소셜 계정입니다."), "탈퇴한 차단 소셜 계정입니다."),
        (APIError.http(status: 403, code: .forbidden, message: nil), "로그인하지 못했어요. 다시 시도해 주세요."),
        (APIError.http(status: 400, code: .businessError, message: "Authorization Code는 APPLE 로그인에만 필요합니다."), "로그인하지 못했어요. 다시 시도해 주세요."),
        (APIError.http(status: 500, code: .internalError, message: "x"), "로그인하지 못했어요. 다시 시도해 주세요."),
        (APIError.http(status: 502, code: nil, message: nil), "로그인하지 못했어요. 다시 시도해 주세요."),
        (APIError.network, "네트워크 연결을 확인해 주세요."),
    ])
    func serverErrorMapping(error: APIError, expected: String) async {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.failure(error)]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state.errorMessage == expected)
        #expect(sut.viewModel.isInteractionEnabled)
        #expect(await sut.push.count == 0)
    }

    @Test("LoginErrorMapper: 알 수 없는 오류는 일반 문구, 취소는 nil")
    func mapperFallbacks() {
        struct Unknown: Error {}
        #expect(LoginErrorMapper.presentation(for: Unknown()) == .message("로그인하지 못했어요. 다시 시도해 주세요."))
        #expect(LoginErrorMapper.presentation(for: CancellationError()) == .silent)
        #expect(LoginErrorMapper.presentation(for: SocialLoginError.cancelled) == .silent)
        #expect(LoginErrorMapper.presentation(for: AuthError.sessionChanged) == .silent)
        #expect(LoginErrorMapper.presentation(forSDKError: SocialLoginError.cancelled) == .silent)
        #expect(LoginErrorMapper.presentation(forSDKError: URLError(.cancelled)) == .silent)
    }

    @Test("TC-AUTH-020 401 뒤 다음 시도는 새 rawNonce와 새 idToken으로 처음부터 한다")
    func retryUsesFreshNonceAndToken() async throws {
        let sut = LoginSUT(
            repository: FakeAuthRepository(loginResults: [
                .failure(APIError.http(status: 401, code: .unauthorized, message: nil)), .success(.loggedIn(userId: "u")),
            ]),
            client: FakeSocialLoginClient(results: [.success(KakaoCredential(idToken: "ID-A")), .success(KakaoCredential(idToken: "ID-B"))])
        )
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state.errorMessage == "카카오 계정을 확인할 수 없어요. 다시 시도해 주세요.")
        await sut.viewModel.kakaoTapped()
        let calls = await sut.repository.loginCalls
        guard calls.count == 2 else { Issue.record("로그인 호출이 2회여야 한다: \(calls.count)"); return }
        #expect(calls[0].idToken == "ID-A" && calls[1].idToken == "ID-B")
        #expect(calls[0].rawNonce != calls[1].rawNonce)
        let hashed = await sut.client.hashedNonces
        guard hashed.count == 2 else { Issue.record("SDK 호출이 2회여야 한다: \(hashed.count)"); return }
        #expect(hashed[0] != hashed[1])
        #expect(sut.viewModel.state == .completed(.main(.member)))
    }

    @Test("TC-AUTH-029 같은 오류가 연달아 나와도 알림 id가 달라 다시 표시된다")
    func sameErrorTwiceHasDistinctIds() async throws {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.failure(APIError.network), .failure(APIError.network)]))
        await sut.viewModel.kakaoTapped()
        let first = try #require(sut.viewModel.state.notice)
        await sut.viewModel.kakaoTapped()
        let second = try #require(sut.viewModel.state.notice)
        #expect(first.message == second.message)
        #expect(first.id != second.id)
    }

    @Test("TC-AUTH-018 오류를 닫으면 idle, 오류 상태에서도 버튼은 눌린다")
    func dismissError() async {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.failure(APIError.network)]))
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.isInteractionEnabled)
        sut.viewModel.dismissError()
        #expect(sut.viewModel.state == .idle)
    }

    // MARK: 연타, 이탈

    @Test("TC-AUTH-027 카카오 버튼 3회 연타해도 SDK 1회, 서버 1회이고 진행 중 비활성이다")
    func rapidTapsRunOnce() async {
        let hold = Hold()
        let sut = LoginSUT(client: FakeSocialLoginClient(hold: hold))
        let first = Task { await sut.viewModel.kakaoTapped() }
        await sut.client.entered.wait()
        #expect(!sut.viewModel.isInteractionEnabled)
        await sut.viewModel.kakaoTapped()
        await sut.viewModel.kakaoTapped()
        await hold.open()
        await first.value
        #expect(await sut.client.hashedNonces.count == 1)
        #expect(await sut.repository.loginCalls.count == 1)
    }

    @Test("TC-AUTH-027 진행 중에는 게스트 탭도 무시한다")
    func guestTapIgnoredWhileBusy() async {
        let hold = Hold()
        let sut = LoginSUT(client: FakeSocialLoginClient(hold: hold))
        let first = Task { await sut.viewModel.kakaoTapped() }
        await sut.client.entered.wait()
        await sut.viewModel.guestTapped()
        #expect(await sut.repository.enterGuestCount == 0)
        await hold.open()
        await first.value
    }

    @Test("완료된 뒤의 재탭은 무시한다(중복 요청 없음)")
    func tapAfterCompletedIgnored() async {
        let sut = LoginSUT()
        await sut.viewModel.kakaoTapped()
        await sut.viewModel.kakaoTapped()
        #expect(await sut.repository.loginCalls.count == 1)
    }

    // MARK: 화면 복귀

    @Test("TC-AUTH-010 SIGN_UP_REQUIRED로 약관에 갔다 돌아오면(onAppear) idle로 돌아가 두 버튼이 다시 눌린다")
    func returningFromTermsReenablesButtons() async {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.success(.signUpRequired), .success(.loggedIn(userId: "u"))]))
        await sut.viewModel.kakaoTapped()
        #expect(!sut.viewModel.isInteractionEnabled)
        sut.viewModel.onAppear()
        #expect(sut.viewModel.state == .idle)
        #expect(sut.viewModel.isInteractionEnabled)
        await sut.viewModel.kakaoTapped()
        #expect(sut.viewModel.state == .completed(.main(.member)))
    }

    @Test("consumeCompletion은 completed만 idle로 돌리고 다른 상태는 건드리지 않는다")
    func consumeCompletionOnlyCompleted() async {
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.failure(APIError.network)]))
        await sut.viewModel.kakaoTapped()
        let failed = sut.viewModel.state
        sut.viewModel.consumeCompletion()
        #expect(sut.viewModel.state == failed)
    }

    // MARK: 이탈과 취소 구간

    @Test("TC-AUTH-031 서버 응답 대기 중 화면이 사라지면 결과를 버리고 오류도 보이지 않으며 푸시 등록도 없다")
    func disappearWhileSigningIn() async {
        let hold = Hold()
        let sut = LoginSUT(repository: FakeAuthRepository(loginHold: hold))
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.repository.loginEntered.wait()
        sut.viewModel.onDisappear()
        await task.value
        #expect(sut.viewModel.state == .idle)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-AUTH-031 카카오 인증 중 화면이 사라지면 서버를 부르지 않는다")
    func disappearWhileAuthenticating() async {
        let hold = Hold()
        let sut = LoginSUT(client: FakeSocialLoginClient(hold: hold))
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.client.entered.wait()
        sut.viewModel.onDisappear()
        await task.value
        #expect(await sut.repository.loginCalls.isEmpty)
        #expect(sut.viewModel.state == .idle)
    }

    @Test("TC-AUTH-031 SDK가 취소를 무시하고 결과를 돌려줘도 서버를 부르지 않는다")
    func stubbornSDKAfterDisappear() async {
        let hold = Hold(ignoringCancellation: true)
        let sut = LoginSUT(client: FakeSocialLoginClient(hold: hold))
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.client.entered.wait()
        sut.viewModel.onDisappear()
        await hold.open()
        await task.value
        #expect(await sut.repository.loginCalls.isEmpty)
        #expect(sut.viewModel.state == .idle)
    }

    @Test("TC-AUTH-031 저장 시작 뒤(LOGIN_SUCCESS 확정)에는 취소돼도 푸시 등록과 completed까지 간다")
    func disappearAfterLoginSavedStillCompletes() async {
        let hold = Hold(ignoringCancellation: true)
        let sut = LoginSUT(repository: FakeAuthRepository(loginHold: hold))
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.repository.loginEntered.wait()
        sut.viewModel.onDisappear()
        await hold.open()
        await task.value
        #expect(sut.viewModel.state == .completed(.main(.member)))
        #expect(await sut.push.count == 1)
    }

    @Test("TC-AUTH-031 SIGN_UP_REQUIRED 응답이 취소 뒤에 오면 약관으로 가지 않고 idle")
    func disappearBeforeSignUpRequiredResult() async {
        let hold = Hold(ignoringCancellation: true)
        let sut = LoginSUT(repository: FakeAuthRepository(loginResults: [.success(.signUpRequired)], loginHold: hold))
        let task = Task { await sut.viewModel.kakaoTapped() }
        await sut.repository.loginEntered.wait()
        sut.viewModel.onDisappear()
        await hold.open()
        await task.value
        #expect(sut.viewModel.state == .idle)
    }

    // MARK: 게스트

    @Test("TC-AUTH-032 게스트 탭은 SDK·로그인 호출 없이 게스트 진입 후 메인(게스트)로 완료한다")
    func guestEntry() async {
        let sut = LoginSUT()
        await sut.viewModel.guestTapped()
        #expect(await sut.repository.enterGuestCount == 1)
        #expect(await sut.client.hashedNonces.isEmpty)
        #expect(await sut.repository.loginCalls.isEmpty)
        #expect(await sut.push.count == 0)
        #expect(sut.viewModel.state == .completed(.main(.guest)))
    }

    @Test("TC-AUTH-032 게스트 진입 뒤 복귀(onAppear)하면 idle로 돌아간다")
    func guestEntryThenReturn() async {
        let sut = LoginSUT()
        await sut.viewModel.guestTapped()
        sut.viewModel.onAppear()
        #expect(sut.viewModel.state == .idle)
    }

    @Test("TC-AUTH-032 게스트 플래그 저장 실패면 로그인 화면에 머물고 guest 오류 문구")
    func guestSaveFailure() async {
        struct SaveFailed: Error {}
        let sut = LoginSUT(repository: FakeAuthRepository(enterGuestError: SaveFailed()))
        await sut.viewModel.guestTapped()
        #expect(sut.viewModel.state.errorMessage == "화면을 불러오지 못했어요. 다시 시도해 주세요.")
        #expect(sut.viewModel.isInteractionEnabled)
    }
}

extension LoginViewModel.State {
    var notice: Notice? {
        if case .failed(let notice) = self { notice } else { nil }
    }
    var errorMessage: String? { notice?.message }
}
