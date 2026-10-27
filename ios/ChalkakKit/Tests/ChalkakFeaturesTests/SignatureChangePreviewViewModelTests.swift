import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
private struct ChangeSUT {
    let viewModel: SignatureChangePreviewViewModel
    let repository: FakeSignatureRepository
    let analytics: RecordingAnalytics

    init(repository: FakeSignatureRepository = FakeSignatureRepository()) {
        let analytics = RecordingAnalytics()
        self.repository = repository
        self.analytics = analytics
        self.viewModel = SignatureChangePreviewViewModel(draft: SignatureDraft(pngData: testPNG), repository: repository, screenTracker: ScreenTracker(tracker: analytics))
    }
}

private func failing(_ error: any Error) -> FakeSignatureRepository {
    FakeSignatureRepository(changeResults: [.failure(error)])
}

@MainActor
@Suite("SIGN 사인 변경 미리보기·변경하기", .timeLimit(.minutes(1)))
struct SignatureChangePreviewViewModelTests {
    @Test("TC-SIGN-019 사인 변경하기는 저장소에 PNG로 변경을 한 번 요청한다")
    func changeRequestsOnce() async {
        let sut = ChangeSUT()
        await sut.viewModel.changeTapped()
        #expect(await sut.repository.changeCalls == [testPNG])
    }

    @Test("TC-SIGN-025 성공이면 설정으로 돌아가며 토스트 '사인 반영까지 시간이 좀 걸릴 수 있어요!'를 보인다")
    func success() async throws {
        let sut = ChangeSUT()
        await sut.viewModel.changeTapped()
        guard case .finished(.changed(let toast)) = sut.viewModel.state else { Issue.record("changed여야 한다: \(sut.viewModel.state)"); return }
        #expect(toast.message == (try copy("sign.change.done")))
    }

    @Test("TC-SIGN-027 변경 성공 결과는 사인 URL을 담지 않는다(카드는 설정이 보일 때 GET으로 다시 불러온다)")
    func outcomeCarriesNoURL() async {
        let sut = ChangeSUT()
        await sut.viewModel.changeTapped()
        #expect(await sut.repository.lookupCount == 0)
    }

    @Test("REQ-SIGN-021 요청 중에는 진행 상태이고 변경하기가 비활성이다")
    func submittingState() async {
        let hold = Hold()
        let sut = ChangeSUT(repository: FakeSignatureRepository(changeHold: hold))
        #expect(sut.viewModel.isChangeEnabled)
        let task = Task { await sut.viewModel.changeTapped() }
        guard await EventWait.signal(sut.repository.changeEntered, before: task) else { Issue.record("변경 요청이 시작돼야 한다"); return }
        #expect(sut.viewModel.state == .submitting)
        #expect(!sut.viewModel.isChangeEnabled)
        await hold.open()
        await task.value
    }

    @Test("TC-SIGN-036 변경하기 연타해도 변경 요청은 1회뿐이다")
    func rapidTaps() async {
        let hold = Hold()
        let sut = ChangeSUT(repository: FakeSignatureRepository(changeHold: hold))
        let first = Task { await sut.viewModel.changeTapped() }
        guard await EventWait.signal(sut.repository.changeEntered, before: first) else { Issue.record("변경 요청이 시작돼야 한다"); return }
        await sut.viewModel.changeTapped()
        await sut.viewModel.changeTapped()
        await hold.open()
        await first.value
        #expect(await sut.repository.changeCalls.count == 1)
    }

    @Test("TC-SIGN-023 업로드 PUT 실패는 '사인을 저장하지 못했어요'이다")
    func uploadRejected() async throws {
        let sut = ChangeSUT(repository: failing(SignatureChangeError.uploadRejected(status: 403)))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.change.error.generic")))
        #expect(sut.viewModel.isChangeEnabled)
    }

