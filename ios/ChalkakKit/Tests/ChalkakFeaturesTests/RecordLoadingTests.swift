import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias R = RecordFixtures

@MainActor
@Suite("REC 달력 표시·캐시·재검증·오류", .timeLimit(.minutes(1)))
struct RecordLoadingTests {
    // MARK: 달력 표시

    @Test("TC-REC-008 날짜 칸은 주제 날짜(topicDate)로 정해진다: 10월 31일 칸에 있고 11월 달력에는 나타나지 않는다")
    func topicDateDecidesTheCell() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        #expect(vm.post(on: kst(2026, 10, 31))?.postId == R.post1031)
        #expect(vm.post(on: kst(2026, 11, 1)) == nil)
        #expect(RecordMonthLayout(month: R.oct).cells.contains(kst(2026, 10, 31)))

        w.clock.setKST("2026-11-01T00:00:00")
        await vm.appBecameActive()
        await vm.selectMonth(R.nov)
        #expect(vm.selectedMonth == R.nov)
        #expect(vm.calendar == R.empty(R.nov))
        #expect(vm.post(on: kst(2026, 10, 31)) == nil)
        #expect(vm.visiblePostIDs.isEmpty)
    }

    @Test("TC-REC-011 APPROVED는 썸네일, PENDING은 썸네일 + 배지, 기록 없는 날은 빈 칸이다")
    func cellsByStatus() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()

        let approved = vm.post(on: kst(2026, 10, 20))
        #expect(approved?.status == .approved)
        #expect(approved?.thumbnailImageURL == R.thumbnail(R.post1020))
        let pending = vm.post(on: kst(2026, 10, 27))
        #expect(pending?.status == .pending)
        #expect(pending?.thumbnailImageURL == R.thumbnail(R.post1027Pending))
        #expect(vm.post(on: kst(2026, 10, 21)) == nil)

        vm.dayTapped(kst(2026, 10, 27))
        #expect(vm.showsPendingBadge)
        vm.dayTapped(kst(2026, 10, 20))
        #expect(!vm.showsPendingBadge, "APPROVED에는 배지가 없다")
    }

    @Test("TC-REC-015 응답 배열이 날짜 순서가 아니어도 날짜 칸에 정확히 배치되고 기본 선택은 가장 늦은 날짜다")
    func shuffledResponsePlacement() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in R.octShuffled }

        await vm.recordAppeared()

        #expect(vm.post(on: kst(2026, 10, 20))?.postId == R.post1020)
        #expect(vm.post(on: kst(2026, 10, 27))?.postId == R.post1027Pending)
        #expect(vm.post(on: kst(2026, 10, 31))?.postId == R.post1031)
        #expect(vm.visibleDates == [kst(2026, 10, 20), kst(2026, 10, 27), kst(2026, 10, 31)])
        #expect(vm.selectedDate == kst(2026, 10, 31))
    }

    @Test("TC-REC-036 사용자가 정하지 않았다면 그 달에서 가장 늦은 사진의 날짜가 선택되고, 사진이 없는 달은 선택 없음이다")
    func defaultSelectionIsLatestPhoto() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        #expect(vm.selectedDate == kst(2026, 10, 31))

        await vm.selectMonth(R.sep)
        #expect(vm.selectedDate == kst(2026, 9, 30))
    }

    @Test("TC-REC-036 기록이 없는 달을 불러오면 선택 없음이고 오류가 아니다 (REQ-REC-020)")
    func emptyMonthHasNoSelection() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.oct] }
        await w.repo.setCalendar { R.empty($0) }

        await vm.recordAppeared()

        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.empty(R.oct))
        #expect(vm.selectedDate == nil)
        #expect(vm.selectedPost == nil)
        #expect(w.toast.messages.isEmpty)
    }

    // MARK: 응답 검증 실패 (REQ-REC-018, REQ-REC-019)

    @Test("TC-REC-012 TC-REC-013 TC-REC-014 계약 위반 응답(InvalidResponse)은 처음 불러오기 실패와 같이 오류 화면이고, 다시 시도하면 불러온다")
    func contractViolationIsFirstLoadFailure() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.invalidResponse }

        await vm.recordAppeared()

        #expect(vm.phase == .failed(.other))
        #expect(vm.calendar == nil, "그 응답은 버린다")
        #expect(vm.selectedDate == nil)
        #expect(RecordLoadFailure.other.title == "기록을 불러오지 못했어요")
        #expect(RecordLoadFailure.other.buttonTitle == "다시 시도")
        #expect(w.toast.messages.isEmpty, "오류 화면이 있으면 토스트는 없다")

        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.retryTapped()
        #expect(vm.phase == .loaded, "앱은 깨지지 않고 다시 시도로 복구된다")
        #expect(vm.calendar == R.octCalendar)
    }

    @Test("TC-REC-012 TC-REC-013 이미 보이는 달의 재검증에서 계약 위반 응답이 오면 캐시를 유지하고 토스트만 띄운다")
    func contractViolationOnRevalidationKeepsCache() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.invalidResponse }

        await vm.appBecameActive()

        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
        #expect(w.toast.messages == ["기록을 불러오지 못했어요"])
    }

    // MARK: 늦은 응답 (REQ-REC-026)

    @Test("TC-REC-019 월 이동을 연타해도 마지막으로 고른 달만 보이고 늦게 도착한 다른 달 응답이 화면을 덮지 않는다")
    func lateResponseDoesNotOverwriteLatestMonth() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.oct, R.sep, R.aug] }
        await vm.recordAppeared()
        let lateSeptember = Hold(ignoringCancellation: true)
        await w.repo.setCalendar { month in
            if month == R.sep {
                try? await lateSeptember.wait()
                return R.sepCalendar
            }
            return R.standardCalendar(month)
        }

        let septemberTask = Task { await vm.selectMonth(R.sep) }
        guard await EventWait.signal(w.repo.calendarSignal, atLeast: 2, before: septemberTask) else {
            Issue.record("9월 요청이 먼저 나가야 한다")
            return
        }
        await vm.selectMonth(R.aug)
        #expect(vm.selectedMonth == R.aug)
        #expect(vm.calendar == R.empty(R.aug))

        await lateSeptember.open()
        await septemberTask.value

        #expect(vm.selectedMonth == R.aug)
        #expect(vm.calendar == R.empty(R.aug), "늦게 온 9월 응답이 8월 화면을 덮으면 안 된다")
        #expect(vm.phase == .loaded)
        #expect(vm.selectedDate == nil)
    }

    // MARK: 캐시와 재검증 (REQ-REC-021~025)

    @Test("TC-REC-020 이전에 본 달로 돌아오면 응답 전에도 캐시한 기록을 보여 주고 최신 값으로 교체한다")
    func cachedMonthShownFirstThenReplaced() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await vm.selectMonth(R.sep)
        await vm.selectMonth(R.oct)

        let hold = Hold()
        let refreshed = MonthlyCalendar(year: 2026, month: 9, posts: [R.post(kst(2026, 9, 17), R.post0917)])
        let started = CallSignal()
        await w.repo.setCalendar { month in
            guard month == R.sep else { return R.standardCalendar(month) }
            await started.fire()
            try await hold.wait()
            return refreshed
        }

        let task = Task { await vm.selectMonth(R.sep) }
        guard await EventWait.signal(started, before: task) else {
            Issue.record("캐시를 보여 주면서 곧바로 다시 요청해야 한다")
            return
        }
        #expect(vm.selectedMonth == R.sep)
        #expect(vm.calendar == R.sepCalendar, "응답 전에 캐시를 먼저 보여 준다")
        #expect(vm.phase == .loaded)
        #expect(vm.isRevalidating)

        await hold.open()
        await task.value
        #expect(vm.calendar == refreshed, "최신 값으로 교체")
        #expect(!vm.isRevalidating)
    }

    struct RevalidationFailure: Sendable, CustomTestStringConvertible {
        let failure: FeedFailure
        let toast: String
        var testDescription: String { "\(failure)" }
    }

    @Test("TC-REC-021 TC-REC-029 캐시된 달의 재조회가 실패하면 캐시를 유지하고 토스트를 띄운다(연결 실패는 네트워크 문구)", arguments: [
        RevalidationFailure(failure: .server(status: 500), toast: "기록을 불러오지 못했어요"),
        RevalidationFailure(failure: .invalidResponse, toast: "기록을 불러오지 못했어요"),
        RevalidationFailure(failure: .network, toast: "네트워크 연결을 확인해 주세요."),
    ])
    func revalidationFailureKeepsCache(c: RevalidationFailure) async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.repo.setCalendar { _ in throw c.failure }

        await vm.appBecameActive()

        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
        #expect(!vm.isRevalidating)
        #expect(w.toast.messages == [c.toast])
    }

    @Test("TC-REC-021 처음 가는 달의 실패는 오류 화면이고 이전 달 내용이 남지 않는다 (토스트 없음)")
    func firstVisitFailureClearsPreviousContent() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.server(status: 500) }

        await vm.selectMonth(R.sep)

        #expect(vm.phase == .failed(.other))
        #expect(vm.calendar == nil)
        #expect(vm.selectedDate == nil)
        #expect(vm.selectedMonth == R.sep)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-REC-021 현재 달을 처음 불러오다 실패하면 달력은 비어 있고 다시 시도를 보여 준다")
    func currentMonthFirstLoadFailure() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.server(status: 500) }

        await vm.recordAppeared()

        #expect(vm.phase == .failed(.other))
        #expect(vm.calendar == nil)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-REC-022 탭 재선택·복귀 재검증은 기존 기록을 유지하다 성공한 최신 값으로 교체한다")
    func reselectKeepsThenReplaces() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        let hold = Hold()
        let started = CallSignal()
        await w.repo.setCalendar { _ in
            await started.fire()
            try await hold.wait()
            return R.octAfterDelete
        }

        let task = Task { await vm.recordAppeared() }
        guard await EventWait.signal(started, before: task) else {
            Issue.record("재선택하면 다시 요청해야 한다")
            return
        }
        #expect(vm.calendar == R.octCalendar, "응답 전에는 기존 기록을 유지한다")
        #expect(vm.phase == .loaded)
        #expect(vm.isRevalidating)

        await hold.open()
        await task.value
        #expect(vm.calendar == R.octAfterDelete)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-REC-022 재검증이 실패하면 기존 기록을 유지하고 토스트를 한 번 띄운다")
    func reselectFailureKeepsContent() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.server(status: 500) }

        await vm.recordAppeared()

        #expect(vm.calendar == R.octCalendar)
        #expect(w.toast.messages == ["기록을 불러오지 못했어요"])
    }

    @Test("TC-REC-023 사용자가 고른 날짜는 캐시를 최신 값으로 교체하거나 재검증해도 그 날짜가 아직 있으면 유지된다")
    func selectedDateSurvivesRevalidation() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 20))
        #expect(vm.selectedDate == kst(2026, 10, 20))

        await vm.recordAppeared()
        #expect(vm.selectedDate == kst(2026, 10, 20))
        await vm.appBecameActive()
        #expect(vm.selectedDate == kst(2026, 10, 20))
        #expect(vm.selectedDate != kst(2026, 10, 31), "기본 선택(가장 늦은 날짜)으로 되돌아가면 안 된다")
    }

    @Test("TC-REC-023 재검증으로 선택한 날짜의 사진이 사라지면 그 달의 가장 늦은 사진 날짜로 옮긴다")
    func selectedDateFallsBackWhenPhotoVanishes() async {
        // 스펙에 명시가 없어 REQ-REC-028(삭제 뒤 선택 이동)·REQ-REC-031(기본 선택)을 따랐다(명세 확인 대상).
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 27))
        await w.repo.setCalendar { _ in R.octAfterDelete }

        await vm.appBecameActive()

        #expect(vm.selectedDate == kst(2026, 10, 31))
    }

    // MARK: 삭제 반영 (REQ-REC-027~029)

    @Test("TC-REC-024 삭제가 기록되면 그 날짜 칸이 즉시 비고 선택이 같은 달의 가장 최신 사진 날짜로 옮겨진다", arguments: [
        PostChange.deleted(postId: R.post1027Pending),
        PostChange.unavailable(postId: R.post1027Pending),
    ])
    func deletionAppliesImmediately(change: PostChange) async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 27))

        w.ledger.record(change)

        #expect(vm.post(on: kst(2026, 10, 27)) == nil)
        #expect(vm.visiblePostIDs == [R.post1020, R.post1031])
        #expect(vm.selectedDate == kst(2026, 10, 31))
    }

    @Test("TC-REC-024 선택하지 않은 날짜의 게시물을 지우면 선택 날짜는 그대로다")
    func deletingAnotherDayKeepsSelection() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 20))

        w.ledger.record(.deleted(postId: R.post1031))

        #expect(vm.selectedDate == kst(2026, 10, 20))
        #expect(vm.post(on: kst(2026, 10, 31)) == nil)
    }

    @Test("TC-REC-024 늦은 재검증 응답이 삭제한 postId를 다시 포함해도 걸러 낸다")
    func lateRevalidationDoesNotResurrectDeletedPost() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        w.ledger.record(.deleted(postId: R.post1027Pending))

        await vm.recordAppeared()

        #expect(await w.repo.requestCount(for: R.oct) == 2, "서버는 삭제 직후 아직 그 항목을 포함한 응답을 준다")
        #expect(vm.post(on: kst(2026, 10, 27)) == nil)
        #expect(vm.visiblePostIDs == [R.post1020, R.post1031])
    }

    @Test("TC-REC-024 다른 달을 보는 동안 삭제한 게시물은 캐시된 달을 다시 열 때 응답 전에도 보이지 않는다")
    func cachedMonthFiltersDeletedPost() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await vm.selectMonth(R.sep)
        await vm.selectMonth(R.oct)
        w.ledger.record(.deleted(postId: R.post0917))

        let hold = Hold()
        let started = CallSignal()
        await w.repo.setCalendar { month in
            guard month == R.sep else { return R.standardCalendar(month) }
            await started.fire()
            try await hold.wait()
            return R.sepCalendar
        }
        let task = Task { await vm.selectMonth(R.sep) }
        guard await EventWait.signal(started, before: task) else {
            Issue.record("캐시를 보여 주며 재검증해야 한다")
            return
        }
        #expect(vm.visiblePostIDs == [R.post0930], "캐시에서도 삭제한 게시물을 걸러 낸다")

        await hold.open()
        await task.value
        #expect(vm.visiblePostIDs == [R.post0930], "새 응답에서도 걸러 낸다")
    }

    @Test("TC-REC-024 현재 달의 마지막 게시물을 지워도 현재 달은 선택지에 남고 선택 날짜는 없어진다 (선택지를 임의로 지우지 않는다)")
    func deletingLastPostKeepsMonthOption() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.oct, R.sep] }
        await w.repo.setCalendar { month in
            month == R.oct ? MonthlyCalendar(year: 2026, month: 10, posts: [R.post(kst(2026, 10, 31), R.post1031)]) : R.empty(month)
        }
        await vm.recordAppeared()
        let options = vm.availableMonths

        w.ledger.record(.deleted(postId: R.post1031))

        #expect(vm.calendar == R.empty(R.oct))
        #expect(vm.selectedDate == nil)
        #expect(vm.phase == .loaded)
        #expect(vm.availableMonths == options)
        #expect(vm.availableMonths.contains(R.oct))
    }

    // MARK: 취소 (D-20)

    @Test("TC-REC-027 화면을 벗어나 첫 조회가 취소되면 오류가 아니라 로딩 상태로 남고, 화면이 다시 나타나면 불러온다")
    func cancellationKeepsLoading() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold()
        await w.repo.setCalendar { month in
            try await hold.wait()
            return R.standardCalendar(month)
        }
        let task = Task { await vm.recordAppeared() }
        guard await EventWait.signal(w.repo.calendarSignal, before: task) else {
            Issue.record("첫 조회가 시작되어야 한다")
            return
        }

        vm.recordDisappeared()
        await task.value

        #expect(vm.phase == .loading, "취소는 오류 화면이 아니다")
        #expect(vm.calendar == nil)
        #expect(w.toast.messages.isEmpty)

        await hold.open()
        await vm.recordAppeared()
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
    }

    @Test("TC-REC-027 저장소가 CancellationError를 던져도 오류 화면·토스트가 되지 않는다")
    func cancellationErrorIsNotFailure() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw CancellationError() }

        await vm.recordAppeared()

        #expect(vm.phase == .loading)
        #expect(w.toast.messages.isEmpty)
    }

    // MARK: 오류 종류별 처리 (REQ-REC-024)

    @Test("TC-REC-029 오프라인으로 첫 진입하면 오류 + 다시 시도이고, 온라인 복귀 후 다시 시도하면 성공 로드된다")
    func offlineThenRetry() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.network }

        await vm.recordAppeared()
        #expect(vm.phase == .failed(.other))

        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.retryTapped()
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
    }

    @Test("TC-REC-030 인증이 풀려 401을 받으면 \"로그인이 필요해요\" + \"로그인 하기\" 오류 화면이고, 버튼을 눌러야 로그인 화면으로 간다")
    func unauthorizedShowsLoginRequired() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.unauthorized }

        await vm.recordAppeared()

        #expect(vm.phase == .failed(.loginRequired))
        #expect(RecordLoadFailure.loginRequired.title == "로그인이 필요해요")
        #expect(RecordLoadFailure.loginRequired.buttonTitle == "로그인 하기")
        #expect(vm.calendar == nil)
        #expect(!vm.needsLogin)

        vm.loginTapped()
        #expect(vm.needsLogin)
        vm.consumeNeedsLogin()
        #expect(!vm.needsLogin)
    }

    @Test("TC-REC-031 서버 400은 \"조회할 수 없는 연월이에요\"로 처리하고 다시 시도 버튼은 없다")
    func badRequestShowsInvalidMonth() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.badRequest(message: "조회 연월이 올바르지 않습니다.") }

        await vm.recordAppeared()

        #expect(vm.phase == .failed(.invalidMonth))
        #expect(RecordLoadFailure.invalidMonth.title == "조회할 수 없는 연월이에요")
        #expect(RecordLoadFailure.invalidMonth.buttonTitle == nil)
        #expect(vm.calendar == nil)
    }

    @Test("TC-REC-032 서버 500은 \"기록을 불러오지 못했어요\" + 다시 시도이고, 다시 시도하면 같은 달을 다시 요청한다")
    func serverErrorShowsRetry() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.server(status: 500) }

        await vm.recordAppeared()
        #expect(vm.phase == .failed(.other))
        #expect(await w.repo.requestCount(for: R.oct) == 1)

        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.retryTapped()
        #expect(vm.phase == .loaded)
        #expect(await w.repo.requestCount(for: R.oct) == 2)
    }
}
