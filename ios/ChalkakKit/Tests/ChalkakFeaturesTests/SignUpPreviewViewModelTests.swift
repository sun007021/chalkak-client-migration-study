import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
private struct SignUpSUT {
    let viewModel: SignUpPreviewViewModel
    let repository: FakeSignUpRepository
    let push: RecordingPushRegistration
    let analytics: RecordingAnalytics

    init(repository: FakeSignUpRepository = FakeSignUpRepository(), context: SignUpContext? = testContext) {
        let push = RecordingPushRegistration()
        let analytics = RecordingAnalytics()
        self.repository = repository
        self.push = push
        self.analytics = analytics
        self.viewModel = SignUpPreviewViewModel(
            context: context,
            draft: SignatureDraft(pngData: testPNG),
            repository: repository,
            pushRegistration: push,
            screenTracker: ScreenTracker(tracker: analytics)
        )
    }
}

private func failing(_ error: any Error) -> FakeSignUpRepository {
    FakeSignUpRepository(results: [.failure(error)])
}

@MainActor
@Suite("ONB 가입 미리보기·시작하기", .timeLimit(.minutes(1)))
struct SignUpPreviewViewModelTests {
    // MARK: 성공

    @Test("TC-ONB-019 TC-ONB-046 시작하기는 컨텍스트의 idToken·rawNonce와 PNG로 가입을 한 번 요청한다")
    func startUsesContext() async {
        let sut = SignUpSUT()
        await sut.viewModel.startTapped()
        #expect(await sut.repository.calls == [.init(idToken: "ID-ctx", rawNonce: "RAW-ctx", png: testPNG)])
    }

