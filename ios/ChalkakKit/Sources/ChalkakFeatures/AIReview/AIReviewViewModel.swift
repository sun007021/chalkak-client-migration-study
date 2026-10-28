import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// AI 피드백이 붙는 게시물과 그 맥락(상세 응답/홈 카드가 채워 준다).
public struct AIReviewTarget: Sendable, Equatable {
    public let postId: UUID
    /// 상세의 `topic.topicDate`. 요청 가능 판정(오늘 KST)에 쓴다.
    public let topicDate: KSTDate
    /// 내 게시물인가. 아니면 알약·카드도 `GET`도 없다(REQ-AIR-001).
    public let isMine: Bool
    public init(postId: UUID, topicDate: KSTDate, isMine: Bool) {
        self.postId = postId
        self.topicDate = topicDate
        self.isMine = isMine
    }
}

/// AI 피드백 알약(상세)·카드(홈)·시트의 ViewModel. 한 게시물의 상태·폴링·시트를 맡는다(상세와 홈이 같은 규칙, REQ-AIR-050).
///
/// 규칙 기준: docs/spec/features/ai-review.md, D-03. 폴링은 `onAppear`/`confirmStart`/`refresh`/`retryDirectly` 같은 진입점이
/// 끝까지 `await`한다(폴링이 멈출 때 반환) — `onDisappear()`가 진행 중인 모든 작업을 취소한다.
@MainActor
@Observable
public final class AIReviewViewModel {
    private typealias Copy = AIReviewCopy

    /// 상세 화면이면 다시 들어올 때마다 `GET`으로 완료 결과도 갱신하고, 홈이면 같은 게시물의 완료 결과를 재조회하지 않는다(REQ-AIR-051).
    public enum Surface: Sendable, Equatable {
        case detail
        case home
    }

    /// 알약/카드 상태(상태 표 "알약/카드 상태"). 폴링 창 종료는 `.processing` + `isStalled`로 나타낸다.
    public enum Phase: Sendable, Equatable {
        case checking       // 첫 GET 진행
        case checkFailed    // 첫 GET이 404 외 오류
        case hidden         // 404, 내 게시물 아님, 게스트, 지난 주제의 NONE
        case none           // NONE + 요청 가능
        case requesting     // POST 진행
        case processing
        case completed
        case failed         // FAILED. 재요청 가능 여부는 `canRetry`
    }

    public enum Sheet: Sendable, Equatable {
        /// 시작 시트(`isRetry`면 재요청 시트).
        case start(isRetry: Bool)
        case result(AIReviewResult)
        /// 실패 시트. 버튼은 "확인" 하나다(REQ-AIR-015). `reason`은 재요청 불가 사유 문구(`ai.failed.no-more` / `ai.failed.past`), 재요청 가능이면 nil.
        /// 재요청은 시트가 아니라 알약·홈 카드가 맡는다.
        case failed(reason: String?)
    }

    public struct Pill: Sendable, Equatable {
        public let title: String
        public let isEnabled: Bool
        public init(title: String, isEnabled: Bool) {
            self.title = title
            self.isEnabled = isEnabled
        }
    }

    public enum CardAction: Sendable, Equatable {
        case start        // 시작 시트 열기
        case showResult   // 결과 시트 열기
        case retry        // 시트 없이 바로 POST (REQ-AIR-036)
    }

    public struct Card: Sendable, Equatable {
        public let message: String
        public let action: CardAction?
        /// 버튼 문구("자세히 보기", "재요청"). NONE 카드는 카드 자체가 요청 진입이라 nil일 수 있다.
        public let actionTitle: String?
        public init(message: String, action: CardAction?, actionTitle: String?) {
            self.message = message
            self.action = action
            self.actionTitle = actionTitle
        }
    }

    // MARK: 상태

