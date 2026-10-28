import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias R = RecordFixtures

@MainActor
@Suite("REC 월 선택지·현재 달·월 이동", .timeLimit(.minutes(1)))
struct RecordMonthSelectionTests {
    // MARK: 진입과 월 선택지

    @Test("TC-REC-001 기록 탭에 들어오면 월 목록과 KST 현재 달(2026-10) 달력을 불러오고 Loading → Loaded로 바뀐다")
    func entryLoadsMonthsAndCurrentMonth() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold()
        await w.repo.setCalendar { month in
            try await hold.wait()
            return R.standardCalendar(month)
        }

        let task = Task { await vm.recordAppeared() }
        guard await EventWait.signal(w.repo.calendarSignal, before: task) else {
            Issue.record("진입하면 현재 달 달력을 요청해야 한다")
            return
        }
        #expect(vm.phase == .loading)
        #expect(vm.calendar == nil, "첫 로딩 중에는 달력 내용을 비운다")
        #expect(vm.selectedMonth == R.oct)

        await hold.open()
        await task.value
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
        #expect(await w.repo.monthsCount == 1)
        #expect(await w.repo.requestedMonths == [R.oct])
    }

    struct MonthsCase: Sendable, CustomTestStringConvertible {
        let name: String
        let server: [YearMonth]
        let expected: [YearMonth]
        var testDescription: String { name }
    }

    @Test("TC-REC-002 월 목록은 최신순·중복 없음으로 선택지가 되고, 목록이 비어 있어도 오류 없이 현재 달만 선택지에 있다", arguments: [
        MonthsCase(name: "최신순 응답", server: [R.oct, R.sep], expected: [R.oct, R.sep]),
        MonthsCase(name: "뒤섞인 순서·중복", server: [R.sep, R.oct, R.sep, YearMonth(year: 2025, month: 12)], expected: [R.oct, R.sep, YearMonth(year: 2025, month: 12)]),
        MonthsCase(name: "빈 목록", server: [], expected: [R.oct]),
    ])
    func availableMonthsAreSortedAndUnique(c: MonthsCase) async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { c.server }

        await vm.recordAppeared()

        #expect(vm.availableMonths == c.expected)
        #expect(vm.phase == .loaded, "빈 목록도 오류가 아니다")
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-REC-003 월 목록에 현재 달(2026-10)이 없어도 선택지에 포함되고 현재 달 달력을 조회한다")
    func currentMonthIsAddedWhenServerOmitsIt() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.sep] }

        await vm.recordAppeared()

        #expect(vm.availableMonths == [R.oct, R.sep])
        #expect(vm.selectedMonth == R.oct)
        #expect(await w.repo.requestedMonths == [R.oct])
    }

    @Test("REQ-REC-008 월 목록 조회가 실패해도 현재 달만으로 진행하고 토스트·오류 화면 없이 현재 달 달력을 보여 준다", arguments: [
        FeedFailure.network, FeedFailure.server(status: 500), FeedFailure.unauthorized,
    ])
    func monthsFailureIsSilent(failure: FeedFailure) async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { throw failure }

        await vm.recordAppeared()

        #expect(vm.availableMonths == [R.oct])
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-REC-004 선택지 안의 기록 없는 달(2026-08)로 이동하면 오류 없는 빈 달이고, 선택지에 없는 달(2026-07)은 이동하지 않는다")
    func emptyMonthInOptionsIsReachableButUnlistedIsNot() async {
        // 스펙 REQ-REC-005·006(선택지 안에서만 이동)을 따랐다. 카탈로그의 "월 목록은 이동을 제한하지 않는다"와 충돌한다(명세 확인 대상).
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.oct, R.sep, R.aug] }
        await vm.recordAppeared()

        await vm.selectMonth(R.aug)
        #expect(vm.selectedMonth == R.aug)
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.empty(R.aug), "빈 달력(날짜만 있는 격자)이다")
        #expect(vm.selectedDate == nil)
        #expect(w.toast.messages.isEmpty)

        let before = await w.repo.requestedMonths
        await vm.selectMonth(YearMonth(year: 2026, month: 7))
        #expect(vm.selectedMonth == R.aug)
        #expect(await w.repo.requestedMonths == before, "선택지에 없는 달은 요청도 없다")
    }

    // MARK: 현재 달 계산 (D-19)

    struct InstantCase: Sendable, CustomTestStringConvertible {
        let instant: String
        let month: YearMonth
        var testDescription: String { instant }
    }

    @Test("TC-REC-005 KST 월말 경계: 14:59:59Z는 2026-10, 15:00:00Z(KST 11/01 00:00:00)는 2026-11이다", arguments: [
        InstantCase(instant: "2026-10-31T14:59:59Z", month: R.oct),
        InstantCase(instant: "2026-10-31T15:00:00Z", month: R.nov),
        InstantCase(instant: "2026-10-31T23:59:59+09:00", month: R.oct),
        InstantCase(instant: "2026-11-01T00:00:00+09:00", month: R.nov),
    ])
    func currentMonthAtMonthBoundary(c: InstantCase) async {
        let w = RecordWorld(now: Instant.parse(c.instant)!)
        let vm = await w.makeRecord()

        await vm.recordAppeared()

        #expect(vm.currentMonth == c.month)
        #expect(vm.selectedMonth == c.month, "첫 진입 선택 달은 현재 달이다")
        #expect(vm.availableMonths.first == c.month, "서버 목록(10·9월)에 없어도 현재 달이 선택지의 맨 앞이다")
        #expect(await w.repo.requestedMonths == [c.month])
    }

    @Test("TC-REC-006 연말 경계: 2026-12-31T14:59:59Z는 2026-12, 15:00:00Z는 2027-01이다", arguments: [
        InstantCase(instant: "2026-12-31T14:59:59Z", month: YearMonth(year: 2026, month: 12)),
        InstantCase(instant: "2026-12-31T15:00:00Z", month: YearMonth(year: 2027, month: 1)),
    ])
    func currentMonthAtYearBoundary(c: InstantCase) async {
        let w = RecordWorld(now: Instant.parse(c.instant)!)
        let vm = await w.makeRecord()

        await vm.recordAppeared()

        #expect(vm.currentMonth == c.month)
        #expect(vm.selectedMonth == c.month)
        #expect(await w.repo.requestedMonths == [c.month])
    }

    @Test("TC-REC-007 월이 바뀐 뒤 포그라운드로 돌아오면 현재 달을 다시 계산해 2026-11을 선택지에 넣고, 보던 달·선택 날짜는 유지한다")
    func foregroundAfterMidnightRecomputesCurrentMonth() async {
        let w = RecordWorld()
        w.clock.setKST("2026-10-31T23:59:00")
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 20))
        #expect(vm.currentMonth == R.oct)

        w.clock.setKST("2026-11-01T00:00:00")
        await vm.appBecameActive()

        #expect(vm.currentMonth == R.nov, "프로세스 시작 때 고정하지 않는다")
        #expect(vm.availableMonths == [R.nov, R.oct, R.sep])
        #expect(vm.selectedMonth == R.oct, "사용자가 보던 달은 유지")
        #expect(vm.selectedDate == kst(2026, 10, 20))
        #expect(await w.repo.requestCount(for: R.oct) == 2, "보던 달을 재검증한다")
    }

    @Test("TC-REC-007 월이 바뀐 뒤 기록 탭에 다시 들어와도 현재 달이 2026-11로 다시 계산된다")
    func reenterAfterMidnightRecomputesCurrentMonth() async {
        let w = RecordWorld()
        w.clock.setKST("2026-10-31T23:59:00")
        let vm = await w.loadedRecord()

        w.clock.setKST("2026-11-01T00:00:00")
        await vm.recordAppeared()

        #expect(vm.currentMonth == R.nov)
        #expect(vm.availableMonths.first == R.nov)
        #expect(vm.selectedMonth == R.oct)
    }

    @Test("TC-REC-007 월이 바뀐 뒤 처음 들어오면 2026-11이 현재 달이자 첫 선택 달이고 빈 달력(2026-11-empty)을 오류 없이 보여 준다")
    func firstEntryAfterMidnight() async {
        let w = RecordWorld()
        w.clock.setKST("2026-11-01T00:00:00")
        let vm = await w.makeRecord()

        await vm.recordAppeared()

        #expect(vm.selectedMonth == R.nov)
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.empty(R.nov))
    }

    // MARK: 화살표·월 선택

    @Test("TC-REC-016 이전·다음 달 화살표는 해당 월 달력을 요청하고, 처음 가는 달은 기존 기록을 비우고 로딩하며, 경계에서는 쓸 수 없다")
    func arrowsMoveWithinOptions() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setMonths { [R.oct, R.sep, R.aug] }
        await vm.recordAppeared()
        #expect(vm.canGoToNextMonth == false, "가장 최신 달에서는 다음 화살표를 쓸 수 없다")
        #expect(vm.canGoToPreviousMonth == true)

        let hold = Hold()
        await w.repo.setCalendar { month in
            if month == R.sep { try await hold.wait() }
            return R.standardCalendar(month)
        }
        let task = Task { await vm.previousMonthTapped() }
        guard await EventWait.signal(w.repo.calendarSignal, atLeast: 2, before: task) else {
            Issue.record("이전 달 화살표는 2026-09 달력을 요청해야 한다")
            return
        }
        #expect(vm.selectedMonth == R.sep)
        #expect(vm.phase == .loading)
        #expect(vm.calendar == nil, "처음 가는 달은 이전 달 내용을 비우고 로딩한다")

        await hold.open()
        await task.value
        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.sepCalendar)
        #expect(vm.canGoToNextMonth == true)

        await vm.previousMonthTapped()
        #expect(vm.selectedMonth == R.aug)
        #expect(vm.calendar == R.empty(R.aug))
        #expect(vm.canGoToPreviousMonth == false, "선택지의 가장 오래된 달에서는 이전 화살표를 쓸 수 없다")
        await vm.previousMonthTapped()
        #expect(vm.selectedMonth == R.aug, "경계에서 눌러도 아무 일도 없다")

        await vm.nextMonthTapped()
        #expect(vm.selectedMonth == R.sep)
        await vm.nextMonthTapped()
        #expect(vm.selectedMonth == R.oct)
        #expect(vm.canGoToNextMonth == false)
    }

    @Test("TC-REC-016 선택지에 중간 달이 비어 있으면 화살표는 선택지의 이웃 달로 건너뛴다")
    func arrowsSkipMonthsOutsideOptions() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let december = YearMonth(year: 2025, month: 12)
        await w.repo.setMonths { [R.oct, december] }
        await vm.recordAppeared()

        await vm.previousMonthTapped()
        #expect(vm.selectedMonth == december)
        #expect(await w.repo.requestedMonths.last == december)
        await vm.nextMonthTapped()
        #expect(vm.selectedMonth == R.oct)
    }

    @Test("TC-REC-017 선택지에 없는 달이나 이미 선택된 달을 고르면 상태 변화도 calendar 재요청도 없다")
    func noOpSelections() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        let requested = await w.repo.requestedMonths
        let calendar = vm.calendar

        await vm.selectMonth(R.oct)
        await vm.selectMonth(YearMonth(year: 2026, month: 8))
        await vm.selectMonth(YearMonth(year: 2030, month: 1))

        #expect(vm.selectedMonth == R.oct)
        #expect(vm.calendar == calendar)
        #expect(vm.phase == .loaded)
        #expect(await w.repo.requestedMonths == requested)
    }

    @Test("TC-REC-018 연도를 바꾸면 그 해에 선택지가 있는 달 중 월 번호가 가장 가까운 달로 이동하고, 선택지 밖의 연도는 무시한다")
    func yearSelectionPicksNearestMonth() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let dec2025 = YearMonth(year: 2025, month: 12)
        let mar2025 = YearMonth(year: 2025, month: 3)
        await w.repo.setMonths { [R.oct, R.sep, dec2025, mar2025] }
        await vm.recordAppeared()
        #expect(vm.availableYears == [2026, 2025], "첫 해·마지막 해 범위가 곧 연도 선택 범위다")

        await vm.selectYear(2025)
        #expect(vm.selectedMonth == dec2025, "10월에서 12월(거리 2)이 3월(거리 7)보다 가깝다")
        #expect(await w.repo.requestedMonths.last == dec2025)

        await vm.selectYear(2026)
        #expect(vm.selectedMonth == R.oct, "12월에서 10월(거리 2)이 9월(거리 3)보다 가깝다")

        let before = await w.repo.requestedMonths
        await vm.selectYear(2027)
        await vm.selectYear(2024)
        #expect(vm.selectedMonth == R.oct)
        #expect(await w.repo.requestedMonths == before)
    }
}
