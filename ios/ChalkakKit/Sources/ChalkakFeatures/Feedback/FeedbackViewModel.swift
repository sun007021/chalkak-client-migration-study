import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 피드백 보내기 화면의 ViewModel. docs/spec/features/settings-feedback.md REQ-FDBK-002~014, 테스트: TC-FDBK-*.
///
/// 규칙 요약
/// - 글자 수 = `text`의 앞뒤 공백(`.whitespacesAndNewlines`, 전각 공백 U+3000 포함)을 제거한 뒤 Unicode scalar(code point) 수.
///   grapheme도 UTF-16도 아니고 정규화(NFC/NFD)하지 않는다. 최소 `AppConstants.feedbackMin`(1), 최대 `AppConstants.feedbackMax`(1000).
/// - `canSend`: 글자 수 ≥ 1 이고 전송 중이 아닐 때. 1000자를 넘어도 입력은 막지 않고 `canSend`도 true다 — 보내기 시점에 검증한다(REQ-FDBK-005).
/// - `send()`: `canSend`가 아니면 아무 일도 없다(요청 0건, 연타 방어 REQ-FDBK-006). 1000자 초과면 요청 없이 `errorNotice = fdbk.error.invalid`.
///   그 외에는 `isSending = true`로 `repository.submit(content: 트림한 값)`을 한 번 보낸다.
///   - 성공: 토스트 `fdbk.success`, `text`를 비우고 `isFinished = true`(앱이 화면을 닫는다), `errorNotice = nil`.
///   - 실패(입력 `text`는 그대로, `isSending = false`, 다시 보낼 수 있음, 자동 재시도 없음):
///     `APIError.http(400, ...)` → `fdbk.error.invalid`(서버 message는 보이지 않는다, D-02) / `APIError.network` → "네트워크 연결을 확인해 주세요." /
///     401(`APIError.http(401, ...)`) → 문구 없이 `needsLogin = true` / 그 밖(5xx·429·503·invalidResponse·기타 http) → `fdbk.error.generic`.
///     `errorNotice`는 실패마다 새 id(같은 문구가 연달아도 다시 보인다). 전송을 새로 시작하면 이전 `errorNotice`를 지운다.
///   - 취소(`screenDisappeared()` 또는 CancellationError): 문구·토스트 없이 전송 중만 풀린다. 입력은 유지.
///   - 응답이 도착했을 때 계정이 달라졌으면(`viewer.userId`가 전송 시작 때와 다름, 로그아웃 포함) 결과를 버린다: 토스트·`isFinished`·`errorNotice`·`needsLogin` 모두 변화 없음(TC-FDBK-030).
/// - 분석: `screenAppeared()`가 `screen_view(feedback)`를 보낸다. 피드백 내용은 어떤 이벤트에도 들어가지 않는다(TC-FDBK-034).
@MainActor
@Observable
public final class FeedbackViewModel {
    /// 입력창에 바인딩되는 값.
    public var text: String = ""

    public private(set) var isSending = false
    /// 성공해서 화면을 닫아야 한다.
    public private(set) var isFinished = false
    /// 갱신 후에도 401 — 앱이 로그인 화면으로 보낸다. 입력은 유지된다.
    public private(set) var needsLogin = false
    /// 입력창 아래에 보이는 오류 문구(검증 `fdbk.error.invalid`와 전송 실패 문구 모두).
    public private(set) var errorNotice: Notice?

    /// 트림 후 code point 수.
    public var trimmedCount: Int { trimmed.unicodeScalars.count }
    /// 카운터 표기 "현재 수/1000"(예: "12/1000", 1000 초과도 그대로 "1001/1000").
    public var counterText: String { "\(trimmedCount)/\(AppConstants.feedbackMax)" }
    public var canSend: Bool { trimmedCount >= AppConstants.feedbackMin && !isSending }
    /// 전송 중이면 "보내는 중...", 아니면 "보내기".
    public var sendButtonTitle: String { isSending ? FeedbackCopy.sending : FeedbackCopy.send }

    @ObservationIgnored private let repository: any FeedbackRepository
    @ObservationIgnored private let viewer: any ViewerContext
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let activeWork = ActiveWork()
    @ObservationIgnored private var noticeIds = NoticeSequence()
    /// 전송마다 올라가는 세대. 이전 전송의 늦은 응답이 새 전송의 상태를 건드리지 못하게 한다.
    @ObservationIgnored private var generation = 0

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    public init(repository: any FeedbackRepository, viewer: any ViewerContext, toast: any ToastPresenting, screens: ScreenTracker?) {
        self.repository = repository
        self.viewer = viewer
        self.toast = toast
        self.screens = screens
    }

    /// 화면이 보일 때 `screen_view(feedback)`.
    public func screenAppeared() {
        screens?.screenAppeared(.feedback)
    }

    /// 화면이 사라질 때(닫기·이탈). 진행 중인 전송을 취소한다.
    public func screenDisappeared() {
        // 취소된 전송은 `CancellationError`로 끝나 문구 없이 전송 중만 풀린다(`send()`의 defer).
        activeWork.cancel()
    }

    /// "보내기". 위 "규칙 요약" 참고. 응답이 처리될 때까지 돌아오지 않는다.
    public func send() async {
        guard canSend else { return }
        let content = trimmed
        errorNotice = nil
        guard content.unicodeScalars.count <= AppConstants.feedbackMax else {
            errorNotice = noticeIds.make(FeedbackCopy.errorInvalid)
            return
        }
        generation += 1
        let current = generation
        let owner = viewer.userId?.lowercased()
        isSending = true
        await activeWork.run { [self] in
            defer { if current == generation { isSending = false } }
            do {
                _ = try await repository.submit(content: content)
                // 응답 시점에 로그아웃·계정 전환이 있었으면 결과를 버린다.
                guard viewer.userId?.lowercased() == owner else { return }
                toast.show(FeedbackCopy.success)
                text = ""
                isFinished = true
            } catch {
                guard viewer.userId?.lowercased() == owner else { return }
                handleFailure(error)
            }
        }
    }

    /// 앱이 `needsLogin`을 소비한 뒤 false로 되돌린다.
    public func consumeNeedsLogin() {
        needsLogin = false
    }

    private func handleFailure(_ error: any Error) {
        if error.isCancellation { return }
        switch error {
        // 서버 message는 보이지 않고 고정 문구를 쓴다(D-02).
        // 명세 확인 대상: BUSINESS_ERROR 외의 400도 지금은 모두 이 문구로 보인다.
        case APIError.http(400, _, _): errorNotice = noticeIds.make(FeedbackCopy.errorInvalid)
        // 갱신 후에도 401이면 문구 없이 로그인으로 보낸다.
        case APIError.http(401, _, _): needsLogin = true
        case APIError.network: errorNotice = noticeIds.make(FeedbackCopy.errorNetwork)
        default: errorNotice = noticeIds.make(FeedbackCopy.errorGeneric)
        }
    }
}
