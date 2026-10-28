import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias R = RecordFixtures

@MainActor
@Suite("REC 리뷰 반영: 취소·계정 전환·요청 날짜·오류 분기", .timeLimit(.minutes(1)))
struct RecordReviewTests {
    // MARK: 바깥 Task 취소

    @Test("REQ-REC-026 화면 이탈 없이 바깥 Task만 취소돼도 진행 표시가 풀려 다음 진입이 다시 불러온다")
    func outerTaskCancellationDoesNotWedgeLoading() async {
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

        task.cancel()
        await hold.open()
        await task.value
        #expect(vm.phase == .loading, "취소는 오류가 아니다")
        #expect(w.toast.messages.isEmpty)

        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.recordAppeared()

        #expect(vm.phase == .loaded)
        #expect(await w.repo.requestCount(for: R.oct) == 2)
    }

    // MARK: 월 목록 중 reset

    @Test("D-17 월 목록을 기다리는 중 reset(게스트 전환)해도 이후 달력 요청이 없고 늦은 월 목록이 선택지를 되살리지 않는다")
    func resetToGuestWhileMonthsPending() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold()
        await w.repo.setMonths {
            try? await hold.wait()
            return [R.oct, R.sep]
        }
        let task = Task { await vm.recordAppeared() }
        guard await EventWait.signal(w.repo.monthsSignal, before: task) else {
            Issue.record("월 목록 요청이 나가야 한다")
            return
        }
        let before = await w.repo.requestedMonths.count

        vm.reset(access: .guest)
        await hold.open()
        await task.value

        #expect(await w.repo.requestedMonths.count == before, "reset 뒤에는 달력 요청이 더 없다")
        #expect(vm.phase == .idle)
        #expect(vm.calendar == nil)
        #expect(vm.availableMonths.isEmpty)
        #expect(vm.access == .guest)
    }

    @Test("D-17 계정 전환(회원→다른 회원) 중 도착한 이전 계정의 월 목록은 버리고, 새 계정이 처음부터 다시 시작한다")
    func accountSwitchWhileMonthsPending() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setMonths {
            try? await hold.wait()
            return [R.oct, R.sep, R.aug]
        }
        let task = Task { await vm.recordAppeared() }
        guard await EventWait.signal(w.repo.monthsSignal, before: task) else {
            Issue.record("월 목록 요청이 나가야 한다")
            return
        }

        w.viewer.set(FeedFixtures.userB)
        vm.reset(access: .member)
        await hold.open()
        await task.value

        #expect(vm.phase == .idle)
        #expect(vm.availableMonths.isEmpty, "A의 늦은 월 목록은 무시한다")
        #expect(vm.selectedMonth == YearMonth(year: 1970, month: 1))
        #expect(vm.layout == .empty)

        await w.repo.setMonths { [R.oct] }
        await vm.recordAppeared()
        #expect(vm.availableMonths == [R.oct])
        #expect(vm.phase == .loaded)
    }

    @Test("reset은 저장 중 표시와 현재 달·선택 달도 처음 값으로 되돌리고 idle에는 빈 격자를 낸다")
    func resetRestoresInitialValues() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        #expect(vm.layout.rowCount == 5)

        vm.reset()

        #expect(vm.phase == .idle)
        #expect(vm.currentMonth == YearMonth(year: 1970, month: 1))
        #expect(vm.selectedMonth == YearMonth(year: 1970, month: 1))
        #expect(!vm.isSaving)
        #expect(vm.layout.cells.isEmpty)
    }

    // MARK: 요청 날짜

    @Test("REQ-REC-032 요청 날짜의 달은 월 목록을 기다리지 않고 바로 불러오고, 선택지에 없어도 버리지 않는다")
    func requestedDateDoesNotWaitForMonthsList() async {
        // 명세 확인 대상: 선택지 밖 달을 보는 동안 화살표는 쓸 수 없다.
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold()
        await w.repo.setMonths {
            try? await hold.wait()
            return [R.oct]
        }
        let task = Task { await vm.recordAppeared(requestedDate: kst(2026, 9, 17)) }
        guard await EventWait.signal(w.repo.calendarSignal, before: task) else {
            Issue.record("월 목록을 기다리지 않고 달력을 요청해야 한다")
            return
        }
        await hold.open()
        await task.value

        #expect(await w.repo.requestedMonths == [R.sep])
        #expect(vm.selectedMonth == R.sep)
        #expect(vm.selectedDate == kst(2026, 9, 17))
        #expect(vm.availableMonths == [R.oct])
    }

    // MARK: 오류 분기

    @Test("REQ-REC-042 첫 불러오기의 403은 오류 화면(그 밖의 실패 .other)이다 (정지 문구는 명세 확인 대상)")
    func forbiddenFirstLoadIsOther() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.forbidden }

        await vm.recordAppeared()

        #expect(vm.phase == .failed(.other))
        #expect(vm.calendar == nil)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-REC-025 캐시를 보여 주던 중 재검증이 401이면 캐시를 유지하고 토스트만 띄운다 (로그인 이동은 명세 확인 대상)")
    func unauthorizedOnRevalidationKeepsCache() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.unauthorized }

        await vm.appBecameActive()

        #expect(vm.phase == .loaded)
        #expect(vm.calendar == R.octCalendar)
        #expect(!vm.needsLogin)
        #expect(w.toast.messages == ["기록을 불러오지 못했어요"])
    }

    // MARK: 포그라운드만

    @Test("REQ-REC-023 기록 화면에 한 번도 들어오지 않았다면 포그라운드 복귀는 요청도 screen_view도 만들지 않는다")
    func foregroundWithoutEntryDoesNothing() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()

        await vm.appBecameActive()

        #expect(await w.repo.monthsCount == 0)
        #expect(await w.repo.requestedMonths.isEmpty)
        #expect(vm.phase == .idle)
        #expect(w.analytics.events.isEmpty)
    }
}

@Suite("REC 월 선택지 값")
struct RecordMonthOptionsTests {
    @Test("서버 목록과 현재 달의 합집합을 최신순·중복 없이 만든다")
    func unionSorted() {
        let options = RecordMonthOptions(server: [R.sep, R.oct, R.sep], current: R.nov)
        #expect(options.months == [R.nov, R.oct, R.sep])
        #expect(options.years == [2026])
        #expect(options.older(than: R.oct) == R.sep)
        #expect(options.newer(than: R.oct) == R.nov)
        #expect(options.newer(than: R.nov) == nil)
        #expect(options.older(than: R.sep) == nil)
        #expect(options.older(than: R.aug) == nil, "선택지에 없는 달에는 이웃이 없다")
    }

    @Test("연도 선택은 월 번호가 가장 가까운 달이고 거리가 같으면 더 최신 달이다")
    func nearestMonth() {
        let dec = YearMonth(year: 2025, month: 12)
        let mar = YearMonth(year: 2025, month: 3)
        let options = RecordMonthOptions(server: [dec, mar, YearMonth(year: 2025, month: 7)], current: R.oct)
        #expect(options.nearest(inYear: 2025, to: R.oct) == dec)
        #expect(options.nearest(inYear: 2025, to: YearMonth(year: 2026, month: 5)) == YearMonth(year: 2025, month: 7), "거리 2(7월)가 2(3월)와 같다 → 더 최신")
        #expect(options.nearest(inYear: 2024, to: R.oct) == nil)
    }
}
