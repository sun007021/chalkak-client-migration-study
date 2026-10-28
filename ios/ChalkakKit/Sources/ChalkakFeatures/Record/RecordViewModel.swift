import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 기록 탭(screen_view `record`)의 ViewModel. docs/spec/features/record.md REQ-REC-001~042.
///
/// 구현자용 계약(테스트가 고정한 동작)
/// - 달 선택지 `availableMonths` = 서버 연월 목록 ∪ KST 현재 달, 연월 최신순·중복 없음(REQ-REC-002). 월 목록 실패(`months()`)는 조용히 무시하고 현재 달만으로 진행한다(REQ-REC-008).
/// - 현재 달은 `recordAppeared`·`appBecameActive`마다 `clock`으로 KST 다시 계산한다(REQ-REC-003). 자정을 넘기면 `availableMonths`만 다시 계산하고 보던 달·선택 날짜는 유지한다(REQ-REC-007).
/// - 첫 진입의 선택 달은 현재 달, `requestedDate`가 있으면 그 날짜가 속한 달(REQ-REC-004, REQ-REC-032). 달 이동(화살표·월 선택·연도 선택)은 `availableMonths` 안에서만 하며
///   현재 선택과 같거나 선택지에 없는 달은 상태 변화도 요청도 없다(REQ-REC-005, REQ-REC-006). 이전=더 오래된 달, 다음=더 최신 달.
/// - 달마다 `calendar(_:)` 응답을 메모리에 캐시한다. 캐시 있는 달은 캐시를 먼저 보여 주고(`isRevalidating`) 곧바로 다시 요청해 교체한다(REQ-REC-021~023).
///   캐시 없는 달은 `.loading`(달력 내용 비움) → `.loaded`/`.failed`. 재검증 실패는 캐시 유지 + 토스트(네트워크면 `FeedCopy.networkError`, 그 밖은 `RecordCopy.errorOther`).
/// - 요청마다 토큰(`ActiveRequest`)을 두어 늦게 온 이전 요청의 응답은 무시한다(REQ-REC-026). 같은 달을 불러오는 중이면 같은 요청을 다시 보내지 않는다(TC-REC-025).
/// - 삭제 기억은 `PostChangeLedger`(D-23)를 쓴다: 캐시·새 응답 모두에서 거르고, 삭제가 기록되면 즉시 반영한다(REQ-REC-027, REQ-REC-028). `availableMonths`는 건드리지 않는다(REQ-REC-029).
/// - 선택 날짜: 사진 있는 날만 선택 가능(REQ-REC-030). 기본은 그 달 `topicDate`가 가장 늦은 사진(REQ-REC-031), 사진이 없으면 nil. 재검증·캐시 교체 때 그 날짜가 아직 있으면 유지한다.
/// - 취소(`recordDisappeared`)는 오류가 아니다: 상태는 그대로(첫 로딩 중이면 `.loading`)이고 토스트가 없다(D-20). 다시 `recordAppeared`하면 불러온다.
/// - `reset(access:)`는 로그아웃·계정 전환: 진행 중 요청을 취소하고 늦은 응답을 버리며, 캐시·월 선택지·선택 날짜·오류를 비우고 `.idle`로 돌아간다(삭제 기억은 `PostChangeLedger`가 뷰어 변경을 감지해 비운다).
/// - `requestedDate`가 있으면 월 목록을 기다리지 않고 그 날짜의 달로 바로 이동해 불러온다. 그 달이 선택지에 없어도 버리지 않는다(REQ-REC-032, 명세 확인 대상: 선택지 밖 달을 보는 동안 화살표는 쓸 수 없다).
/// - 게스트는 API를 호출하지 않고 토스트 `RecordCopy.guest`만 띄운다(REQ-REC-040).
@MainActor
@Observable
public final class RecordViewModel: PostChangeObserver {
    public private(set) var access: MainAccess
    /// KST 현재 달. `recordAppeared`·`appBecameActive`마다 다시 계산한다.
    public private(set) var currentMonth: YearMonth = RecordViewModel.initialMonth
    /// 월 선택지(최신순, 중복 없음).
    public private(set) var availableMonths: [YearMonth] = []
    /// 보고 있는 달.
    public private(set) var selectedMonth: YearMonth = RecordViewModel.initialMonth
    public private(set) var phase: RecordPhase = .idle
    /// 캐시를 보여 주며 서버에 다시 확인하는 중(`.loaded`이고 요청이 진행 중일 때).
    public var isRevalidating: Bool { activeRequest != nil && phase == .loaded }
    /// 보이는 달의 달력(삭제한 게시물은 빠진 상태). `.loading`·`.failed`·`.idle`이면 nil. `posts: []`인 달은 빈 배열을 가진 값이다.
    public private(set) var calendar: MonthlyCalendar?
    /// 선택한 날짜. 사진이 있는 날만 가능, 없으면 nil.
    public private(set) var selectedDate: KSTDate?
    /// "사진 반영 중" 안내 풍선이 열려 있는가.
    public private(set) var isPendingTooltipOpen = false
    /// 이미지 저장 진행 중(중복 탭 무시, REQ-REC-039).
    public private(set) var isSaving = false
    /// "로그인 하기"를 눌렀다 → 로그인 화면으로 가야 한다.
    public private(set) var needsLogin = false