    @Test("TC-ONB-024 TC-ONB-028 가입 성공이면 푸시 기기 등록을 시작하고 메인으로 완료하며 컨텍스트를 폐기한다")
    func success() async {
        let sut = SignUpSUT()
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state == .finished(.signedUp))
        #expect(await sut.push.count == 1)
        #expect(sut.viewModel.context == nil)
    }

    @Test("TC-ONB-031 기존 계정으로 로그인된 경우도 가입 완료와 똑같이 처리한다")
    func existingAccount() async {
        let sut = SignUpSUT(repository: FakeSignUpRepository(results: [.success(SignUpResult(userId: "u", wasExistingAccount: true))]))
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state == .finished(.signedUp))
        #expect(await sut.push.count == 1)
    }

    @Test("완료된 뒤의 재탭은 무시한다")
    func tapAfterFinishedIgnored() async {
        let sut = SignUpSUT()
        await sut.viewModel.startTapped()
        await sut.viewModel.startTapped()
        #expect(await sut.repository.calls.count == 1)
        #expect(await sut.push.count == 1)
    }

    // MARK: 진행 중

    @Test("REQ-ONB-012 REQ-ONB-017 요청 중에는 진행 상태이고 시작하기가 비활성이다")
    func submittingState() async {
        let hold = Hold()
        let sut = SignUpSUT(repository: FakeSignUpRepository(hold: hold))
        #expect(sut.viewModel.state == .ready && sut.viewModel.isStartEnabled)
        let task = Task { await sut.viewModel.startTapped() }
        guard await EventWait.signal(sut.repository.entered, before: task) else { Issue.record("가입 요청이 시작돼야 한다"); return }
        #expect(sut.viewModel.state == .submitting)
        #expect(!sut.viewModel.isStartEnabled)
        await hold.open()
        await task.value
        #expect(sut.viewModel.state == .finished(.signedUp))
    }

    @Test("TC-ONB-043 시작하기 3회 연타해도 가입 요청은 1회뿐이다")
    func rapidTaps() async {
        let hold = Hold()
        let sut = SignUpSUT(repository: FakeSignUpRepository(hold: hold))
        let first = Task { await sut.viewModel.startTapped() }
        guard await EventWait.signal(sut.repository.entered, before: first) else { Issue.record("가입 요청이 시작돼야 한다"); return }
        await sut.viewModel.startTapped()
        await sut.viewModel.startTapped()
        await hold.open()
        await first.value
        #expect(await sut.repository.calls.count == 1)
        #expect(await sut.push.count == 1)
    }

    // MARK: 오류

    @Test("TC-ONB-030 TC-ONB-033 401이면 가입 컨텍스트를 폐기하고 로그인으로 돌아가 '로그인 정보가 만료되었어요'를 보인다", arguments: [
        "onboarding/signup__unauthorized.json", "onboarding/signup-uploads__unauthorized.json",
    ])
    func unauthorized(fixture: String) async throws {
        let sut = SignUpSUT(repository: failing(try apiError(fixture: fixture)))
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state == .finished(.loginRequired(Notice(id: sut.viewModel.state.notice?.id ?? 0, message: try copy("sign.error.expired")))))
        #expect(sut.viewModel.context == nil)
        #expect(await sut.push.count == 0)
    }

    @Test("REQ-ONB-023 가입 컨텍스트가 없으면 서버를 부르지 않고 로그인 화면으로 보낸다")
    func missingContext() async throws {
        let sut = SignUpSUT(context: nil)
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.error.expired")))
        guard case .finished(.loginRequired) = sut.viewModel.state else { Issue.record("loginRequired여야 한다: \(sut.viewModel.state)"); return }
        #expect(await sut.repository.calls.isEmpty)
    }

    @Test("TC-ONB-032 TC-ONB-037 403 FORBIDDEN이면 서버 message를 그대로 보이고 요청은 1회뿐이다", arguments: [
        "onboarding/signup-uploads__forbidden-banned.json", "onboarding/signup__forbidden-banned.json",
    ])
    func forbiddenShowsServerMessage(fixture: String) async throws {
        let error = try apiError(fixture: fixture)
        let sut = SignUpSUT(repository: failing(error))
        await sut.viewModel.startTapped()
        guard case .http(_, _, let serverMessage?) = error else { Issue.record("fixture에 message가 있어야 한다"); return }
        #expect(sut.viewModel.state.message == serverMessage)
        #expect(await sut.repository.calls.count == 1)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-ONB-032 403은 errorCode와 무관하게 서버 message를 보이고, message가 없으면 generic이다")
    func forbiddenIgnoresCode() async throws {
        let withMessage = SignUpSUT(repository: failing(APIError.http(status: 403, code: .businessError, message: "정지됨")))
        await withMessage.viewModel.startTapped()
        #expect(withMessage.viewModel.state.message == "정지됨")
        let without = SignUpSUT(repository: failing(APIError.http(status: 403, code: nil, message: nil)))
        await without.viewModel.startTapped()
        #expect(without.viewModel.state.message == (try copy("onb.signup.error.generic")))
    }

    // 화면 이동은 명세 미결정(백엔드 확인 대상): 403 뒤 로그인 화면 복귀 여부는 정해지지 않아 message 표시와 요청 1회만 검증한다.
    @Test("TC-ONB-034 TC-ONB-035 TC-ONB-039 signup의 400 BUSINESS_ERROR는 message와 상관없이 sign.error.invalid이고 그리기 화면으로 돌아간다(D-02)", arguments: [
        "onboarding/signup__invalid-signature.json", "onboarding/signup__already-used-token.json", "onboarding/signup__already-registered-withdrawn.json",
    ])
    func businessErrorReturnsToDrawing(fixture: String) async throws {
        let sut = SignUpSUT(repository: failing(try apiError(fixture: fixture)))
        await sut.viewModel.startTapped()
        guard case .finished(.returnToDrawing(let notice)) = sut.viewModel.state else { Issue.record("returnToDrawing이어야 한다: \(sut.viewModel.state)"); return }
        #expect(notice.message == (try copy("sign.error.invalid")))
        #expect(sut.viewModel.context != nil)
    }

    @Test("TC-ONB-036 signup 404는 '사인을 다시 업로드해 주세요'를 보이고 미리보기에 머문다")
    func uploadNotFound() async throws {
        let sut = SignUpSUT(repository: failing(try apiError(fixture: "onboarding/signup__upload-not-found.json")))
        await sut.viewModel.startTapped()
        guard case .failed(let notice) = sut.viewModel.state else { Issue.record("failed여야 한다: \(sut.viewModel.state)"); return }
        #expect(notice.message == (try copy("onb.signup.error.reupload")))
        #expect(sut.viewModel.isStartEnabled)
    }

    @Test("TC-ONB-028 PENDING 소진은 '사인 처리에 시간이 걸리고 있어요'이고 다시 시도할 수 있다")
    func processingTimeout() async throws {
        let sut = SignUpSUT(repository: failing(SignUpError.processingTimeout))
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state.message == (try copy("onb.signup.error.timeout")))
        #expect(sut.viewModel.isStartEnabled)
    }

    @Test("TC-ONB-041 네트워크 오류는 '네트워크 연결을 확인해 주세요'이고 사인은 유지되며 다시 누를 수 있다")
    func networkError() async throws {
        let sut = SignUpSUT(repository: FakeSignUpRepository(results: [.failure(APIError.network), .success(SignUpResult(userId: "u", wasExistingAccount: false))]))
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.error.network")))
        #expect(sut.viewModel.draft == SignatureDraft(pngData: testPNG))
        #expect(sut.viewModel.isStartEnabled)
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state == .finished(.signedUp))
        #expect(await sut.repository.calls.count == 2)
    }

    @Test("TC-ONB-040 TC-ONB-042 PUT 거절·5xx·해석 불가·기타 오류는 일반 가입 실패 문구이다", arguments: [
        SignUpError.uploadRejected(status: 403) as any Error,
        APIError.http(status: 500, code: .internalError, message: "서버에서 요청을 처리하지 못했습니다.") as any Error,
        APIError.http(status: 502, code: nil, message: nil) as any Error,
        APIError.invalidResponse as any Error,
        ConfigurationError.invalidUploadURL as any Error,
        SignUpError.existingAccountNeedsSignUp as any Error,
        SignUpError.existingAccountLoginFailed(status: 400) as any Error,
        SignUpError.issueNotFound as any Error,
    ])
    func genericFailures(error: any Error) async throws {
        let sut = SignUpSUT(repository: failing(error))
        await sut.viewModel.startTapped()
        #expect(sut.viewModel.state.message == (try copy("onb.signup.error.generic")))
        #expect(sut.viewModel.isStartEnabled)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-ONB-020 TC-ONB-029 실패 뒤 다시 누르면 같은 PNG·같은 idToken·rawNonce로 가입을 처음부터 다시 요청한다")
    func retryAfterFailure() async {
        let sut = SignUpSUT(repository: FakeSignUpRepository(results: [.failure(SignUpError.processingTimeout), .success(SignUpResult(userId: "u", wasExistingAccount: false))]))
        await sut.viewModel.startTapped()
        await sut.viewModel.startTapped()
        let calls = await sut.repository.calls
        guard calls.count == 2 else { Issue.record("가입 요청이 2회여야 한다: \(calls.count)"); return }
        #expect(calls[0] == calls[1])
    }

    @Test("D-20 같은 오류가 연달아 나와도 알림 id가 달라 다시 표시된다")
    func sameErrorDistinctIds() async throws {
        let sut = SignUpSUT(repository: FakeSignUpRepository(results: [.failure(APIError.network)]))
        await sut.viewModel.startTapped()
        let first = try #require(sut.viewModel.state.notice)
        await sut.viewModel.startTapped()
        let second = try #require(sut.viewModel.state.notice)
        #expect(first.message == second.message && first.id != second.id)
    }

    @Test("오류 알림을 닫으면 ready로 돌아간다")
    func dismissError() async {
        let sut = SignUpSUT(repository: failing(APIError.network))
        await sut.viewModel.startTapped()
        sut.viewModel.dismissError()
        #expect(sut.viewModel.state == .ready)
    }

    // MARK: 취소·다시 그리기·분석

    @Test("TC-ONB-044 요청 중 화면이 사라지면 결과를 버리고 오류·푸시 등록 없이 ready로 돌아간다")
    func disappearWhileSubmitting() async {
        let hold = Hold()
        let sut = SignUpSUT(repository: FakeSignUpRepository(hold: hold))
        let task = Task { await sut.viewModel.startTapped() }
        guard await EventWait.signal(sut.repository.entered, before: task) else { Issue.record("가입 요청이 시작돼야 한다"); return }
        sut.viewModel.onDisappear()
        await task.value
        #expect(sut.viewModel.state == .ready)
        #expect(await sut.push.count == 0)
    }

    @Test("TC-ONB-044 저장소가 취소를 알리지 않고 성공을 돌려줬다면(이미 세션 저장됨) 취소돼도 푸시 등록과 완료까지 간다")
    func successAfterCancelStillCompletes() async {
        let hold = Hold(ignoringCancellation: true)
        let sut = SignUpSUT(repository: FakeSignUpRepository(hold: hold))
        let task = Task { await sut.viewModel.startTapped() }
        guard await EventWait.signal(sut.repository.entered, before: task) else { Issue.record("가입 요청이 시작돼야 한다"); return }
        sut.viewModel.onDisappear()
        await hold.open()
        await task.value
        #expect(sut.viewModel.state == .finished(.signedUp))
        #expect(await sut.push.count == 1)
    }

    @Test("TC-SIGN-018 다시 그리기는 서버 호출 없이 그리기로 돌아간다")
    func redraw() async {
        let sut = SignUpSUT()
        sut.viewModel.redrawTapped()
        #expect(sut.viewModel.state == .finished(.redraw))
        #expect(await sut.repository.calls.isEmpty)
    }

    @Test("TC-ONB-049 REQ-SIGN-012 미리보기가 보일 때 screen_view(onboarding_signature_preview)를 보낸다")
    func screenView() {
        let sut = SignUpSUT()
        sut.viewModel.onAppear()
        #expect(sut.analytics.events == [.screenView(.onboardingSignaturePreview, screenClass: nil)])
    }
}
