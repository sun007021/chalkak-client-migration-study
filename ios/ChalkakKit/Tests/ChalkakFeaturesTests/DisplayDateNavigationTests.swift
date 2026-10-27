import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

struct BoundaryCase: Sendable, CustomTestStringConvertible {
    let start: KSTDate
    let clockDay: KSTDate
    let forward: Bool
    let expected: KSTDate
    var testDescription: String { "\(start.string) \(forward ? "다음" : "이전") -> \(expected.string)" }
}

@MainActor
@Suite("DISP 전시 날짜 이동·선택", .timeLimit(.minutes(1)))
struct DisplayDateNavigationTests {
    // MARK: 범위

    @Test("TC-DISP-028 최초 전시일에서는 이전으로 이동하지 않고 요청도 없으며, 다음 날에서 이전은 최초 전시일로 간다")
    func lowerBound() async {
        let first = AppConstants.firstTopicDate
        let atFirst = FeedWorld()
        let vm = atFirst.makeDisplay(initialDate: first)
        await vm.onAppear()
        #expect(!vm.canGoPrevious)
        await vm.goToPreviousDay()
        #expect(vm.selectedDate == first)
        #expect(await atFirst.topics.requestedDates == [first])

        let nextDay = FeedWorld()
        let second = nextDay.makeDisplay(initialDate: F.date(2026, 9, 18))
        await second.onAppear()
        await second.goToPreviousDay()
        #expect(second.selectedDate == first)
        #expect(await nextDay.topics.requestedDates.last == first)
    }

    @Test("TC-DISP-029 오늘에서는 다음으로 이동하지 않고, 어제에서 다음은 오늘이다")
    func upperBound() async {
        let atToday = FeedWorld()
        let vm = atToday.makeDisplay()
        await vm.onAppear()
        #expect(!vm.canGoNext)
        await vm.goToNextDay()
        #expect(vm.selectedDate == F.today)
        #expect(await atToday.topics.requestedDates == [F.today])

        let fromYesterday = FeedWorld()
        let other = fromYesterday.makeDisplay(initialDate: F.yesterday)
        await other.onAppear()
        #expect(other.canGoNext)
        await other.goToNextDay()
        #expect(other.selectedDate == F.today)
        #expect(other.mode == .latest)
        #expect(await fromYesterday.topics.requestedDates.last == F.today)
    }

    @Test("TC-DISP-030 월·연 경계에서 요청 날짜는 정확한 yyyy-MM-dd다", arguments: [
        BoundaryCase(start: F.date(2026, 10, 1), clockDay: F.today, forward: false, expected: F.date(2026, 9, 30)),
        BoundaryCase(start: F.date(2027, 1, 1), clockDay: F.date(2027, 1, 2), forward: false, expected: F.date(2026, 12, 31)),
        BoundaryCase(start: F.date(2026, 12, 31), clockDay: F.date(2027, 1, 2), forward: true, expected: F.date(2027, 1, 1)),
    ])
    func monthYearBoundaries(_ boundary: BoundaryCase) async {
        let world = FeedWorld(now: F.noon(boundary.clockDay))
        let vm = world.makeDisplay(initialDate: boundary.start)
        await vm.onAppear()
        if boundary.forward { await vm.goToNextDay() } else { await vm.goToPreviousDay() }
        #expect(await world.topics.requestedDates.last == boundary.expected)
        #expect(vm.selectedDate == boundary.expected)
        #expect(await world.posts.listQueries.last?.topicDate == boundary.expected)
    }

    @Test("TC-DISP-039 KST 23:59:59까지는 상한이 그날이고 00:00:00부터는 다음 날이다")
    func upperBoundFollowsKSTMidnight() {
        let before = FeedWorld(now: Instant.parse("2026-10-27T14:59:59Z")!)
        #expect(before.makeDisplay().upperBound == F.today)
        let after = FeedWorld(now: Instant.parse("2026-10-27T15:00:00Z")!)
        #expect(after.makeDisplay().upperBound == F.date(2026, 10, 28))
    }