    @ObservationIgnored private let repository: any RecordCalendarRepository
    @ObservationIgnored private let clock: any AppClock
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let navigator: any RecordNavigating
    @ObservationIgnored private let renderer: any CalendarImageRendering
    @ObservationIgnored private let saver: any CalendarImageSaving
    @ObservationIgnored private let ledger: PostChangeLedger?
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let work = ActiveWork()

    /// 달 단위 응답 캐시(삭제 기억을 거르기 전의 원본).
    @ObservationIgnored private var cache: [YearMonth: MonthlyCalendar] = [:]
    /// 서버가 준 월 목록(마지막으로 성공한 값). 선택지는 여기에 현재 달을 합쳐 만든다.
    @ObservationIgnored private var serverMonths: [YearMonth] = []
    /// 달력 요청 토큰의 번호표.
    @ObservationIgnored private var requestCounter = 0
    /// 지금 응답을 기다리는 달력 요청(없으면 nil). 새 요청·화면 이탈·`reset`이 바꾸거나 비워, 이전 요청의 늦은 응답(취소를 무시한 것 포함)을 버린다(REQ-REC-026).
    /// 같은 달의 같은 요청을 다시 보내지 않는 기준도 이것이다(TC-REC-025). `isRevalidating`도 여기서 파생해 정리 누락이 생기지 않는다.
    private var activeRequest: ActiveRequest?
    /// 월 목록 응답을 버릴지 판정하는 에포크. 화면 이탈·`reset`에서 올린다(달력 요청 토큰과 별개).
    @ObservationIgnored private var monthsEpoch = 0
    @ObservationIgnored private var monthsTask: Task<Void, Never>?
    /// 아직 반영하지 못한 `requestedDate`(첫 불러오기 실패 뒤 다시 시도에서도 쓴다). 달력이 화면에 반영되면 비운다.
    @ObservationIgnored private var pendingRequestedDate: KSTDate?
    /// 한 번이라도 들어왔는가. 처음이면 선택 달을 현재 달(또는 요청 날짜의 달)로 정한다.
    @ObservationIgnored private var hasEntered = false

    /// 진행 중인 달력 요청 하나를 가리키는 토큰.
    private struct ActiveRequest: Equatable {
        let id: Int
        let month: YearMonth
    }

    private static let initialMonth = YearMonth(year: 1970, month: 1)

    public init(
        access: MainAccess, repository: any RecordCalendarRepository, clock: any AppClock,
        toast: any ToastPresenting, navigator: any RecordNavigating,
        renderer: any CalendarImageRendering, saver: any CalendarImageSaving,
        ledger: PostChangeLedger? = nil, screens: ScreenTracker? = nil
    ) {
        self.access = access
        self.repository = repository
        self.clock = clock
        self.toast = toast
        self.navigator = navigator
        self.renderer = renderer
        self.saver = saver
        self.ledger = ledger
        self.screens = screens
        ledger?.addObserver(self)
    }

    // MARK: 파생 값

