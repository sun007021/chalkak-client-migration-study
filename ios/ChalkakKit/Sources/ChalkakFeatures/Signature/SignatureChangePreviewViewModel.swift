import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 변경 모드 미리보기 + "사인 변경하기" 요청.
@MainActor
@Observable
public final class SignatureChangePreviewViewModel {
    public private(set) var state: SignaturePreviewState = .ready
    public let draft: SignatureDraft

    public var isChangeEnabled: Bool {
        switch state {
        case .ready, .failed: true
        case .submitting, .finished: false
        }
    }

    private let repository: any SignatureRepository
    private let screenTracker: ScreenTracker?
    private let activeWork = ActiveWork()
    private var noticeIds = NoticeSequence()

    public init(draft: SignatureDraft, repository: any SignatureRepository, screenTracker: ScreenTracker?) {
        self.draft = draft
        self.repository = repository
        self.screenTracker = screenTracker
    }

    /// `screen_view(change_signature_preview)`.
    public func onAppear() {
        screenTracker?.screenAppeared(.changeSignaturePreview)
    }

    /// 진행 중·완료 뒤의 재탭은 무시한다. 성공이면 `.finished(.changed(Notice(sign.change.done)))`.
    ///
    /// | 오류 | 결과 |
    /// | --- | --- |
    /// | `CancellationError`(화면 이탈·계정 전환) | `.ready`(알림·토스트 없음) |
    /// | 401 | `.finished(.loginRequired(sign.error.expired))` |
    /// | 403 FORBIDDEN | `.failed(auth.banned.signature)` (서버 message 아님) |
    /// | 400 SIGNATURE_REUPLOAD_REQUIRED | `.failed(onb.signup.error.reupload)` |
    /// | 400 BUSINESS_ERROR | `.finished(.returnToDrawing(sign.error.invalid))` |
    /// | 404 | `.failed(sign.change.error.not-found)` |
    /// | `APIError.network` | `.failed(sign.error.network)` |
    /// | 그 밖(5xx, `SignatureChangeError.uploadRejected` …) | `.failed(sign.change.error.generic)` |
    public func changeTapped() async {
        guard isChangeEnabled else { return }
        state = .submitting
        await activeWork.run { [self] in
            do {
                try await repository.changeSignature(png: draft.pngData)
                state = .finished(.changed(noticeIds.make(SignatureCopy.changeDone)))
            } catch {
                handleFailure(error)
            }
        }
    }

    public func redrawTapped() {
        guard isChangeEnabled else { return }
        state = .finished(.redraw)
    }

    public func dismissError() {
        if case .failed = state { state = .ready }
    }

    public func onDisappear() {
        activeWork.cancel()
    }

    private func handleFailure(_ error: any Error) {
        if error.isCancellation || (error as? AuthError) == .sessionChanged {
            state = .ready
            return
        }
        switch error {
        case APIError.http(401, _, _):
            state = .finished(.loginRequired(noticeIds.make(SignatureCopy.errorExpired)))
        case APIError.http(403, .forbidden, _):
            state = .failed(noticeIds.make(SignatureCopy.bannedSignature))
        case APIError.http(400, .signatureReuploadRequired, _):
            state = .failed(noticeIds.make(OnboardingCopy.signupErrorReupload))
        case APIError.http(400, .businessError, _):
            state = .finished(.returnToDrawing(noticeIds.make(SignatureCopy.errorInvalid)))
        case APIError.http(404, _, _):
            state = .failed(noticeIds.make(SignatureCopy.changeErrorNotFound))
        case APIError.network:
            state = .failed(noticeIds.make(SignatureCopy.errorNetwork))
        default:
            state = .failed(noticeIds.make(SignatureCopy.changeErrorGeneric))
        }
    }
}