    public private(set) var target: AIReviewTarget
    public private(set) var phase: Phase = .checking
    /// 마지막으로 확인한(검증을 통과한) 서버 상태.
    public private(set) var review: AIReview?
    /// 화면에 보이는 안내/오류(폴링 창 종료 안내, 오류 문구). 화면이 가려지면 지운다.
    public private(set) var message: Notice?
    public private(set) var sheet: Sheet?
    /// 폴링 창(300초)이 끝나 조용히 멈춘 상태. 알약은 "AI 분석중"을 유지한다.
    public private(set) var isStalled = false
    /// 401(재인증 필요)을 받았다. 앱이 D-17 로그인 이동으로 처리한다.
    public private(set) var needsLogin = false

    /// 새 분석·재요청을 보낼 수 있는가: 내 게시물 + 로그인 + `topicDate`가 KST 오늘(시계로 매번 재평가, REQ-AIR-003).
    public var canRequest: Bool {
        target.isMine && !viewer.isGuest && viewer.userId != nil && KST.isToday(target.topicDate, now: clock.now)
    }
    /// 재요청 가능: `FAILED` + 서버 `canRequestAgain` + `canRequest`.
    public var canRetry: Bool { phase == .failed && review?.canRequestAgain == true && canRequest }
    /// 알약. `.hidden`이면 nil. NONE은 요청 조건을 잃으면(자정 경과) 알약도 사라진다.
    public var pill: Pill? {
        switch phase {
        case .hidden: nil
        case .checking: Pill(title: Copy.pillChecking, isEnabled: false)
        case .checkFailed: Pill(title: Copy.pillRecheck, isEnabled: true)
        case .none: canRequest ? Pill(title: Copy.pillRequest, isEnabled: true) : nil
        case .requesting: Pill(title: Copy.pillRequesting, isEnabled: false)
        case .processing: Pill(title: Copy.pillProcessing, isEnabled: false)
        case .completed: Pill(title: Copy.pillView, isEnabled: true)
        case .failed: Pill(title: canRetry ? Copy.pillRetry : Copy.pillFailed, isEnabled: true)
        }
    }
    /// 홈 카드. `.hidden`/`.checking`이면 nil. 첫 조회 실패(`.checkFailed`)는 카드 문구가 명세에 없어 카드를 그리지 않는다(명세 확인 대상).
    public var card: Card? {
        switch phase {
        case .hidden, .checking, .checkFailed: nil
        case .none: canRequest ? Card(message: Copy.cardRequest, action: .start, actionTitle: nil) : nil
        case .requesting, .processing: Card(message: Copy.cardProcessing, action: nil, actionTitle: nil)
        case .completed: Card(message: Copy.cardCompleted, action: .showResult, actionTitle: Copy.cardDetail)
        case .failed:
            canRetry
                ? Card(message: Copy.cardFailed, action: .retry, actionTitle: Copy.cardRetry)
                : Card(message: Copy.cardFailed, action: nil, actionTitle: nil)
        }
    }

    // MARK: 의존성

    private let surface: Surface
    private let repository: any AIReviewRepository
    private let viewer: any ViewerContext
    private let clock: any AppClock

    // MARK: 내부 상태(화면이 읽지 않는다)

    /// 시작한 작업이 아직 유효한지 가리는 표식. 응답이 돌아왔을 때 같은 게시물·같은 계정·같은 진입일 때만 반영한다.
    private struct Ticket {
        let generation: Int
        let postId: UUID
        let owner: String?
    }

    /// `GET` 한 번의 결과. 낡은 응답은 `.discarded`로 걸러 호출 측이 아무것도 바꾸지 않게 한다.
    private enum Fetch {
        case review(AIReview)
        case failure(any Error)
        case discarded
    }