    /// 보고 있는 달의 격자.
    /// `.idle`(아직 들어오지 않았거나 `reset` 직후)에는 빈 배치다.
    public var layout: RecordMonthLayout { phase == .idle ? .empty : RecordMonthLayout(month: selectedMonth) }
    /// 선택지에 있는 연도(최신순, 중복 없음).
    public var availableYears: [Int] { options.years }
    public var canGoToPreviousMonth: Bool { options.older(than: selectedMonth) != nil }
    public var canGoToNextMonth: Bool { options.newer(than: selectedMonth) != nil }
    /// 선택한 날짜의 사진.
    public var selectedPost: CalendarPost? { selectedDate.flatMap(post(on:)) }
    /// 선택한 사진이 PENDING이면 "사진 반영 중" 배지를 보인다(REQ-REC-015, REQ-REC-016).
    public var showsPendingBadge: Bool { selectedPost?.status == .pending }
    /// 선택한 사진이 APPROVED일 때만 "피드에서 보기"·"전시 보러가기"를 보인다(REQ-REC-033).
    public var showsPostActions: Bool { selectedPost?.status == .approved }
    /// 배지 접근성 라벨: 풍선이 닫혀 있으면 "자세한 안내 보기", 열려 있으면 "자세한 안내 닫기".
    public var pendingBadgeAccessibilityLabel: String {
        isPendingTooltipOpen ? RecordCopy.pendingHintClose : RecordCopy.pendingHintOpen
    }

    /// 날짜 칸의 사진(없으면 nil). 응답 순서와 무관하다(TC-REC-015).
    public func post(on date: KSTDate) -> CalendarPost? {
        calendar?.posts.first { $0.topicDate == date }
    }

    // MARK: 생명주기

    /// 기록 화면이 보일 때(탭 진입·재선택·피드/전시에서 복귀 포함). 처음이면 불러오고 이후에는 재검증한다.
    /// `requestedDate`는 홈 주간 기록 등에서 지정한 날짜(없으면 nil). 그 날짜에 사진이 있을 때만 선택한다(REQ-REC-032).
    public func recordAppeared(requestedDate: KSTDate? = nil) async {
        guard access == .member else {
            toast.show(RecordCopy.guest)
            return
        }
        screens?.screenAppeared(.record)
        refreshCurrentMonth()
        // 월 목록은 달력 요청과 나란히 받는다. 실패해도 현재 달로 진행한다(REQ-REC-008).
        let months = refreshMonths()
        // 요청 날짜가 있으면 월 목록을 기다리지 않고 그 날짜의 달로 바로 간다. 선택지에 없는 달이어도 버리지 않는다(REQ-REC-032, 명세 확인 대상).
        var target = hasEntered ? selectedMonth : currentMonth
        if let requestedDate {
            pendingRequestedDate = requestedDate
            target = YearMonth(year: requestedDate.year, month: requestedDate.month)
        }
        if !hasEntered || target != selectedMonth {
            hasEntered = true
            moveTo(target)
        } else if phase == .loaded, let raw = cache[target], let date = pendingRequestedDate {
            present(raw, preferred: date)
            pendingRequestedDate = nil
        }
        await revalidate(target)
        await months.value
    }

    /// 화면 이탈: 진행 중 요청을 취소한다. 취소는 오류가 아니라서 상태는 그대로(첫 로딩 중이면 `.loading`)이고 토스트도 없다(D-20).
    public func recordDisappeared() {
        supersedeRequests()
    }

    /// 앱이 포그라운드로 돌아옴: 현재 달을 다시 계산하고 보는 달을 재검증한다(REQ-REC-003, REQ-REC-023).
    public func appBecameActive() async {
        guard access == .member, hasEntered else { return }
        refreshCurrentMonth()
        let months = refreshMonths()
        await revalidate(selectedMonth)
        await months.value
    }

    /// 오류 화면의 "다시 시도". 마지막으로 요청받은 날짜(`requestedDate`)가 있었다면 그 날짜를 선택한다(TC-REC-026).
    public func retryTapped() async {
        guard access == .member, hasEntered else { return }
        await revalidate(selectedMonth)
    }

    /// 오류 화면의 "로그인 하기".
    public func loginTapped() { needsLogin = true }

    public func consumeNeedsLogin() { needsLogin = false }

    /// 로그아웃·계정 전환.
    public func reset(access newAccess: MainAccess? = nil) {
        supersedeRequests()
        if let newAccess { access = newAccess }
        currentMonth = Self.initialMonth
        selectedMonth = Self.initialMonth
        isSaving = false
        cache = [:]
        serverMonths = []
        availableMonths = []
        pendingRequestedDate = nil
        hasEntered = false
        phase = .idle
        calendar = nil
        selectedDate = nil
        isPendingTooltipOpen = false
        needsLogin = false
    }

    // MARK: 달·날짜 선택

