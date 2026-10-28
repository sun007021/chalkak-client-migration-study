import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias R = RecordFixtures

@MainActor
@Suite("REC 날짜 선택·사진 동작·이미지 저장", .timeLimit(.minutes(1)))
struct RecordActionTests {
    // MARK: 날짜 선택

    @Test("REQ-REC-030 날짜는 사진이 있는 칸만 선택할 수 있고, 사진이 없는 칸이나 다른 달 날짜를 누르면 아무 일도 없다")
    func onlyPhotoDaysAreSelectable() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        #expect(vm.selectedDate == kst(2026, 10, 31))

        vm.dayTapped(kst(2026, 10, 21))
        #expect(vm.selectedDate == kst(2026, 10, 31))
        vm.dayTapped(kst(2026, 9, 17))
        #expect(vm.selectedDate == kst(2026, 10, 31))
        vm.dayTapped(kst(2026, 10, 20))
        #expect(vm.selectedDate == kst(2026, 10, 20))
        #expect(vm.selectedPost?.postId == R.post1020)
    }

    // MARK: PENDING

    @Test("TC-REC-035 PENDING 날짜를 선택하면 \"사진 반영 중\" 배지가 보이고 동작 버튼은 숨겨지며 안내 풍선을 열고 닫을 수 있다")
    func pendingSelection() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        let requestsBefore = await w.repo.requestedMonths.count

        vm.dayTapped(kst(2026, 10, 27))

        #expect(vm.selectedPost?.status == .pending)
        #expect(vm.showsPendingBadge)
        #expect(!vm.showsPostActions)
        #expect(!vm.isPendingTooltipOpen)
        #expect(vm.pendingBadgeAccessibilityLabel == "자세한 안내 보기")

        vm.pendingBadgeTapped()
        #expect(vm.isPendingTooltipOpen)
        #expect(vm.pendingBadgeAccessibilityLabel == "자세한 안내 닫기")
        vm.pendingBadgeTapped()
        #expect(!vm.isPendingTooltipOpen)
        #expect(vm.pendingBadgeAccessibilityLabel == "자세한 안내 보기")
        #expect(await w.repo.requestedMonths.count == requestsBefore, "날짜를 고르는 것만으로 API를 호출하지 않는다")
    }

    @Test("TC-REC-035 APPROVED 사진에는 배지가 없고 동작 버튼이 보이며, 배지를 눌러도 풍선이 열리지 않는다")
    func approvedSelection() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()

        vm.dayTapped(kst(2026, 10, 20))

        #expect(!vm.showsPendingBadge)
        #expect(vm.showsPostActions)
        vm.pendingBadgeTapped()
        #expect(!vm.isPendingTooltipOpen)
    }

    // MARK: 피드·전시 이동 (REQ-REC-033~035)

    @Test("REQ-REC-034 REQ-REC-035 APPROVED 사진의 \"피드에서 보기\"는 내 게시물 상세(썸네일 전달)로, \"전시 보러가기\"는 그 주제 날짜의 전시로 이동한다")
    func approvedActionsNavigate() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 20))

        vm.viewFeedTapped()
        vm.viewDisplayTapped()

        #expect(w.navigator.calls == [
            .feed(.mine(postId: R.post1020, thumbnailURL: R.thumbnail(R.post1020))),
            .display(kst(2026, 10, 20), .recent),
        ])
    }

    @Test("REQ-REC-033 PENDING 사진이나 선택된 사진이 없을 때는 두 동작이 아무 일도 하지 않는다")
    func actionsAreIgnoredWithoutApprovedPhoto() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        vm.dayTapped(kst(2026, 10, 27))
        vm.viewFeedTapped()
        vm.viewDisplayTapped()

        let emptyWorld = RecordWorld()
        let empty = await emptyWorld.makeRecord()
        await emptyWorld.repo.setCalendar { R.empty($0) }
        await empty.recordAppeared()
        empty.viewFeedTapped()
        empty.viewDisplayTapped()

        #expect(w.navigator.calls.isEmpty)
        #expect(emptyWorld.navigator.calls.isEmpty)

        vm.dayTapped(kst(2026, 10, 20))
        vm.viewFeedTapped()
        #expect(w.navigator.calls.count == 1, "APPROVED 사진에서는 동작한다(위 무시가 단순히 아무것도 안 해서 통과한 것이 아님을 보인다)")
    }

    // MARK: 달력 이미지 저장 (REQ-REC-037~039)

    @Test("TC-REC-038 \"이미지로 저장\"은 현재 달 달력을 PNG로 그려 chalkak-calendar-2026-10.png 이름으로 저장하고 성공 토스트를 한 번 띄운다")
    func saveSucceeds() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()

        await vm.saveImageTapped()

        let snapshots = await w.renderer.snapshots
        #expect(snapshots == [RecordCalendarSnapshot(month: R.oct, posts: R.octCalendar.posts)])
        #expect(await w.saver.saved == [FakeCalendarSaver.Saved(data: FakeCalendarRenderer.pngSignature, fileName: "chalkak-calendar-2026-10.png")])
        #expect(w.toast.messages == ["달력을 이미지로 저장했어요"])
        #expect(!vm.isSaving)
    }

    @Test("TC-REC-038 삭제한 게시물은 저장하는 달력 이미지에서도 빠진다")
    func saveExcludesDeletedPosts() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        w.ledger.record(.deleted(postId: R.post1027Pending))

        await vm.saveImageTapped()

        #expect(await w.renderer.snapshots.first?.posts.map(\.postId) == [R.post1020, R.post1031])
    }

    @Test("TC-REC-039 저장 권한이 거부되면 \"이미지 저장 권한이 필요해요\" 토스트이고 앱은 멈추지 않는다")
    func savePermissionDenied() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        await w.saver.setError(CalendarImageSaveError.permissionDenied)

        await vm.saveImageTapped()

        #expect(w.toast.messages == ["이미지 저장 권한이 필요해요"])
        #expect(!vm.isSaving)
        await w.saver.setError(nil)
        await vm.saveImageTapped()
        #expect(w.toast.messages.last == "달력을 이미지로 저장했어요", "실패 뒤에도 다시 저장할 수 있다")
    }

    @Test("TC-REC-039 쓰기 실패나 렌더링 실패는 \"이미지 저장에 실패했어요\" 토스트다", arguments: [true, false])
    func saveFailure(renderFails: Bool) async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        if renderFails {
            await w.renderer.setResult(.failure(CalendarImageSaveError.failed))
        } else {
            await w.saver.setError(CalendarImageSaveError.failed)
        }

        await vm.saveImageTapped()

        #expect(w.toast.messages == ["이미지 저장에 실패했어요"])
        #expect(!vm.isSaving)
        if renderFails { #expect(await w.saver.saved.isEmpty, "그리지 못했으면 저장을 시도하지 않는다") }
    }

    @Test("TC-REC-040 저장이 진행되는 동안 저장 버튼을 연타해도 저장은 1회만 실행된다")
    func duplicateTapsWhileSavingAreIgnored() async {
        let w = RecordWorld()
        let vm = await w.loadedRecord()
        let hold = Hold()
        await w.saver.setHold(hold)

        let first = Task { await vm.saveImageTapped() }
        guard await EventWait.signal(w.saver.signal, before: first) else {
            Issue.record("저장이 시작되어야 한다")
            return
        }
        #expect(vm.isSaving)
        await vm.saveImageTapped()
        await vm.saveImageTapped()

        await hold.open()
        await first.value

        #expect(await w.saver.saved.count == 1)
        #expect(await w.renderer.snapshots.count == 1)
        #expect(w.toast.messages == ["달력을 이미지로 저장했어요"])
        #expect(!vm.isSaving)
    }
}
