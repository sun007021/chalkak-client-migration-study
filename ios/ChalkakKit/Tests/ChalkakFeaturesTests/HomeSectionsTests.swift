import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures
private typealias H = HomeFixtures

@MainActor
@Suite("HOME 주제 머리글·랭킹·이번 주 기록", .timeLimit(.minutes(1)))
struct HomeSectionsTests {
    // MARK: 오늘 주제와 랭킹

    @Test("TC-HOME-015 TC-HOME-053 /topics?date=오늘 → 응답 topicDate로 sort=popular 1페이지(pageSize 20)를 보내고 서버 순서 그대로 앞 5장만 오늘 인기에 담는다")
    func popularTopFive() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()

        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        let queries = await w.posts.listQueries
        #expect(queries.contains(PostListQuery(topicDate: F.today, sort: .popular, page: 1, pageSize: 20)))
        #expect(vm.popularIDs == (1...5).map { w.rankingID(F.today, $0) })
    }

    @Test("TC-HOME-015 주제 응답의 topicDate(정규 날짜)로 목록을 요청한다")
    func usesTopicResponseDate() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.topics.setHandler { date in
            // 요청 날짜와 응답 topicDate가 달라지는 경우(참여 기간이 자정에 맞지 않는 주제, T11)
            date == F.today ? F.topic(F.yesterday) : F.topic(date)
        }
        await vm.homeAppeared()
        let queries = await w.posts.listQueries
        #expect(queries.filter { $0.topicDate == F.yesterday }.count == 2)
        #expect(queries.allSatisfy { $0.sort == .popular && $0.page == 1 && $0.pageSize == 20 })
    }

    @Test("TC-HOME-016 어제(KST) 주제로 같은 방식으로 조회해 앞 5장을 어제 랭킹에 담고 5장 미만이면 있는 만큼 담는다")
    func yesterdayRanking() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.posts.setListHandler { query in
            query.topicDate == F.yesterday ? F.page((1...3).map { F.listItem(100 + $0) }) : F.defaultPage(query)
        }
        await vm.homeAppeared()
        #expect(Set(await w.topics.requestedDates) == [F.today, F.yesterday])
        #expect(vm.rankingIDs == (101...103).map { F.postID($0) })
        #expect(vm.popular.value?.count == 5)
    }

    @Test("TC-HOME-017 어제 날짜 주제가 404이면 어제 랭킹만 빈 상태(\"아직 올라온 사진이 없어요\")이고 다른 섹션은 정상이다")
    func yesterdayTopicMissing() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.topics.setHandler { date in
            if date == F.yesterday { throw FeedFailure.notFound }
            return F.topic(date)
        }
        await vm.homeAppeared()
        #expect(vm.ranking == .ready([]))
        #expect(vm.popular.value?.count == 5)
        #expect(vm.hero == .empty(banned: false))
        #expect(await w.posts.listQueries.allSatisfy { $0.topicDate == F.today })
    }

    @Test("TC-HOME-018 REQ-HOME-006 오늘 주제가 404이면 머리글은 \"아직 준비되지 않았어요\"이고 오늘 인기는 오류가 아니라 빈 상태다")
    func todayTopicNotReady() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.topics.setHandler { date in
            if date == F.today { throw FeedFailure.notFound }
            return F.topic(date)
        }
        await vm.homeAppeared()
        #expect(vm.topicHeader == .notReady)
        #expect(vm.popular == .ready([]))
        #expect(vm.ranking.value?.count == 5)
    }

    @Test("TC-HOME-018 오늘 주제 조회 실패(연결 실패·400·계약 위반)는 \"불러오지 못했어요\" 오류이고 404와 구분된다", arguments: [
        FeedFailure.network, FeedFailure.server(status: 503), FeedFailure.badRequest(message: "미래 날짜"), FeedFailure.invalidResponse,
    ])
    func todayTopicFailure(failure: FeedFailure) async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.topics.setHandler { date in
            if date == F.today { throw failure }
            return F.topic(date)
        }
        await vm.homeAppeared()
        #expect(vm.topicHeader == .failed)
        #expect(vm.popular == .failed("오늘 인기있는 사진 사진을 불러오지 못했어요"))
        #expect(vm.ranking.value?.count == 5)
    }

    @Test("TC-HOME-020 주제는 성공했는데 목록이 실패(500)하면 머리글은 유지되고 오늘 인기 섹션만 오류이며, 목록 404는 빈 상태다")
    func listFailureKeepsHeader() async {
        let failing = HomeWorld()
        let failingVM = failing.makeHome()
        await failing.posts.setListHandler { query in
            if query.topicDate == F.today { throw FeedFailure.server(status: 500) }
            return F.defaultPage(query)
        }
        await failingVM.homeAppeared()
        #expect(failingVM.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        #expect(failingVM.popular == .failed("오늘 인기있는 사진 사진을 불러오지 못했어요"))

        let missing = HomeWorld()
        let missingVM = missing.makeHome()
        await missing.posts.setListHandler { query in
            if query.topicDate == F.today { throw FeedFailure.notFound }
            return F.defaultPage(query)
        }
        await missingVM.homeAppeared()
        #expect(missingVM.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        #expect(missingVM.popular == .ready([]))
    }

    @Test("REQ-HOME-029 해당 날짜의 목록이 404이거나 사진이 0장이면 그 섹션은 \"아직 올라온 사진이 없어요\" 빈 상태다")
    func emptyRankings() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.posts.setListHandler { query in
            if query.topicDate == F.today { throw FeedFailure.notFound }
            return F.page([])
        }
        await vm.homeAppeared()
        #expect(vm.popular == .ready([]))
        #expect(vm.ranking == .ready([]))
    }

    @Test("TC-HOME-020 랭킹 API만 실패하면 해당 랭킹 섹션만 \"{섹션 제목} 사진을 불러오지 못했어요\"이고 히어로·주간 기록·배너는 유지된다")
    func rankingFailureIsIsolated() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.posted(.approved) }
        await w.posts.setListHandler { query in
            if query.topicDate == F.yesterday { throw FeedFailure.server(status: 500) }
            return F.defaultPage(query)
        }
        await vm.homeAppeared()
        #expect(vm.ranking == .failed("어제 랭킹 사진을 불러오지 못했어요"))
        #expect(vm.popular.value?.count == 5)
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(vm.week.value?.days.count == 7)
        if case .items = vm.banners.state {} else { Issue.record("배너는 유지되어야 한다") }
        #expect(w.toast.messages.isEmpty, "최초 로드 실패는 토스트가 아니라 섹션 오류 화면이다")
    }

    @Test("TC-HOME-020 한 섹션의 오류 후 그 섹션만 다시 시도한다(다른 섹션은 다시 부르지 않는다)")
    func rankingRetryOnlyThatSection() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let counter = Counter()
        await w.posts.setListHandler { query in
            if query.topicDate == F.yesterday, await counter.next() == 1 { throw FeedFailure.network }
            return F.defaultPage(query)
        }
        await vm.homeAppeared()
        #expect(vm.ranking.failureMessage != nil)
        let todayCalls = await w.todayRepo.count
        let calendarCalls = await w.calendarRepo.requestedMonths.count
        let popularQueries = await w.posts.listQueries.filter { $0.topicDate == F.today }.count

        await vm.retry(.ranking)

        #expect(vm.rankingIDs == (1...5).map { w.rankingID(F.yesterday, $0) })
        #expect(await w.todayRepo.count == todayCalls)
        #expect(await w.calendarRepo.requestedMonths.count == calendarCalls)
        #expect(await w.posts.listQueries.filter { $0.topicDate == F.today }.count == popularQueries)
    }

    @Test("TC-HOME-020 오늘 인기 다시 시도는 주제 머리글까지 함께 다시 불러온다")
    func popularRetryReloadsHeader() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let counter = Counter()
        await w.topics.setHandler { date in
            if date == F.today, await counter.next() == 1 { throw FeedFailure.network }
            return F.topic(date)
        }
        await vm.homeAppeared()
        #expect(vm.topicHeader == .failed)

        await vm.retry(.popular)

        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        #expect(vm.popular.value?.count == 5)
    }

    @Test("TC-HOME-021 로그인 사용자가 랭킹 사진을 누르면 목록의 값을 시드로 게시물 상세로 이동한다")
    func rankingTapOpensFeedWithSeed() async throws {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        let item = try #require(vm.ranking.value?.first)

        vm.rankingItemTapped(item)

        #expect(w.navigator.calls == [.feed(.listItem(item))])
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-HOME-022 게스트가 랭킹 사진을 누르면 이동 없이 토스트만 뜨고 상세 API는 0건이다")
    func guestRankingTapBlocked() async throws {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()
        await vm.homeAppeared()
        let item = try #require(vm.popular.value?.first)

        vm.rankingItemTapped(item)

        #expect(w.toast.messages == ["게시물 피드를 보려면 로그인이 필요해요"])
        #expect(w.navigator.calls.isEmpty)
        #expect(await w.posts.detailIDs.isEmpty)
    }

    @Test("TC-HOME-023 더 보기는 해당 섹션 날짜(어제·오늘)의 전시를 인기순으로 연다")
    func moreLinks() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        vm.moreTapped(.ranking)
        vm.moreTapped(.popular)
        #expect(w.navigator.calls == [.display(F.yesterday, .popular), .display(F.today, .popular)])
    }

    // MARK: KST 날짜

    @Test("TC-HOME-029 TC-HOME-053 기기 시간대와 무관하게 UTC 10/26 15:00(=KST 10/27 00:00)은 10/27 화요일이다")
    func kstMidnightBoundary() async {
        let w = HomeWorld(now: Instant.parse("2026-10-26T15:00:00Z")!)
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.loadedDate == F.today)
        #expect(Set(await w.topics.requestedDates) == [F.today, F.yesterday])
        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        #expect(vm.weekDates.first == kst(2026, 10, 25))
        #expect(vm.weekDates.last == kst(2026, 10, 31))

        let before = HomeWorld(now: Instant.parse("2026-10-26T14:59:59Z")!)
        let beforeVM = before.makeHome()
        await beforeVM.homeAppeared()
        #expect(beforeVM.loadedDate == F.yesterday)
        #expect(beforeVM.topicHeader == .ready(dateLabel: "10월 26일 · 오늘의 주제", title: "주제 2026-10-26"))
    }

    // MARK: 이번 주 기록

    @Test("TC-HOME-024 오늘 2026-10-27(화)의 이번 주는 일요일 10/25 ~ 토요일 10/31 7칸이고 요일 라벨은 일월화수목금토이며 10월 한 달만 조회한다")
    func weekRange() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.weekDates == [kst(2026, 10, 25), kst(2026, 10, 26), kst(2026, 10, 27), kst(2026, 10, 28), kst(2026, 10, 29), kst(2026, 10, 30), kst(2026, 10, 31)])
        #expect(vm.week.value?.days.map(\.weekdayLabel) == ["일", "월", "화", "수", "목", "금", "토"])
        #expect(await w.calendarRepo.requestedMonths == [YearMonth(year: 2026, month: 10)])
    }

    @Test("TC-HOME-025 주 경계: 일요일 11/1은 11/1~11/7, 토요일 10/31은 10/25~10/31이다", arguments: [
        ("2026-11-01T12:00:00", kst(2026, 11, 1), kst(2026, 11, 7)),
        ("2026-10-31T12:00:00", kst(2026, 10, 25), kst(2026, 10, 31)),
        ("2026-10-31T23:59:59", kst(2026, 10, 25), kst(2026, 10, 31)),
        ("2026-11-01T00:00:00", kst(2026, 11, 1), kst(2026, 11, 7)),
    ])
    func weekBoundaries(now: String, first: KSTDate, last: KSTDate) async {
        let w = HomeWorld()
        w.clock.setKST(now)
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.weekDates.first == first)
        #expect(vm.weekDates.last == last)
        #expect(vm.weekDates.count == 7)
    }

    @Test("TC-HOME-026 월 경계(9/30 수): 주는 9/27~10/3이고 9월·10월을 모두 요청해 합쳐 표시한다")
    func weekAcrossMonths() async {
        let w = HomeWorld()
        w.clock.setKST("2026-09-30T12:00:00")
        let vm = w.makeHome()
        await w.calendarRepo.setHandler { month in
            month.month == 9
                ? H.month(2026, 9, [H.calendarPost(kst(2026, 9, 29)), H.calendarPost(kst(2026, 9, 30))])
                : H.month(2026, 10, [H.calendarPost(kst(2026, 10, 2))])
        }
        await vm.homeAppeared()
        #expect(vm.weekDates.first == kst(2026, 9, 27))
        #expect(vm.weekDates.last == kst(2026, 10, 3))
        #expect(Set(await w.calendarRepo.requestedMonths) == [YearMonth(year: 2026, month: 9), YearMonth(year: 2026, month: 10)])
        #expect(await w.calendarRepo.requestedMonths.count == 2)
        #expect(vm.weekPostDates == [kst(2026, 9, 29), kst(2026, 9, 30), kst(2026, 10, 2)])
        #expect(vm.week.value?.recordedCount == 3)
        #expect(vm.week.value?.countLabel == "3/7")
    }

    @Test("TC-HOME-027 연말 경계(12/31 목): 주는 12/27~1/2이고 2026-12와 2027-01을 조회하며 연도가 바뀌어도 칸 순서가 맞다")
    func weekAcrossYears() async {
        let w = HomeWorld()
        w.clock.setKST("2026-12-31T12:00:00")
        let vm = w.makeHome()
        await w.calendarRepo.setHandler { month in
            month.year == 2026
                ? H.month(2026, 12, [H.calendarPost(kst(2026, 12, 28)), H.calendarPost(kst(2026, 12, 31), status: .pending)])
                : H.month(2027, 1, [])
        }
        await vm.homeAppeared()
        #expect(vm.weekDates == [kst(2026, 12, 27), kst(2026, 12, 28), kst(2026, 12, 29), kst(2026, 12, 30), kst(2026, 12, 31), kst(2027, 1, 1), kst(2027, 1, 2)])
        #expect(Set(await w.calendarRepo.requestedMonths) == [YearMonth(year: 2026, month: 12), YearMonth(year: 2027, month: 1)])
        #expect(vm.weekPostDates == [kst(2026, 12, 28), kst(2026, 12, 31)])
    }

    @Test("TC-HOME-028 윤년 2028-02-29(화): 주는 2/27~3/4이고 2028-02·2028-03 두 달을 조회한다")
    func weekInLeapYear() async {
        let w = HomeWorld()
        w.clock.setKST("2028-02-29T12:00:00")
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.weekDates == [kst(2028, 2, 27), kst(2028, 2, 28), kst(2028, 2, 29), kst(2028, 3, 1), kst(2028, 3, 2), kst(2028, 3, 3), kst(2028, 3, 4)])
        #expect(Set(await w.calendarRepo.requestedMonths) == [YearMonth(year: 2028, month: 2), YearMonth(year: 2028, month: 3)])
    }

    @Test("TC-HOME-030 기록 있는 칸은 사진(상태 포함), 없는 칸은 빈 칸이다. 최초 전시일 이전 날짜 칸도 요청·표시가 정상(빈 칸)이다")
    func weekCells() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.calendarRepo.setHandler { month in
            H.month(month.year, month.month, [H.calendarPost(kst(2026, 10, 25)), H.calendarPost(kst(2026, 10, 27), status: .pending)])
        }
        await vm.homeAppeared()
        let days = vm.week.value?.days ?? []
        #expect(days.map { $0.post?.status } == [.approved, nil, .pending, nil, nil, nil, nil])
        #expect(days.first?.post?.thumbnailImageURL != nil)
        #expect(vm.week.value?.countLabel == "2/7")

        let early = HomeWorld()
        early.clock.setKST("2026-09-17T12:00:00")   // FIRST_TOPIC_DATE가 속한 주(9/13~9/19)
        let earlyVM = early.makeHome()
        await early.calendarRepo.setHandler { month in H.month(month.year, month.month, [H.calendarPost(kst(2026, 9, 17))]) }
        await earlyVM.homeAppeared()
        #expect(earlyVM.weekDates.first == kst(2026, 9, 13))
        #expect(earlyVM.weekPostDates == [kst(2026, 9, 17)])
        #expect(earlyVM.week.value?.days.count == 7)
    }

    @Test("TC-HOME-031 기록 있는 칸을 누르면 기록 탭이 그 날짜(이전 달 포함)로 열리고, 빈 칸은 아무 일도 없으며, 보러가기는 날짜 없이 기록 탭을 연다")
    func weekTaps() async {
        let w = HomeWorld()
        w.clock.setKST("2026-10-01T12:00:00")   // 주: 9/27 ~ 10/3
        let vm = w.makeHome()
        await w.calendarRepo.setHandler { month in
            month.month == 9 ? H.month(2026, 9, [H.calendarPost(kst(2026, 9, 29))]) : H.month(2026, 10, [])
        }
        await vm.homeAppeared()

        vm.weekDayTapped(kst(2026, 9, 29))
        vm.weekDayTapped(kst(2026, 10, 2))   // 빈 칸
        vm.weekDayTapped(kst(2026, 12, 1))   // 이번 주가 아닌 날짜
        vm.weekMoreTapped()

        #expect(w.navigator.calls == [.record(kst(2026, 9, 29)), .record(nil)])
    }

    @Test("TC-HOME-032 주간 기록 조회가 실패하면 해당 섹션만 \"기록을 불러오지 못했어요\"이고 다시 시도하면 그 섹션만 다시 부른다")
    func weekFailureAndRetry() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let counter = Counter()
        await w.calendarRepo.setHandler { month in
            if await counter.next() == 1 { throw FeedFailure.server(status: 500) }
            return H.month(month.year, month.month, [H.calendarPost(F.today)])
        }
        await vm.homeAppeared()
        #expect(vm.week == .failed("기록을 불러오지 못했어요"))
        #expect(vm.hero == .empty(banned: false))
        #expect(vm.popular.value?.count == 5)
        let todayCalls = await w.todayRepo.count

        await vm.retry(.week)

        #expect(vm.weekPostDates == [F.today])
        #expect(await w.todayRepo.count == todayCalls)
    }

    @Test("TC-HOME-033 두 달 중 한 달만 실패하면 부분 표시 없이 섹션 오류이고, 다시 시도하면 두 달을 모두 다시 요청한다")
    func partialMonthFailure() async {
        let w = HomeWorld()
        w.clock.setKST("2026-09-30T12:00:00")
        let vm = w.makeHome()
        let failOctober = Counter()
        await w.calendarRepo.setHandler { month in
            if month.month == 10, await failOctober.next() == 1 { throw FeedFailure.server(status: 500) }
            return month.month == 9 ? H.month(2026, 9, [H.calendarPost(kst(2026, 9, 29))]) : H.month(2026, 10, [])
        }
        await vm.homeAppeared()
        #expect(vm.week == .failed("기록을 불러오지 못했어요"))
        #expect(await w.calendarRepo.requestedMonths.count == 2)

        await vm.retry(.week)

        #expect(await w.calendarRepo.requestedMonths.count == 4)
        #expect(vm.weekPostDates == [kst(2026, 9, 29)])
    }

    @Test("TC-HOME-004 주간 기록이 비어 있어도 7칸은 유지된다")
    func emptyWeekKeepsSevenCells() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.week.value?.days.count == 7)
        #expect(vm.week.value?.recordedCount == 0)
        #expect(vm.week.value?.countLabel == "0/7")
    }
}
