import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

@MainActor
@Suite("DISP 전시 페이징·캐시", .timeLimit(.minutes(1)))
struct DisplayPagingTests {
    @Test("TC-DISP-022 끝 임계에 닿으면 다음 페이지를 1회만 요청하고(진행 중 중복 없음) 이어 붙인다")
    func nextPageRequestedOnce() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        // 앞쪽 셀은 임계에 닿지 않는다.
        await vm.itemAppeared(vm.itemID(0))
        #expect(await world.posts.listQueries.count == 1)

        let hold = Hold()
        await world.posts.setListHandler { query in
            try await hold.wait()
            return F.defaultPage(query)
        }
        let lastID = vm.itemID(19)
        let thirdFromEnd = vm.itemID(17)
        let task = Task { await vm.itemAppeared(thirdFromEnd) }
        await world.posts.listSignal.wait(atLeast: 2)
        #expect(vm.isPaging)
        await vm.itemAppeared(lastID)   // 진행 중이므로 요청 없음
        await hold.open()
        await task.value
        let queries = await world.posts.listQueries
        #expect(queries.count == 2)
        #expect(queries.dropFirst().first?.page == 2)
        #expect(queries.dropFirst().first?.pageSize == 20)
        #expect(vm.items.count == 40)
        #expect(!vm.isPaging)
        #expect(!vm.hasNext)
    }

    @Test("TC-DISP-024 첫 페이지 재검증 중에는 다음 페이지를 요청하지 않는다")
    func noPagingWhileRevalidating() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let lastID = vm.itemID(19)
        let hold = Hold()
        await world.posts.setListHandler { query in
            try await hold.wait()
            return F.defaultPage(query)
        }
        let task = Task { await vm.tabReselected() }
        await world.posts.listSignal.wait(atLeast: 2)
        #expect(vm.isRefreshing)
        await vm.itemAppeared(lastID)
        await hold.open()
        await task.value
        #expect(await world.posts.listQueries.count == 2)
    }

    @Test("TC-DISP-025 2페이지까지 캐시한 뒤 첫 페이지만 재검증해도 캐시된 다음 페이지는 유지된다")
    func tailKeptAfterFirstPageRevalidation() async {
        for sort in [PostSort.recent, .popular] {
            let world = FeedWorld()
            let vm = world.makeDisplay(initialSort: sort)
            await vm.onAppear()
            await vm.itemAppeared(vm.itemID(19))
            let tail = Array(vm.items.map(\.id).dropFirst(20))
            await world.posts.setListHandler { query in
                var page = F.defaultPage(query)
                page.posts = page.posts.map { var item = $0; item.likeCount += 100; return item }
                return page
            }
            await vm.tabReselected()
            #expect(vm.items.count == 40, "\(sort)")
            #expect(vm.items.first?.likeCount == 101, "\(sort)")
            #expect(Array(vm.items.map(\.id).dropFirst(20)) == tail, "\(sort)")
        }
    }

    @Test("TC-DISP-026 다음 페이지 실패 뒤 다시 끝에 닿으면 토스트 후 같은 page를 다시 요청하고 사진은 유지된다")
    func pagingFailureThenRetrySamePage() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let first = vm.items
        let counter = Counter()
        await world.posts.setListHandler { query in
            if await counter.next() == 1 { throw FeedFailure.server(status: 500) }
            return F.defaultPage(query)
        }
        await vm.itemAppeared(first.at(19))
        #expect(vm.toast?.message == FeedCopy.displayError)
        #expect(vm.items == first)
        await vm.itemAppeared(first.at(19))
        let queries = await world.posts.listQueries
        #expect(queries.map(\.page) == [1, 2, 2])
        #expect(vm.items.count == 40)
        #expect(Array(vm.items.prefix(20)) == first)
    }

    @Test("TC-DISP-027 페이지 사이에 오프셋이 밀려도 같은 ID 중복은 한 번만 보여 주고 건너뛴 항목은 허용한다")
    func overlapDedupedWithSkipsAllowed() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let base = F.today.day * 1000
        await world.posts.setListHandler { query in
            // 2페이지: 1페이지의 19·20번째가 다시 나오고 21~22번째는 건너뛴다.
            let numbers = [19, 20] + Array(23...40)
            return F.page(numbers.map { F.listItem(base + $0) }, page: query.page, hasNext: false)
        }
        await vm.itemAppeared(vm.itemID(19))
        let ids = vm.items.map(\.id)
        #expect(Set(ids).count == ids.count)
        #expect(ids.count == 38)
        #expect(!ids.contains(F.postID(base + 21)))
        #expect(ids.suffix(2) == [F.postID(base + 39), F.postID(base + 40)])
    }

    @Test("TC-DISP-020 랜덤 페이지 경계에서 겹치는 게시물 id는 한 번만 보여 준다")
    func randomOverlapDeduped() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        let lastOfFirst = vm.item(19)
        await world.posts.setListHandler { query in
            let base = F.today.day * 1000 + 400
            let fresh = (21...39).map { F.listItem(base + $0) }
            return F.page([lastOfFirst] + fresh, page: query.page, hasNext: false, seed: "seedA")
        }
        await vm.itemAppeared(lastOfFirst.id)
        let ids = vm.items.map(\.id)
        #expect(ids.count == 39)
        #expect(Set(ids).count == 39)
    }

    @Test("TC-DISP-038 이전 버튼을 연타하면 최종 표시는 마지막 이동 날짜이고 중간 날짜의 늦은 응답이 덮지 않는다")
    func rapidPreviousTaps() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let late = Hold(ignoringCancellation: true)
        await world.topics.setHandler { date in
            if date == F.yesterday { try await late.wait() }
            return F.topic(date)
        }
        let first = Task { await vm.goToPreviousDay() }
        await world.topics.signal.wait(atLeast: 2)
        #expect(vm.pendingDate == F.yesterday)
        #expect(vm.canGoPrevious)
        let second = Task { await vm.goToPreviousDay() }
        await world.topics.signal.wait(atLeast: 3)
        #expect(vm.pendingDate == F.date(2026, 10, 25))
        await second.value
        #expect(vm.selectedDate == F.date(2026, 10, 25))
        await late.open()
        await first.value
        #expect(vm.selectedDate == F.date(2026, 10, 25))
        #expect(vm.pendingDate == nil)
        #expect(vm.items.map(\.id) == (1...20).map { F.defaultID(date: F.date(2026, 10, 25), sort: .popular, index: $0) })
        #expect(await world.topics.requestedDates == [F.today, F.yesterday, F.date(2026, 10, 25)])
    }

    @Test("TC-DISP-046 날짜 A에서 B로 옮긴 뒤 A의 느린 응답이 와도 최신 상태를 덮지 않는다")
    func staleDateResponseIgnored() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let slowDate = F.date(2026, 10, 20)
        let fastDate = F.date(2026, 10, 22)
        let late = Hold(ignoringCancellation: true)
        await world.posts.setListHandler { query in
            if query.topicDate == slowDate { try await late.wait() }
            return F.defaultPage(query)
        }
        let slow = Task { await vm.select(date: slowDate) }
        await world.posts.listSignal.wait(atLeast: 2)
        await vm.select(date: fastDate)
        #expect(vm.selectedDate == fastDate)
        await late.open()
        await slow.value
        #expect(vm.selectedDate == fastDate)
        #expect(vm.topic?.topicDate == fastDate)
        #expect(vm.items.map(\.id) == (1...20).map { F.defaultID(date: fastDate, sort: .popular, index: $0) })
    }

    @Test("TC-DISP-047 정렬을 A에서 B로 빠르게 바꾸면 A의 늦은 응답은 B 화면을 덮지 않고 캐시에만 남는다")
    func staleSortResponseOnlyCached() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let lateHold = Hold(ignoringCancellation: true)
        let recheckHold = Hold()
        let popularCalls = Counter()
        await world.posts.setListHandler { query in
            if query.sort == .popular {
                if await popularCalls.next() == 1 { try await lateHold.wait() } else { try await recheckHold.wait() }
            }
            return F.defaultPage(query)
        }
        let popular = Task { await vm.selectSort(.popular) }
        await world.posts.listSignal.wait(atLeast: 2)
        await vm.selectSort(.random)
        let randomIDs = (1...20).map { F.defaultID(date: F.today, sort: .random, index: $0) }
        #expect(vm.items.map(\.id) == randomIDs)
        await lateHold.open()
        await popular.value
        #expect(vm.sort == .random)
        #expect(vm.items.map(\.id) == randomIDs)

        // 늦게 온 인기순 결과는 캐시에 남아 있어, 다시 고르면 재검증 응답 전에도 보인다.
        let again = Task { await vm.selectSort(.popular) }
        await world.posts.listSignal.wait(atLeast: 4)
        #expect(vm.items.map(\.id) == (1...20).map { F.defaultID(date: F.today, sort: .popular, index: $0) })
        await recheckHold.open()
        await again.value
    }
}