    @ObservationIgnored private let work = ActiveWork()
    @ObservationIgnored private var notices = NoticeSequence()
    /// 이탈·계정 전환·게시물 변경·수동 갱신 때 올라간다. 그 전에 시작한 작업의 응답은 취소를 무시하고 늦게 와도 폐기된다.
    @ObservationIgnored private var generation = 0
    /// 마지막으로 상태를 만든 계정(소문자 userId). 달라지면 이전 계정의 결과를 버린다.
    @ObservationIgnored private var owner: String?
    /// 푸시 진입의 자동 오픈이 아직 남았는가. 첫 성공 응답에서 한 번 쓰고 끝난다(REQ-AIR-047).
    @ObservationIgnored private var pendingAutoOpen: Bool

    /// - Parameter opensSheetOnFirstResult: 푸시(`AI_REVIEW_COMPLETED`/`FAILED`) 진입이면 true. 이 진입의 첫 `GET` 결과가
    ///   COMPLETED면 결과 시트, FAILED면 실패 시트를 한 번만 연다(REQ-AIR-046·047). PROCESSING/NONE이면 열지 않는다.
    public init(
        target: AIReviewTarget, surface: Surface, repository: any AIReviewRepository,
        viewer: any ViewerContext, clock: any AppClock, opensSheetOnFirstResult: Bool = false
    ) {
        self.target = target
        self.surface = surface
        self.repository = repository
        self.viewer = viewer
        self.clock = clock
        pendingAutoOpen = opensSheetOnFirstResult
        owner = viewer.userId?.lowercased()
    }

    // MARK: 생명주기

    /// 화면이 보일 때. `GET` 한 번 → 상태에 따라 분기하고 `PROCESSING`이면 새 300초 창으로 폴링한다(폴링이 멈추면 반환).
    /// 내 게시물이 아니거나 게스트면 요청 없이 `.hidden`. `POST`는 보내지 않는다(REQ-AIR-002).
    public func onAppear() async {
        guard let ticket = restart() else { return }
        // 홈은 같은 게시물의 완료 결과를 다시 조회하지 않고 유지한다(REQ-AIR-051). 상세는 완료 결과도 갱신한다.
        if surface == .home, phase == .completed, review != nil { return }
        await check(ticket)
    }

    /// 화면이 가려질 때(백그라운드·다른 화면·다른 탭). 폴링과 진행 중 요청을 취소하고 그 응답은 버리며 안내를 지운다(REQ-AIR-028).
    public func onDisappear() {
        invalidate()
        message = nil
    }

    /// 다른 게시물을 보여 준다(홈 카드의 게시물이 바뀜). 이전 결과·안내·시트를 지우고 진행 중 작업을 취소한다. 새 `GET`은 `onAppear`가 보낸다.
    /// 같은 값이면 아무것도 하지 않고, 같은 게시물에서 `topicDate`·`isMine`만 바뀌면 상태는 유지하고 target만 갱신한다(REQ-AIR-051).
    public func show(_ target: AIReviewTarget) {
        guard target != self.target else { return }
        guard target.postId != self.target.postId else {
            self.target = target
            return
        }
        invalidate()
        self.target = target
        clearState()
        pendingAutoOpen = false // 푸시 자동 오픈은 처음 열린 게시물의 한 번뿐이다
    }

    /// 수동 `GET`(재확인). 이미 진행 중이던 폴링 응답이 늦게 도착해도 이 결과를 덮지 않는다(REQ-AIR-031).
    /// 결과가 `PROCESSING`이면 지금부터 새 300초 창으로 폴링한다(창이 끝난 뒤 직접 다시 확인하는 동작은 명세에 없다 — 확인 대상).
    public func refresh() async {
        guard let ticket = restart() else { return }
        await check(ticket)
    }

    /// 로그인 계정이 바뀌었을 때(로그아웃·계정 전환). 이전 계정의 결과·시트·안내를 비우고 진행 중 작업을 취소한 뒤 새 계정으로 다시 확인한다.
    /// 계정이 그대로면 아무것도 하지 않는다. 낡은 응답은 상태를 바꾸지 않고 버려지므로, 이 호출이 `.checking`에 남지 않게 하는 유일한 경로다.
    public func viewerDidChange() async {
        guard viewer.userId?.lowercased() != owner else { return }
        await refresh()
    }

