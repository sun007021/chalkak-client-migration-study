import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 업로드 버튼을 눌렀을 때의 진입 확인 결과(REQ-UPL-001~008).
public enum UploadGateResult: Sendable, Equatable {
    /// 통과. 업로드 화면은 이 `topicDate`를 고정해 가진다(자정이 지나도 이 주제로 제출).
    case proceed(topicDate: KSTDate)
    /// 막힘. 토스트로 보여 줄 문구(게스트, 이미 작성, 주제 없음, 정지, 확인 실패).
    case blocked(Notice)
    /// 토큰 갱신 후에도 401(재인증 필요) — 로그인 화면으로 보낸다. 토스트 없음.
    case loginRequired
    /// 이미 확인 중이라 이번 탭은 무시했다(연타).
    case ignored
    /// `cancel()`로 취소됐다(화면 이탈). 아무것도 열지 않고 문구도 없다.
    case cancelled
}

/// 업로드 진입 게이트(D-14-1). 나중에 NAV의 `UploadEntryGating` 프로토콜에 맞춰 어댑터로 꽂을 수 있게 독립된 타입으로 둔다.
///
/// - 게스트(`viewer.isGuest`)는 API를 부르지 않고 `.blocked(upload.gate.login-required)`.
/// - 로그인 상태: `GET /posts/today`를 1회. 확인 중 재호출은 요청 없이 `.ignored`.
/// - `isPosted` → `.blocked(already-posted)`; 404 → `.blocked(no-open-topic)`; 403 → `.blocked(banned)`(재요청 없음);
///   401 → `.loginRequired`; 그 밖(네트워크, 5xx, 계약 위반 `invalidResponse`) → `.blocked(check-failed)`. 분기는 status로만(D-02).
/// - `cancel()`은 진행 중 요청을 취소하고, 취소를 무시하고 늦게 끝난 응답도 버린다(`.cancelled`).
@MainActor
@Observable
public final class UploadGate {
    public private(set) var isChecking = false

    private let today: any TodayPostRepository
    private let viewer: any ViewerContext

    public init(today: any TodayPostRepository, viewer: any ViewerContext) {
        self.today = today
        self.viewer = viewer
    }

    private var notices = NoticeSequence()
    private var current: Task<Result<TodayPostStatus, any Error>, Never>?
    /// `cancel()`마다 올라간다. 늦게 끝난 응답이 자기 세대가 아니면 버린다.
    private var generation = 0

    public func check() async -> UploadGateResult {
        guard !isChecking else { return .ignored }
        guard !viewer.isGuest else { return blocked(UploadCopy.loginRequired) }
        isChecking = true
        generation += 1
        let mine = generation
        let today = today
        let task = Task { () async -> Result<TodayPostStatus, any Error> in
            do { return .success(try await today.todayStatus()) } catch { return .failure(error) }
        }
        current = task
        let result = await withTaskCancellationHandler { await task.value } onCancel: { task.cancel() }
        guard mine == generation else { return .cancelled }
        isChecking = false
        current = nil
        switch result {
        case let .success(status):
            return status.isPosted ? blocked(UploadCopy.alreadyPosted) : .proceed(topicDate: status.topicDate)
        case let .failure(error):
            if error.isCancellation { return .cancelled }
            // 분기는 FeedFailure(status)로만 한다(D-02). 연결 실패·5xx·계약 위반은 모두 확인 실패다.
            switch error as? FeedFailure {
            case .unauthorized: return .loginRequired
            case .banned: return blocked(UploadCopy.banned)
            case .notFound: return blocked(UploadCopy.noOpenTopic)
            default: return blocked(UploadCopy.checkFailed)
            }
        }
    }

    /// 진행 중인 확인을 취소한다. 취소를 무시하고 늦게 도착한 응답도 버린다.
    public func cancel() {
        generation += 1
        current?.cancel()
        current = nil
        isChecking = false
    }

    private func blocked(_ message: String) -> UploadGateResult {
        .blocked(notices.make(message))
    }
}

/// NAV의 업로드 진입 게이트 포트에 맞춘다. 문구가 있는 토스트는 `declined(message:)`로 넘긴다.
extension UploadGate: UploadEntryGating {
    public nonisolated func checkEntry() async -> UploadEntryResult {
        switch await check() {
        case let .proceed(topicDate): .open(topicDate: topicDate)
        case let .blocked(notice): .declined(message: notice.message)
        case .loginRequired: .loginRequired
        case .ignored, .cancelled: .declined(message: nil)
        }
    }
}
