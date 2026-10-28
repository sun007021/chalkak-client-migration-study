import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
@Suite("HOME 미읽음 재조회(알림 처리 연결)", .timeLimit(.minutes(1)))
struct HomeUnreadRefreshingTests {
    @Test("REQ-NOTI-029 UnreadRefreshing으로 부르면 미읽음만 다시 조회해 점을 갱신한다")
    func refreshesOnlyUnread() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        let todayCalls = await w.todayRepo.count
        #expect(await w.unreadRepo.count == 1)
        #expect(!vm.hasUnread)

        await w.unreadRepo.setHandler { UnreadStatus(hasUnread: true) }
        let refresher: any UnreadRefreshing = vm
        await refresher.refreshUnread()

        #expect(await w.unreadRepo.count == 2)
        #expect(vm.hasUnread)
        #expect(await w.todayRepo.count == todayCalls)
    }

    @Test("REQ-NOTI-030 게스트는 UnreadRefreshing으로 불러도 미읽음을 조회하지 않는다")
    func guestSkips() async {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()
        await vm.refreshUnread()
        #expect(await w.unreadRepo.count == 0)
        #expect(!vm.hasUnread)
    }
}