    // MARK: 입력

    /// 알약 탭: 상태에 따라 시작 시트 / 재요청 시트 / 결과 시트 / 실패 시트 / 상태 다시 확인(`GET`).
    public func tapPill() async {
        switch phase {
        case .checkFailed: await refresh()
        case .none: if canRequest { sheet = .start(isRetry: false) }
        case .completed: showResult()
        case .failed: sheet = canRetry ? .start(isRetry: true) : failedSheet()
        case .hidden, .checking, .requesting, .processing: break
        }
    }

    /// 시작(재요청) 시트의 "분석 시작하기". 누른 시점에도 요청 가능 여부를 다시 확인하고, 응답 전 추가 `POST`는 보내지 않는다.
    public func confirmStart() async {
        guard phase == .none ? canRequest : canRetry else {
            sheet = nil // 자정 경과 등으로 더는 보낼 수 없으면 열려 있는 시작(재요청) 시트를 닫는다(REQ-AIR-003)
            return
        }
        await sendRequest()
    }

    /// 시트를 닫는다(`POST` 없음).
    public func dismissSheet() {
        sheet = nil
    }

    /// 홈 카드의 버튼/카드 탭.
    public func performCardAction() async {
        switch card?.action {
        case .start: if phase == .none, canRequest { sheet = .start(isRetry: false) }
        case .showResult: showResult()
        case .retry: await retryDirectly()
        case nil: break
        }
    }

    /// 홈 카드의 "재요청": 시작 시트 없이 바로 `POST`(REQ-AIR-036).
    public func retryDirectly() async {
        guard canRetry else { return }
        await sendRequest()
    }

    // MARK: 진입 · 무효화

    /// 새 진입을 시작한다: 이전 작업을 무효화하고, 조회 대상이 아니면 `.hidden`으로 두고 nil을 돌려준다(요청 없음, REQ-AIR-001·007).
    private func restart() -> Ticket? {
        resetIfOwnerChanged()
        invalidate()
        isStalled = false
        message = nil
        guard target.isMine, !viewer.isGuest, viewer.userId != nil else {
            clearState()
            phase = .hidden
            return nil
        }
        if review == nil { phase = .checking } // 이미 아는 상태가 있으면 응답이 올 때까지 그대로 보여 준다
        return makeTicket()
    }

    private func makeTicket() -> Ticket {
        Ticket(generation: generation, postId: target.postId, owner: viewer.userId?.lowercased())
    }

    /// 진행 중인 모든 작업을 취소하고 그 응답을 폐기 대상으로 만든다. 응답을 못 받은 `POST`는 이전 상태로 되돌린다(서버 상태는 다음 `GET`이 맞춘다).
    private func invalidate() {
        generation += 1
        work.cancel()
        if phase == .requesting { phase = phase(for: review) }
    }

    private func clearState() {
        review = nil
        phase = .checking
        sheet = nil
        message = nil
        isStalled = false
        needsLogin = false
    }

    /// 계정이 바뀌었으면 이전 계정의 결과·시트·안내를 모두 버린다(REQ-AIR-023). 상태는 진입점에서만 바꾼다(낡은 응답은 상태를 건드리지 않는다).
    private func resetIfOwnerChanged() {
        let current = viewer.userId?.lowercased()
        guard current != owner else { return }
        owner = current
        invalidate()
        clearState()
        pendingAutoOpen = false
    }

    /// 응답이 돌아온 작업이 아직 유효한가(취소되지 않았고, 이탈·갱신·게시물 변경·계정 전환이 없었다).
    private func isCurrent(_ ticket: Ticket) -> Bool {
        !Task.isCancelled && ticket.generation == generation && ticket.owner == viewer.userId?.lowercased()
    }

    // MARK: 조회