    @Test("TC-DISP-040 자정을 넘겨 돌아오면 상한만 갱신하고 보던 날짜는 유지하며 다음 로드부터 아카이브로 다룬다")
    func midnightPassedWhileOpen() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        #expect(vm.mode == .latest)
        #expect(!vm.canGoNext)
        world.clock.setNow(Instant.parse("2026-10-27T15:00:00Z")!)
        await vm.onAppear()
        #expect(vm.upperBound == F.date(2026, 10, 28))
        #expect(vm.selectedDate == F.today)
        #expect(vm.canGoNext)
        #expect(vm.mode == .archive)
        let query = await world.posts.listQueries.last
        #expect(query?.topicDate == F.today)
        #expect(query?.sort == .popular)
    }

    // MARK: 선택

    @Test("TC-DISP-034 범위 밖 날짜를 고르면 하한~상한의 가까운 끝으로 맞춘다")
    func selectClampsToRange() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        await vm.select(date: F.date(2026, 9, 1))
        #expect(vm.selectedDate == AppConstants.firstTopicDate)
        #expect(await world.topics.requestedDates.last == AppConstants.firstTopicDate)
        await vm.select(date: F.date(2026, 10, 28))
        #expect(vm.selectedDate == F.today)
    }

    @Test("TC-DISP-035 지금 보는 날짜를 다시 고르면 재요청하지 않는다")
    func selectingSameDateDoesNothing() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        await vm.select(date: F.today)
        #expect(await world.topics.requestedDates == [F.today])
        #expect(await world.posts.listQueries.count == 1)
    }

    @Test("TC-DISP-036 날짜 선택 시트는 첫 해는 9월부터, 마지막 해는 오늘의 월까지, 첫 달은 17일부터, 마지막 달은 오늘까지, 사이 달은 말일까지다")
    func pickerRanges() {
        let vm = FeedWorld(now: F.noon(F.date(2027, 3, 10))).makeDisplay()
        #expect(vm.pickerYears == [2026, 2027])
        #expect(vm.pickerMonths(year: 2026) == [9, 10, 11, 12])
        #expect(vm.pickerMonths(year: 2027) == [1, 2, 3])
        #expect(vm.pickerDays(year: 2026, month: 9) == Array(17...30))
        #expect(vm.pickerDays(year: 2026, month: 11) == Array(1...30))
        #expect(vm.pickerDays(year: 2027, month: 2) == Array(1...28))
        #expect(vm.pickerDays(year: 2027, month: 3) == Array(1...10))
    }

    @Test("TC-DISP-037 없는 날은 말일로 맞추고 윤년 2월 29일은 허용한다")
    func pickerDayAdjustment() {
        let vm = FeedWorld(now: F.noon(F.date(2028, 3, 5))).makeDisplay()
        #expect(vm.resolvedPickerDate(year: 2026, month: 11, day: 31) == F.date(2026, 11, 30))
        #expect(vm.resolvedPickerDate(year: 2027, month: 2, day: 29) == F.date(2027, 2, 28))
        #expect(vm.resolvedPickerDate(year: 2028, month: 2, day: 29) == F.date(2028, 2, 29))
        #expect(vm.resolvedPickerDate(year: 2026, month: 9, day: 1) == AppConstants.firstTopicDate)
        #expect(vm.resolvedPickerDate(year: 2028, month: 3, day: 31) == F.date(2028, 3, 5))
    }

    // MARK: 실패 복원

    @Test("TC-DISP-032 TC-DISP-031 날짜 선택으로 건너뛴 날짜가 404이면 보던 전시를 유지하고 토스트를 띄우며 최초 전시일을 바꾸지 않는다")
    func navigationNotFoundRestores() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        let missing = F.date(2026, 10, 20)
        await world.topics.setHandler { date in
            if date == missing { throw FeedFailure.notFound }
            return F.topic(date)
        }
        await vm.select(date: missing)
        #expect(vm.selectedDate == F.today)
        #expect(vm.pendingDate == nil)
        #expect(vm.items == before)
        #expect(vm.state == .loaded)
        #expect(vm.toast?.message == FeedCopy.dateMissing)
        #expect(AppConstants.firstTopicDate == F.date(2026, 9, 17))
        #expect(vm.canGoPrevious)
    }

    @Test("TC-DISP-031 이전 날짜의 목록 조회가 404여도 같은 방식으로 복원한다")
    func navigationPostsNotFoundRestores() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.posts.setListHandler { _ in throw FeedFailure.notFound }
        await vm.goToPreviousDay()
        #expect(vm.selectedDate == F.today)
        #expect(vm.items == before)
        #expect(vm.toast?.message == FeedCopy.dateMissing)
    }

    @Test("TC-DISP-033 날짜 이동 중 네트워크 실패는 경계를 만들지 않고 직전 전시를 유지하며 네트워크 토스트를 띄운다")
    func navigationNetworkFailureRestores() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.topics.setHandler { _ in throw FeedFailure.network }
        await vm.goToPreviousDay()
        #expect(vm.selectedDate == F.today)
        #expect(vm.items == before)
        #expect(vm.toast?.message == FeedCopy.networkError)
        #expect(vm.canGoPrevious)
        #expect(vm.lowerBound == AppConstants.firstTopicDate)
    }

    @Test("TC-DISP-006 TC-DISP-007 첫 로딩이 주제 404이면 빈 상태이고 오류 화면이 아니다(VM 구간)")
    func firstLoadNotFoundIsEmpty() async {
        let world = FeedWorld()
        await world.topics.setHandler { _ in throw FeedFailure.notFound }
        let vm = world.makeDisplay()
        await vm.onAppear()
        #expect(vm.state == .empty)
        #expect(vm.selectedDate == F.today)
        #expect(vm.toast == nil)
        #expect(vm.canGoPrevious)
    }
}