    /// 월 선택(휠/목록). 선택지에 없거나 현재와 같으면 아무 일도 없다.
    public func selectMonth(_ month: YearMonth) async {
        guard access == .member, hasEntered, month != selectedMonth, availableMonths.contains(month) else { return }
        pendingRequestedDate = nil
        moveTo(month)
        await revalidate(month)
    }

    /// 이전 달 화살표(`availableMonths`에서 한 칸 더 오래된 달).
    public func previousMonthTapped() async {
        if let month = options.older(than: selectedMonth) { await selectMonth(month) }
    }

    /// 다음 달 화살표(한 칸 더 최신 달).
    public func nextMonthTapped() async {
        if let month = options.newer(than: selectedMonth) { await selectMonth(month) }
    }

    /// 연도 선택: 그 해에 선택지가 있는 달 중 지금 보는 달의 월 번호와 가장 가까운 달로 이동한다(TC-REC-018). 그 해가 선택지에 없으면 아무 일도 없다.
    /// 거리가 같으면 더 최신 달을 고른다(명세 확인 대상).
    public func selectYear(_ year: Int) async {
        if let month = options.nearest(inYear: year, to: selectedMonth) { await selectMonth(month) }
    }

    /// 날짜 칸 선택: 사진이 있는 칸만(REQ-REC-030).
    public func dayTapped(_ date: KSTDate) {
        guard post(on: date) != nil, date != selectedDate else { return }
        selectedDate = date
        isPendingTooltipOpen = false
    }

    // MARK: 선택한 사진 동작

    /// 배지를 눌러 안내 풍선을 열고 닫는다(REQ-REC-015).
    public func pendingBadgeTapped() {
        guard showsPendingBadge else { return }
        isPendingTooltipOpen.toggle()
    }

    /// "피드에서 보기": `navigator.openFeed(.mine(postId:, thumbnailURL:))`. APPROVED 사진만(REQ-REC-033, REQ-REC-034).
    public func viewFeedTapped() {
        guard showsPostActions, let post = selectedPost else { return }
        navigator.openFeed(.mine(postId: post.postId, thumbnailURL: post.thumbnailImageURL))
    }

    /// "전시 보러가기": `navigator.openDisplay(date: topicDate, sort: .recent)`. APPROVED 사진만(REQ-REC-035).
    public func viewDisplayTapped() {
        guard showsPostActions, let post = selectedPost else { return }
        navigator.openDisplay(date: post.topicDate, sort: .recent)
    }

    // MARK: 이미지 저장

    /// "이미지로 저장": 보는 달을 PNG로 그려 `chalkak-calendar-{yyyy-MM}.png`로 저장하고 토스트를 한 번 띄운다. 저장 중 재탭은 무시한다(REQ-REC-037, REQ-REC-039).
    /// 보이는 달력이 없으면(불러오는 중·오류) 아무 일도 없다. 사진이 없는 달은 저장할 수 있다(명세 확인 대상).
    public func saveImageTapped() async {
        guard !isSaving, let calendar else { return }
        isSaving = true
        defer { isSaving = false }
        let month = selectedMonth
        do {
            let png = try await renderer.renderPNG(of: RecordCalendarSnapshot(month: month, posts: calendar.posts))
            try await saver.savePNG(png, fileName: RecordCopy.calendarFileName(for: month))
            toast.show(RecordCopy.saveOK)
        } catch {
            if error.isCancellation { return }
            toast.show((error as? CalendarImageSaveError) == .permissionDenied ? RecordCopy.saveDenied : RecordCopy.saveFail)
        }
    }

    // MARK: 삭제 반영

    public func postChangeLedger(didRecord change: PostChange) {
        switch change {
        case .deleted, .unavailable:
            // 보이는 달력을 바로 다시 그린다. 다른 달의 캐시는 보여 줄 때 거른다(REQ-REC-027, REQ-REC-028).
            guard phase == .loaded, let raw = cache[selectedMonth] else { return }
            present(raw, preferred: nil)
        case .titleChanged:
            break
        }
    }

    // MARK: 불러오기

    /// 보는 달을 바꾼다: 캐시가 있으면 먼저 보여 주고(`.loaded`), 없으면 달력을 비우고 `.loading`이다(REQ-REC-022).
    private func moveTo(_ month: YearMonth) {
        selectedMonth = month
        selectedDate = nil
        isPendingTooltipOpen = false
        if let raw = cache[month] {
            phase = .loaded
            present(raw, preferred: pendingRequestedDate)
            pendingRequestedDate = nil
        } else {
            phase = .loading
            calendar = nil
        }
    }