    /// 첫 `GET`(또는 수동 `GET`) → 상태 반영 → `PROCESSING`이면 폴링. 진입점이 폴링이 멈출 때까지 `await`한다.
    private func check(_ ticket: Ticket, silent: Bool = false) async {
        await work.run { [self] in
            switch await fetch(ticket) {
            case .discarded: return
            case let .review(fetched):
                apply(fetched)
                openSheetIfPushed(for: fetched)
                if fetched.status == .processing { await poll(ticket, since: clock.uptime) }
            case let .failure(error):
                handleCheckFailure(error, silent: silent)
            }
        }
    }

    /// `GET` 하나. 취소·낡은 응답은 `.discarded`다(취소를 무시하고 늦게 도착한 응답도 `isCurrent`로 거른다).
    private func fetch(_ ticket: Ticket) async -> Fetch {
        do {
            let fetched = try await repository.status(postId: ticket.postId)
            return isCurrent(ticket) ? .review(fetched) : .discarded
        } catch {
            return !error.isCancellation && isCurrent(ticket) ? .failure(error) : .discarded
        }
    }

    /// 3초 간격 순차 폴링. 창은 `start`부터 300초이고(서버 `requestedAt`은 쓰지 않는다), 넘으면 `GET` 없이 조용히 멈춘다(REQ-AIR-025~027).
    /// 폴링 중 일시 오류는 계속 폴링하고 안내는 한 번만 보인다(REQ-AIR-029).
    private func poll(_ ticket: Ticket, since start: Duration) async {
        var shownError = false
        while true {
            do {
                try await clock.sleep(for: AppConstants.aiReviewPollInterval)
            } catch {
                return // 취소
            }
            guard isCurrent(ticket) else { return }
            if clock.uptime - start >= AppConstants.aiReviewPollWindow {
                isStalled = true
                notify(Copy.pollTimeout)
                return
            }
            switch await fetch(ticket) {
            case .discarded:
                return
            case let .review(fetched):
                apply(fetched)
                guard fetched.status == .processing else { return }
            case let .failure(error):
                switch outcome(of: error) {
                case .hidden:
                    hide()
                    return
                case .loginRequired:
                    requireLogin()
                    return
                case let .transient(text):
                    if !shownError {
                        shownError = true
                        notify(text)
                    }
                }
            }
        }
    }

    /// 폴링 밖 `GET`의 실패. 이전에 확인한 상태가 있으면 유지하고, 없으면 "다시 확인" 상태가 된다(REQ-AIR-016·044).
    /// `silent`는 `POST` 실패 뒤 동기화 조회라서 이미 보인 `POST` 오류 문구를 덮지 않는다.
    private func handleCheckFailure(_ error: any Error, silent: Bool) {
        switch outcome(of: error) {
        case .hidden:
            hide()
        case .loginRequired:
            requireLogin()
            if review == nil { phase = .checkFailed }
        case let .transient(text):
            if !silent { notify(text) }
            if review == nil { phase = .checkFailed }
        }
    }

    /// 조회 실패를 폴링·첫 조회가 같은 기준으로 가르는 결과: 404는 숨김, 401은 재인증, 나머지는 문구를 보이는 일시 오류.
    private enum Outcome {
        case hidden
        case loginRequired
        case transient(String)
    }

    private func outcome(of error: any Error) -> Outcome {
        switch error as? FeedFailure {
        case .notFound: .hidden
        case .unauthorized: .loginRequired
        case .network: .transient(Copy.errorNetwork)
        default: .transient(Copy.errorLoad)
        }
    }

    // MARK: POST

