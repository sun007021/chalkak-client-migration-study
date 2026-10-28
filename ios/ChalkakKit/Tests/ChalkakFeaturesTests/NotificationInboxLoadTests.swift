import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures

@MainActor
@Suite("NOTI 알림함 목록 로드·페이징·새로고침", .timeLimit(.minutes(1)))
struct NotificationInboxLoadTests {
    // MARK: 첫 로드

    @Test("TC-NOTI-002 첫 진입은 1페이지(pageSize 20)를 불러와 응답 순서대로 보여 주고 로딩에서 콘텐츠로 바뀐다")
    func firstLoad() async {
        let w = NotiWorld()
        let vm = w.makeInbox()
        #expect(vm.phase == .loading)

        await vm.appeared()

        #expect(await w.repo.pageRequests == [1])
        #expect(vm.phase == .content)
        #expect(vm.rowIDs == (1...20).map(N.id))
        #expect(vm.hasNext)
        #expect(vm.nextPage == 2)
    }

    @Test("TC-NOTI-003 행은 제목·본문·썸네일 URL·시각·미읽음(readAt == nil)을 보인다")
    func rowFields() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in
            NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: [
                N.item(1), N.item(2, read: true),
            ])
        }
        let vm = await w.loadedInbox()
        #expect(vm.row(1)?.title == "제목 1")
        #expect(vm.row(1)?.body == "본문 1")
        #expect(vm.row(1)?.isUnread == true)
        #expect(vm.row(2)?.isUnread == false)
    }

    @Test("TC-NOTI-005 빈 응답이면 빈 상태다")
    func emptyState() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: []) }
        let vm = await w.loadedInbox()
        #expect(vm.phase == .empty)
        #expect(vm.rows.isEmpty)
    }

    @Test("TC-NOTI-006 콘텐츠 없이 실패하면 오류 화면 \"알림을 불러오지 못했어요\"이고 다시 시도가 재요청한다")
    func errorThenRetry() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { page, call in
            if call == 0 { throw FeedFailure.server(status: 500) }
            return N.defaultPage(page)
        }
        let vm = await w.loadedInbox()
        #expect(vm.phase == .error("알림을 불러오지 못했어요"))
        #expect(w.toast.messages.isEmpty)

        await vm.retry()
        #expect(await w.repo.pageRequests == [1, 1])
        #expect(vm.phase == .content)
    }

    @Test("TC-NOTI-007 연결 실패(콘텐츠 없음)는 \"네트워크 연결을 확인해 주세요.\"를 보인다")
    func networkError() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in throw FeedFailure.network }
        let vm = await w.loadedInbox()
        #expect(vm.phase == .error("네트워크 연결을 확인해 주세요."))
    }

    @Test("TC-NOTI-008 계약 위반(invalidResponse)은 일반 오류 문구를 보이고 크래시하지 않는다")
    func contractViolation() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in throw FeedFailure.invalidResponse }
        let vm = await w.loadedInbox()
        #expect(vm.phase == .error("알림을 불러오지 못했어요"))
    }

    @Test("TC-NOTI-009 목록 401(갱신 후에도)은 오류 문구 없이 로그인 화면으로(needsLogin)")
    func unauthorized() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in throw FeedFailure.unauthorized }
        let vm = await w.loadedInbox()
        #expect(vm.needsLogin)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-012 행 시각은 KST \"M월 d일 HH:mm\"이다 (15:00:00Z → 10월 27일 00:00, 14:59:59Z → 10월 26일 23:59)")
    func rowTimestampsAreKST() async {
        let w = NotiWorld()
        let boundary = Instant.parse("2026-10-26T15:00:00Z")!
        await w.repo.setPageHandler { _, _ in
            NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: [
                NotificationItem(id: N.id(1), type: .notice, title: "a", body: "b", createdAt: boundary),
                NotificationItem(id: N.id(2), type: .notice, title: "a", body: "b", createdAt: boundary.addingTimeInterval(-1)),
            ])
        }
        let vm = await w.loadedInbox()
        #expect(vm.row(1)?.timeText == "10월 27일 00:00")
        #expect(vm.row(2)?.timeText == "10월 26일 23:59")
    }

    @Test("REQ-NOTI-014 알림함이 보일 때 screen_view notifications를 1회 보낸다")
    func screenView() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        await vm.appeared()
        #expect(w.analytics.events == [.screenView(.notifications, screenClass: nil)])
    }

    // MARK: 페이징

    @Test("TC-NOTI-015 끝에서 4번째 근처까지 스크롤하면 page=2가 1회만 나가고 같은 위치에서 계속 스크롤해도 중복 요청이 없다")
    func pagingNearEnd() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        let hold = Hold()
        await w.repo.setPageHandler { page, _ in
            try await hold.wait()
            return N.defaultPage(page)
        }

        await vm.rowAppeared(index: 10) // 끝에서 멀다
        #expect(await w.repo.pageRequests == [1])

        let task = Task { await vm.rowAppeared(index: 16) }
        guard await EventWait.signal(w.repo.pageSignal, atLeast: 2, before: task) else {
            Issue.record("끝 근처에서 2페이지를 요청해야 한다")
            return
        }
        #expect(vm.isLoadingMore)
        await vm.rowAppeared(index: 16)
        await vm.rowAppeared(index: 17)
        #expect(await w.repo.pageRequests == [1, 2])

        await hold.open()
        await task.value
        #expect(!vm.isLoadingMore)
        #expect(vm.rows.count == 25)
        #expect(!vm.hasNext)
    }

    @Test("TC-NOTI-016 hasNext가 false면 끝까지 스크롤해도 추가 요청이 0건이다")
    func noRequestWhenNoNext() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in N.page(1, 1...5, hasNext: false) }
        let vm = await w.loadedInbox()
        await vm.rowAppeared(index: 4)
        await vm.rowAppeared(index: 3)
        #expect(await w.repo.pageRequests == [1])
    }

    @Test("TC-NOTI-017 2페이지에 1페이지와 같은 id가 있으면 중복을 제거하고 순서를 유지한다")
    func overlapIsDeduplicated() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { page, _ in
            page == 1 ? N.page(1, 1...20, hasNext: true)
                : NotificationPage(currentPage: 2, pageSize: 20, hasNext: false, items: [N.item(19), N.item(20), N.item(26), N.item(27)])
        }
        let vm = await w.loadedInbox()
        await vm.rowAppeared(index: 19)
        #expect(vm.rowIDs == ((1...20).map(N.id) + [N.id(26), N.id(27)]))
    }

    @Test("TC-NOTI-018 다음 페이지가 실패하면 목록·페이지 번호를 유지하고 토스트를 띄우며 같은 페이지를 다시 요청할 수 있다")
    func moreFailureKeepsListAndRetries() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        await w.repo.setPageHandler { _, _ in throw FeedFailure.network }

        await vm.rowAppeared(index: 19)

        #expect(w.toast.messages == ["다음 알림을 불러오지 못했어요. 다시 시도해 주세요."])
        #expect(vm.rows.count == 20)
        #expect(vm.nextPage == 2)
        #expect(vm.hasNext)
        #expect(!vm.isLoadingMore)

        await w.repo.setPageHandler { page, _ in N.defaultPage(page) }
        await vm.rowAppeared(index: 19)
        #expect(await w.repo.pageRequests == [1, 2, 2])
        #expect(vm.rows.count == 25)
    }

    // MARK: 새로고침

    @Test("TC-NOTI-019 당겨서 새로고침이 성공하면 목록이 교체되고 다음 페이지가 2로 돌아간다")
    func refreshReplaces() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        await vm.rowAppeared(index: 19)
        #expect(vm.rows.count == 25)

        await w.repo.setPageHandler { _, _ in N.page(1, 30...32, hasNext: true) }
        await vm.refresh()

        #expect(vm.rowIDs == [30, 31, 32].map(N.id))
        #expect(vm.nextPage == 2)
        #expect(!vm.isRefreshing)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-020 새로고침이 실패하면 기존 목록을 유지하고 \"알림을 새로고침하지 못했어요. 다시 시도해 주세요.\" 토스트만 띄운다")
    func refreshFailureKeepsList() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        let before = vm.rowIDs
        await w.repo.setPageHandler { _, _ in throw FeedFailure.network }

        await vm.refresh()

        #expect(vm.rowIDs == before)
        #expect(vm.phase == .content)
        #expect(w.toast.messages == ["알림을 새로고침하지 못했어요. 다시 시도해 주세요."])
    }

    @Test("TC-NOTI-021 새로고침 두 개가 겹치면 늦게 끝난 이전 응답은 버려지고 다음 페이지 기준은 최신 응답이다")
    func overlappingRefreshDropsStale() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        let staleHold = Hold(ignoringCancellation: true)
        await w.repo.setPageHandler { _, call in
            if call == 1 {
                try await staleHold.wait()
                return N.page(1, 40...42, hasNext: true) // 오래된 응답
            }
            return N.page(1, 50...52, hasNext: false) // 최신 응답
        }

        let first = Task { await vm.refresh() }
        guard await EventWait.signal(w.repo.pageSignal, atLeast: 2, before: first) else {
            Issue.record("첫 새로고침이 시작되어야 한다")
            return
        }
        await vm.refresh() // 두 번째는 새 세대로 시작해 먼저 끝난다
        await staleHold.open()
        await first.value

        #expect(vm.rowIDs == [50, 51, 52].map(N.id))
        #expect(!vm.hasNext, "다음 페이지 기준은 최신 응답")
        #expect(!vm.isRefreshing)
    }

    @Test("TC-NOTI-022 로드 중 화면을 떠나면 늦은 응답은 반영되지 않고 오류 토스트도 없다")
    func leavingCancelsLoad() async {
        let w = NotiWorld()
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setPageHandler { page, _ in
            try await hold.wait()
            return N.defaultPage(page)
        }
        let vm = w.makeInbox()
        let task = Task { await vm.appeared() }
        guard await EventWait.signal(w.repo.pageSignal, before: task) else {
            Issue.record("첫 요청이 나가야 한다")
            return
        }

        vm.disappeared()
        await hold.open()
        await task.value

        #expect(vm.rows.isEmpty)
        #expect(w.toast.messages.isEmpty)
        if case .error = vm.phase { Issue.record("취소가 오류 상태가 되면 안 된다") }
    }

    @Test("TC-NOTI-022 취소(CancellationError)는 오류 화면도 토스트도 만들지 않는다")
    func cancellationIsNotAnError() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in throw CancellationError() }
        let vm = await w.loadedInbox()
        #expect(w.toast.messages.isEmpty)
        if case .error = vm.phase { Issue.record("취소가 오류 상태가 되면 안 된다") }
        await w.repo.setPageHandler { page, _ in N.defaultPage(page) }
        await vm.appeared()
        #expect(vm.phase == .content, "취소 뒤에도 다시 불러올 수 있다")
    }

    // MARK: 다시 보일 때 / 읽기 전용

    @Test("REQ-NOTI-012 알림함이 다시 보이면 조용히 1페이지를 다시 불러와 교체하고, 실패해도 목록을 유지하며 토스트가 없다")
    func reappearReloadsQuietly() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        await w.repo.setPageHandler { _, _ in N.page(1, 1...3, hasNext: false) }
        await vm.appeared()
        #expect(vm.rows.count == 3)

        await w.repo.setPageHandler { _, _ in throw FeedFailure.network }
        await vm.appeared()
        #expect(vm.rows.count == 3)
        #expect(vm.phase == .content)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-041 목록 조회만으로는 PATCH read가 0건이다")
    func loadingDoesNotMarkRead() async {
        let w = NotiWorld()
        let vm = await w.loadedInbox()
        await vm.refresh()
        await vm.rowAppeared(index: 19)
        #expect(await w.repo.pageRequests == [1, 1, 2], "조회는 실제로 일어났다")
        #expect(await w.repo.readRequests.isEmpty)
    }

    @Test("REQ-NOTI-032 계정 전환(reset) 뒤에는 목록이 비고 이전 계정의 늦은 응답은 반영되지 않는다")
    func resetDropsLateResponse() async {
        let w = NotiWorld()
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setPageHandler { page, _ in
            try await hold.wait()
            return N.defaultPage(page)
        }
        let vm = w.makeInbox()
        let task = Task { await vm.appeared() }
        guard await EventWait.signal(w.repo.pageSignal, before: task) else {
            Issue.record("첫 요청이 나가야 한다")
            return
        }
        vm.reset()
        await hold.open()
        await task.value
        #expect(vm.rows.isEmpty)
        #expect(vm.phase == .loading)
    }
}