    /// `month`(보는 달)를 서버에서 다시 받아 교체한다. 같은 달을 이미 받는 중이면 아무것도 하지 않는다.
    private func revalidate(_ month: YearMonth) async {
        guard access == .member, activeRequest?.month != month else { return }
        requestCounter += 1
        let request = ActiveRequest(id: requestCounter, month: month)
        activeRequest = request
        work.cancel()
        if phase != .loaded {
            phase = .loading
            calendar = nil
        }
        await work.run { [self] in await fetch(request) }
    }

    private func fetch(_ request: ActiveRequest) async {
        // 이 요청이 아직 현재 요청이면 어떤 결말이든(취소 포함) 진행 표시를 거둔다. 그래야 바깥 Task가 취소돼도 다음 진입이 막히지 않는다.
        defer { if activeRequest == request { activeRequest = nil } }
        let month = request.month
        do {
            let raw = try await repository.calendar(month)
            // 취소됐거나 다른 요청에 밀렸으면 상태를 건드리지 않는다.
            guard activeRequest == request, !Task.isCancelled else { return }
            cache[month] = raw
            phase = .loaded
            present(raw, preferred: pendingRequestedDate)
            pendingRequestedDate = nil
        } catch {
            guard activeRequest == request, !Task.isCancelled, !error.isCancellation else { return }
            let failure = error as? FeedFailure ?? .invalidResponse
            if phase == .loaded {
                // 캐시를 보여 주던 중이면 내용을 유지하고 토스트만(REQ-REC-025).
                toast.show(failure == .network ? FeedCopy.networkError : RecordCopy.errorOther)
            } else {
                calendar = nil
                selectedDate = nil
                phase = .failed(Self.loadFailure(failure))
            }
        }
    }

    /// 진행 중인 모든 요청을 취소하고 늦은 응답을 버리게 한다.
    private func supersedeRequests() {
        activeRequest = nil
        monthsEpoch += 1
        monthsTask?.cancel()
        monthsTask = nil
        work.cancel()
    }

    /// 월 목록을 받아 선택지를 다시 만든다. 진행 중인 요청이 있으면 그것을 돌려준다. 실패는 조용히 무시한다(REQ-REC-008).
    private func refreshMonths() -> Task<Void, Never> {
        if let monthsTask { return monthsTask }
        let epoch = monthsEpoch
        let task = Task { @MainActor [self] in
            let months = try? await repository.months()
            guard epoch == monthsEpoch, !Task.isCancelled else { return }
            monthsTask = nil
            if let months {
                serverMonths = months
                recomputeAvailableMonths()
            }
        }
        monthsTask = task
        return task
    }

    // MARK: 내부 보조

    /// KST 현재 달을 다시 계산한다. 보던 달과 선택 날짜는 건드리지 않는다(REQ-REC-003, REQ-REC-007).
    private func refreshCurrentMonth() {
        let today = KST.date(of: clock.now)
        currentMonth = YearMonth(year: today.year, month: today.month)
        recomputeAvailableMonths()
    }

    private func recomputeAvailableMonths() {
        availableMonths = RecordMonthOptions(server: serverMonths, current: currentMonth).months
    }

    private var options: RecordMonthOptions { RecordMonthOptions(months: availableMonths) }

    /// 원본 응답에서 삭제한 게시물을 거르고 화면에 올린다. 선택 날짜는 `preferred` > 지금 선택 > 가장 늦은 사진 순으로 정한다(REQ-REC-028, REQ-REC-031, REQ-REC-032).
    private func present(_ raw: MonthlyCalendar, preferred: KSTDate?) {
        let visible = MonthlyCalendar(
            year: raw.year, month: raw.month,
            posts: raw.posts.filter { !(ledger?.isRemoved($0.postId) ?? false) }
        )
        let dates = Set(visible.posts.map(\.topicDate))
        let previous = selectedDate
        calendar = visible
        if let preferred, dates.contains(preferred) {
            selectedDate = preferred
        } else if let previous, dates.contains(previous) {
            selectedDate = previous
        } else {
            selectedDate = dates.max()
        }
        if selectedDate != previous { isPendingTooltipOpen = false }
    }

    private static func loadFailure(_ failure: FeedFailure) -> RecordLoadFailure {
        switch failure {
        case .unauthorized: .loginRequired
        case .badRequest: .invalidMonth
        default: .other
        }
    }
}