    /// 시트 없이 바로 `POST`를 보낸다. 응답 전에는 `.requesting`이라 추가 입력이 `confirmStart`/`retryDirectly`의 조건에서 걸러진다.
    private func sendRequest() async {
        let previous = phase
        let ticket = makeTicket()
        let windowStart = clock.uptime // 재요청의 창도 이번 POST를 보낸 시각부터다(REQ-AIR-034)
        sheet = nil
        phase = .requesting
        await work.run { [self] in
            // 취소·낡은 응답으로 끝나면 응답 없는 `.requesting`을 이전 상태로 되돌린다. 새 진입이 이미 상태를 바꿨으면(generation 불일치) 건드리지 않는다.
            defer { if ticket.generation == generation, phase == .requesting { phase = phase(for: review) } }
            do {
                let accepted = try await repository.request(postId: ticket.postId)
                guard isCurrent(ticket) else { return }
                apply(accepted)
                if accepted.status == .processing { await poll(ticket, since: windowStart) }
            } catch {
                guard !error.isCancellation, isCurrent(ticket) else { return }
                phase = previous
                await handleRequestFailure(error, ticket: ticket)
            }
        }
    }

    /// `POST` 실패: 이전 단계를 유지하고 자동으로 다시 보내지 않는다. 응답이 모호한 실패(연결 오류·5xx·409·검증 실패)는 `GET`으로 서버 상태에 맞춘다(REQ-AIR-024).
    private func handleRequestFailure(_ error: any Error, ticket: Ticket) async {
        switch error as? FeedFailure {
        case let .badRequest(serverMessage):
            // 서버 message는 표시용으로 그대로 보인다(D-02). 비어 있으면 일반 오류 문구.
            notify(serverMessage.flatMap { $0.isEmpty ? nil : $0 } ?? Copy.errorLoad)
        case .banned:
            notify(Copy.errorBanned)
        case .notFound:
            hide()
            notify(Copy.errorNotFound)
        case .unauthorized:
            requireLogin()
        case .server(status: 409):
            // 서버는 보내지 않지만 방어적으로: 문구 없이 다시 조회한다.
            await check(ticket, silent: true)
        case .network:
            notify(Copy.errorNetwork)
            await check(ticket, silent: true)
        default:
            notify(Copy.errorLoad)
            await check(ticket, silent: true)
        }
    }

    // MARK: 상태 반영

    /// 명세 확인 대상: `POST` 응답이 NONE인 경우의 처리는 정해진 바 없다. 지금은 폴링 없이 NONE 상태로 반영한다.
    private func apply(_ fetched: AIReview) {
        review = fetched
        phase = phase(for: fetched)
    }

    private func phase(for review: AIReview?) -> Phase {
        guard let review else { return .checking }
        return switch review.status {
        case .none: canRequest ? .none : .hidden // 지난 주제의 NONE은 숨긴다(REQ-AIR-004)
        case .processing: .processing
        case .completed: .completed
        case .failed: .failed
        }
    }

    /// 조회 불가(404): 알약·카드를 숨기고 결과를 비운다.
    private func hide() {
        review = nil
        sheet = nil
        phase = .hidden
    }

    private func requireLogin() {
        needsLogin = true
        notify(Copy.errorLogin)
    }

    private func notify(_ text: String) {
        message = notices.make(text)
    }

    // MARK: 시트

    private func showResult() {
        if let result = review?.result { sheet = .result(result) }
    }

    /// 실패 시트. 재요청 가능이면 이유 없이 재요청 버튼을 둔다. 불가 사유는 서버의 `canRequestAgain=false`를 먼저, 그다음 지난 주제를 본다(둘 다면 우선순위는 명세에 없다 — 확인 대상).
    private func failedSheet() -> Sheet {
        if canRetry { return .failed(reason: nil) }
        return .failed(reason: review?.canRequestAgain == true ? Copy.failedPast : Copy.failedNoMore)
    }

    /// 푸시 진입의 첫 성공 응답이 COMPLETED/FAILED면 시트를 한 번만 연다. PROCESSING/NONE이면 열지 않고 기회도 끝난다(REQ-AIR-046·047).
    private func openSheetIfPushed(for fetched: AIReview) {
        guard pendingAutoOpen else { return }
        pendingAutoOpen = false
        switch fetched.status {
        case .completed: showResult()
        case .failed: sheet = failedSheet()
        case .none, .processing: break
        }
    }
}
