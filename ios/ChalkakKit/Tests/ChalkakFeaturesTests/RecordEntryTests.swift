import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias R = RecordFixtures

@MainActor
@Suite("REC 진입(날짜 지정)·게스트·계정 전환·분석", .timeLimit(.minutes(1)))
struct RecordEntryTests {
    // MARK: 홈 주간 기록에서 날짜를 지정해 진입 (REQ-REC-032)

    @Test("TC-REC-025 이전 달 날짜를 지정해 열면 그 달과 날짜가 선택되고 최신 사진보다 우선하며 재검증에도 유지된다")
    func requestedDateWinsOverLatest() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()

        await vm.recordAppeared(requestedDate: kst(2026, 9, 17))

        #expect(vm.selectedMonth == R.sep)
        #expect(vm.selectedDate == kst(2026, 9, 17), "9월의 가장 최신 사진(9/30)이 아니라 요청한 날짜")
        #expect(await w.repo.requestedMonths == [R.sep])

        await vm.appBecameActive()
        #expect(vm.selectedDate == kst(2026, 9, 17), "재검증에도 유지")
        await vm.recordAppeared()
        #expect(vm.selectedDate == kst(2026, 9, 17))
    }

    @Test("TC-REC-025 본 적 있는 달이면 응답 전에도 캐시에서 해당 날짜 사진을 보여 준다")
    func requestedDateShownFromCacheBeforeResponse() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await vm.selectMonth(R.sep)
        await vm.selectMonth(R.oct)

        let hold = Hold()
        let started = CallSignal()
        await w.repo.setCalendar { month in
            guard month == R.sep else { return R.standardCalendar(month) }
            await started.fire()
            try await hold.wait()
            return R.sepCalendar
        }
        let task = Task { await vm.recordAppeared(requestedDate: kst(2026, 9, 17)) }
        guard await EventWait.signal(started, before: task) else {
            Issue.record("캐시를 보여 주며 9월을 재검증해야 한다")
            return
        }

        #expect(vm.selectedMonth == R.sep)
        #expect(vm.selectedDate == kst(2026, 9, 17))
        #expect(vm.selectedPost?.postId == R.post0917, "응답 전에 캐시에서 그 날짜 사진을 보여 준다")
        #expect(vm.phase == .loaded)

        await hold.open()
        await task.value
        #expect(vm.selectedDate == kst(2026, 9, 17))
    }

    @Test("TC-REC-025 같은 달을 이미 불러오는 중이면 같은 요청을 다시 보내지 않는다")
    func inFlightMonthIsNotRequestedTwice() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        let hold = Hold()
        await w.repo.setCalendar { month in
            try await hold.wait()
            return R.standardCalendar(month)
        }

        let first = Task { await vm.recordAppeared(requestedDate: kst(2026, 9, 17)) }
        guard await EventWait.signal(w.repo.calendarSignal, before: first) else {
            Issue.record("첫 요청이 나가야 한다")
            return
        }
        let second = Task { await vm.recordAppeared(requestedDate: kst(2026, 9, 17)) }
        await hold.open()
        await first.value
        await second.value

        #expect(await w.repo.requestCount(for: R.sep) == 1)
        #expect(vm.selectedDate == kst(2026, 9, 17))
        #expect(vm.phase == .loaded)
    }

    @Test("TC-REC-026 지정한 날짜의 게시물이 삭제되어 없으면 다른 사진을 대신 열지 않고 기본 선택(가장 최신 사진)을 따른다")
    func requestedDateWithoutPhotoFallsBackToDefault() async {
        // 스펙 REQ-REC-032("기본 선택을 따른다")를 따랐다. 카탈로그 문구("다른 날짜의 사진을 대신 열지 않는다")와 해석 차이가 있다(명세 확인 대상).
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in R.octAfterDelete }

        await vm.recordAppeared(requestedDate: kst(2026, 10, 27))

        #expect(vm.selectedMonth == R.oct)
        #expect(vm.selectedDate == kst(2026, 10, 31))
        #expect(vm.selectedDate != kst(2026, 10, 20), "지정 날짜 근처 사진으로 대체하지 않는다")
        #expect(vm.phase == .loaded)
    }

    @Test("TC-REC-026 사진이 없는 날짜를 지정해도 그 날짜를 선택하지 않는다 (REQ-REC-032)")
    func requestedEmptyDayIsNotSelected() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()

        await vm.recordAppeared(requestedDate: kst(2026, 10, 21))

        #expect(vm.selectedDate == kst(2026, 10, 31))
    }

    @Test("TC-REC-026 첫 조회가 실패한 뒤 다시 시도해도 요청한 날짜를 선택한다")
    func retryKeepsRequestedDate() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()
        await w.repo.setCalendar { _ in throw FeedFailure.server(status: 500) }
        await vm.recordAppeared(requestedDate: kst(2026, 9, 17))
        #expect(vm.phase == .failed(.other))
        #expect(vm.selectedMonth == R.sep)

        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.retryTapped()

        #expect(vm.phase == .loaded)
        #expect(vm.selectedDate == kst(2026, 9, 17))
    }

    // MARK: 게스트 (D-05)

    @Test("TC-REC-033 게스트는 기록 화면에서 API를 호출하지 않고 로그인 안내 토스트만 본다")
    func guestMakesNoRequests() async {
        let w = RecordWorld(guest: true)
        let vm = await w.makeRecord()

        await vm.recordAppeared()
        await vm.appBecameActive()

        #expect(await w.repo.monthsCount == 0)
        #expect(await w.repo.requestedMonths.isEmpty)
        #expect(vm.phase == .idle)
        #expect(vm.calendar == nil)
        #expect(w.toast.messages.first == "기록을 보려면 로그인이 필요해요")
        #expect(Set(w.toast.messages) == ["기록을 보려면 로그인이 필요해요"])
    }

    @Test("TC-REC-033 게스트가 기록 탭을 누르면 토스트가 뜨고 탭은 바뀌지 않는다")
    func guestTabIsBlocked() {
        let w = RecordWorld(guest: true)
        let shell = MainShellViewModel(access: .guest, toast: w.toast, screens: nil, uploadGate: FakeUploadGate())

        let result = shell.selectTab(.record)

        #expect(result == .blocked)
        #expect(shell.selectedTab == .home)
        #expect(w.toast.messages == [RecordCopy.guest])
    }

    // MARK: 계정 전환 (D-17)

    @Test("TC-REC-028 계정이 바뀌면 이전 계정의 월별 캐시·삭제 기억·선택 날짜가 지워지고 이전 요청의 늦은 응답은 무시된다")
    func accountSwitchClearsStateAndIgnoresLateResponse() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 20))
        w.ledger.record(.deleted(postId: R.post1031))
        #expect(vm.post(on: kst(2026, 10, 31)) == nil)

        // 사용자 A의 재검증 응답이 늦게 도착한다.
        let late = Hold(ignoringCancellation: true)
        let started = CallSignal()
        await w.repo.setCalendar { _ in
            await started.fire()
            try? await late.wait()
            return R.octCalendar
        }
        let task = Task { await vm.appBecameActive() }
        guard await EventWait.signal(started, before: task) else {
            Issue.record("A의 재검증이 진행 중이어야 한다")
            return
        }

        w.viewer.set(FeedFixtures.userB)
        vm.reset(access: .member)

        #expect(vm.phase == .idle)
        #expect(vm.calendar == nil)
        #expect(vm.selectedDate == nil)
        #expect(vm.availableMonths.isEmpty)

        await late.open()
        await task.value
        #expect(vm.phase == .idle, "A 요청의 늦은 응답은 무시한다")
        #expect(vm.calendar == nil)

        // 사용자 B가 들어온다.
        await w.repo.setCalendar { R.standardCalendar($0) }
        await vm.recordAppeared()
        #expect(vm.phase == .loaded)
        #expect(vm.post(on: kst(2026, 10, 31))?.postId == R.post1031, "A의 삭제 기억이 B에게 남지 않는다")
        #expect(vm.selectedDate == kst(2026, 10, 31), "A가 고른 날짜(10/20)가 남지 않는다")
    }

    // MARK: 분석 (D-22)

    @Test("TC-REC-042 기록 화면에 들어오면 screen_view record가 한 번만 전송된다 (재검증·재진입에도 중복 없음)")
    func screenViewSentOnce() async {
        let w = RecordWorld()
        let vm = await w.makeRecord()

        await vm.recordAppeared()
        await vm.recordAppeared()
        await vm.appBecameActive()

        #expect(w.analytics.events == [.screenView(.record, screenClass: nil)])
    }
}