    @Test("TC-SIGN-028 400 SIGNATURE_REUPLOAD_REQUIRED는 '사인을 다시 업로드해 주세요'이고 다음 시도도 저장소 호출(새 발급)이다")
    func reuploadRequired() async throws {
        let sut = ChangeSUT(repository: FakeSignatureRepository(changeResults: [.failure(try apiError(fixture: "signature/users-me-signature__put-reupload-required.json")), .success(())]))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("onb.signup.error.reupload")))
        await sut.viewModel.changeTapped()
        #expect(await sut.repository.changeCalls.count == 2)
        guard case .finished(.changed) = sut.viewModel.state else { Issue.record("changed여야 한다: \(sut.viewModel.state)"); return }
    }

    @Test("TC-SIGN-029 400 BUSINESS_ERROR는 '사용할 수 없는 사인이에요'를 보이고 그리기 화면으로 돌아간다")
    func invalidSignature() async throws {
        let sut = ChangeSUT(repository: failing(try apiError(fixture: "signature/users-me-signature__put-invalid-signature.json")))
        await sut.viewModel.changeTapped()
        guard case .finished(.returnToDrawing(let notice)) = sut.viewModel.state else { Issue.record("returnToDrawing이어야 한다: \(sut.viewModel.state)"); return }
        #expect(notice.message == (try copy("sign.error.invalid")))
    }

    @Test("TC-SIGN-030 TC-SIGN-031 403이면 서버 message가 아니라 '이용이 제한되어 사인을 변경할 수 없어요.'를 보이고 재요청하지 않는다", arguments: [
        "signature/users-me-signature-uploads__forbidden-banned.json", "signature/users-me-signature__put-forbidden-banned.json",
    ])
    func banned(fixture: String) async throws {
        let sut = ChangeSUT(repository: failing(try apiError(fixture: fixture)))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("auth.banned.signature")))
        #expect(await sut.repository.changeCalls.count == 1)
    }

    @Test("TC-SIGN-032 404는 '사인 업로드를 찾을 수 없어요'이다")
    func notFound() async throws {
        let sut = ChangeSUT(repository: failing(try apiError(fixture: "signature/users-me-signature__put-upload-not-found.json")))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.change.error.not-found")))
    }

    @Test("TC-SIGN-033 갱신 후에도 401이면 로그인 화면으로 보내고 '로그인 정보가 만료되었어요'를 보인다")
    func unauthorized() async throws {
        let sut = ChangeSUT(repository: failing(try apiError(fixture: "signature/users-me-signature__put-unauthorized.json")))
        await sut.viewModel.changeTapped()
        guard case .finished(.loginRequired(let notice)) = sut.viewModel.state else { Issue.record("loginRequired여야 한다: \(sut.viewModel.state)"); return }
        #expect(notice.message == (try copy("sign.error.expired")))
    }

    @Test("TC-SIGN-034 네트워크 오류는 '네트워크 연결을 확인해 주세요'이고 사인은 유지되며 다시 누를 수 있다")
    func network() async throws {
        let sut = ChangeSUT(repository: FakeSignatureRepository(changeResults: [.failure(APIError.network), .success(())]))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.error.network")))
        #expect(sut.viewModel.draft == SignatureDraft(pngData: testPNG))
        #expect(sut.viewModel.isChangeEnabled)
        await sut.viewModel.changeTapped()
        #expect(await sut.repository.changeCalls.count == 2)
    }

    @Test("TC-SIGN-035 500은 '사인을 저장하지 못했어요'이다")
    func serverError() async throws {
        let sut = ChangeSUT(repository: failing(try apiError(fixture: "signature/users-me-signature__put-internal-error.json")))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state.message == (try copy("sign.change.error.generic")))
    }

    @Test("TC-SIGN-037 TC-SIGN-042 요청 중 화면이 사라지면 결과를 버리고 오류·토스트 없이 ready로 돌아간다")
    func disappear() async {
        let hold = Hold()
        let sut = ChangeSUT(repository: FakeSignatureRepository(changeHold: hold))
        let task = Task { await sut.viewModel.changeTapped() }
        guard await EventWait.signal(sut.repository.changeEntered, before: task) else { Issue.record("변경 요청이 시작돼야 한다"); return }
        sut.viewModel.onDisappear()
        await task.value
        #expect(sut.viewModel.state == .ready)
    }

    @Test("TC-SIGN-038 변경 중 계정이 바뀌어 저장소가 CancellationError를 던지면 토스트 없이 ready이다")
    func accountSwitchedIsSilent() async {
        let sut = ChangeSUT(repository: failing(CancellationError()))
        await sut.viewModel.changeTapped()
        #expect(sut.viewModel.state == .ready)
    }

    @Test("TC-SIGN-018 다시 그리기는 서버 호출 없이 그리기로 돌아간다")
    func redraw() async {
        let sut = ChangeSUT()
        sut.viewModel.redrawTapped()
        #expect(sut.viewModel.state == .finished(.redraw))
        #expect(await sut.repository.changeCalls.isEmpty)
    }

    @Test("TC-SIGN-043 미리보기가 보일 때 screen_view(change_signature_preview)를 보낸다")
    func screenView() {
        let sut = ChangeSUT()
        sut.viewModel.onAppear()
        #expect(sut.analytics.events == [.screenView(.changeSignaturePreview, screenClass: nil)])
    }

    @Test("TC-ONB-049 TC-SIGN-043 화면 이름이 흐름 순서대로 한 번씩 전송된다(가입, 변경)")
    func flowOrder() {
        let analytics = RecordingAnalytics()
        let tracker = ScreenTracker(tracker: analytics)
        let encoder = FakeSignatureEncoder()
        TermsViewModel(context: testContext, externalOpener: FakeExternalOpener(), screenTracker: tracker).onAppear()
        SignatureDrawingViewModel(kind: .onboarding, canvasSize: SignatureCanvasSize(width: 300, height: 150), encoder: encoder, screenTracker: tracker).onAppear()
        SignUpPreviewViewModel(context: testContext, draft: SignatureDraft(pngData: testPNG), repository: FakeSignUpRepository(), pushRegistration: RecordingPushRegistration(), screenTracker: tracker).onAppear()
        SignatureDrawingViewModel(kind: .change, canvasSize: SignatureCanvasSize(width: 300, height: 150), encoder: encoder, screenTracker: tracker).onAppear()
        SignatureChangePreviewViewModel(draft: SignatureDraft(pngData: testPNG), repository: FakeSignatureRepository(), screenTracker: tracker).onAppear()
        #expect(analytics.events == [
            .screenView(.terms, screenClass: nil), .screenView(.onboardingSignature, screenClass: nil), .screenView(.onboardingSignaturePreview, screenClass: nil),
            .screenView(.changeSignature, screenClass: nil), .screenView(.changeSignaturePreview, screenClass: nil),
        ])
    }
}
