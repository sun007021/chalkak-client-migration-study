import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

private let otherPost = 77_001
private let minePost = 77_002

@MainActor
private func mineItem(title: String? = "원래 제목") -> PostListItem {
    F.listItem(minePost, title: title, likeCount: 5, isLiked: false, isMine: true)
}

@MainActor
@Suite("FEED 게시물 상세", .timeLimit(.minutes(1)))
struct PostDetailViewModelTests {
    // MARK: 진입, 시드, 확정

    @Test("TC-FEED-001 전시 시드는 즉시 보이고 좋아요는 상세 확정 후에만 활성화된다")
    func seededEntryDisablesLikeUntilConfirmed() async {
        let world = FeedWorld()
        let item = F.listItem(otherPost, title: "시드 제목", likeCount: 7, isLiked: true)
        let vm = world.makeDetail(.listItem(item))
        #expect(vm.state == .content)
        #expect(vm.title == "시드 제목")
        #expect(vm.like == item.like)
        #expect(vm.imageURL == item.originalImageURL)
        #expect(vm.dateLabel == nil)
        #expect(!vm.isLikeEnabled)

        let hold = Hold()
        await world.posts.setDetailHandler { _ in
            try await hold.wait()
            return F.detail(otherPost, title: "응답 제목", likeCount: 8, isLiked: true)
        }
        let task = Task { await vm.onAppear() }
        await world.posts.detailSignal.wait()
        #expect(!vm.isConfirmed)
        #expect(!vm.isLikeEnabled)
        vm.likeTapped()
        #expect(await world.likeRepo.calls.isEmpty)
        #expect(vm.like == item.like)
        await hold.open()
        await task.value
        #expect(vm.isConfirmed)
        #expect(vm.isLikeEnabled)
        #expect(vm.title == "응답 제목")
        #expect(vm.dateLabel == "10월 27일의 주제")
        #expect(world.analytics.events == [.screenView(.feed, screenClass: nil)])
    }

    @Test("TC-FEED-001 기록·푸시 진입은 상세 응답 전 로딩이고 전달받은 썸네일을 먼저 보인다")
    func mineEntryShowsLoadingThenContent() async {
        let world = FeedWorld()
        let thumbnail = URL(string: "https://img.test/t/mine.webp")!
        let vm = world.makeDetail(.mine(postId: F.postID(minePost), thumbnailURL: thumbnail))
        #expect(vm.state == .loading)
        #expect(vm.imageURL == thumbnail)
        #expect(vm.like == nil)
        #expect(!vm.isLikeEnabled)
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        await vm.onAppear()
        #expect(vm.state == .content)
        #expect(vm.isConfirmed)
        #expect(vm.isMine)
        #expect(vm.like == LikeState(isLiked: false, likeCount: 5))
    }

    @Test("TC-FEED-004 상세 응답 뒤 내 게시물 판정은 authorId와 로그인 userId 비교다(진입 값과 다르면 응답 기준)")
    func isMineFollowsAuthorIdAfterConfirmation() async {
        let world = FeedWorld()
        // 목록은 남의 게시물(isMine=false)이라 했지만 응답의 authorId가 나다.
        let listed = F.listItem(otherPost, isMine: false)
        let vm = world.makeDetail(.listItem(listed))
        #expect(!vm.isMine)
        await world.setDetail(F.detail(otherPost, authorId: F.userAID))
        await vm.onAppear()
        #expect(vm.isMine)
        #expect(vm.canDelete)

        // 기록 진입(내 게시물로 가정)이라도 응답의 authorId가 남이면 응답 기준이다.
        let recordVM = world.makeDetail(.mine(postId: F.postID(minePost), thumbnailURL: nil))
        await world.setDetail(F.detail(minePost, authorId: F.userBID))
        await recordVM.onAppear()
        #expect(!recordVM.isMine)
        #expect(!recordVM.canDelete)
    }

    @Test("TC-FEED-007 상세가 404이면 찾을 수 없음 화면이고 시드 게시물은 목록·캐시에서 뺀다")
    func detailNotFound() async {
        let world = FeedWorld()
        let recorder = PostChangeRecorder()
        world.ledger.addObserver(recorder)
        let vm = world.makeDetail(.listItem(F.listItem(otherPost)))
        await world.posts.setDetailHandler { _ in throw FeedFailure.notFound }
        await vm.onAppear()
        guard case let .notFound(notice) = vm.state else {
            Issue.record("찾을 수 없음 상태여야 한다: \(vm.state)")
            return
        }
        #expect(notice.message == FeedCopy.postNotFound)
        #expect(recorder.changes == [.unavailable(postId: F.postID(otherPost))])
    }

    @Test("TC-FEED-010 이미 내용이 보이는 상태에서 재검증이 실패하면 내용을 유지하고 토스트만 띄운다")
    func revalidationFailureKeepsContent() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(otherPost, title: "확정 제목"))
        let vm = world.makeDetail(.listItem(F.listItem(otherPost, title: "시드 제목")))
        await vm.onAppear()
        #expect(vm.title == "확정 제목")
        await world.posts.setDetailHandler { _ in throw FeedFailure.server(status: 500) }
        await vm.onAppear()
        #expect(vm.state == .content)
        #expect(vm.title == "확정 제목")
        #expect(vm.isConfirmed)
        #expect(vm.toast?.message == FeedCopy.postLoadError)
    }

    @Test("TC-FEED-012 오프라인에서 시드로 열면 시드를 보이고 네트워크 토스트를 띄우며 좋아요·수정·삭제는 막힌다")
    func offlineSeedBlocksActions() async {
        let world = FeedWorld()
        await world.posts.setDetailHandler { _ in throw FeedFailure.network }
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        #expect(vm.state == .content)
        #expect(vm.title == "원래 제목")
        #expect(vm.toast?.message == FeedCopy.networkError)
        #expect(!vm.isConfirmed)
        #expect(!vm.isLikeEnabled)
        vm.likeTapped()
        vm.editTapped()
        vm.deleteTapped()
        await vm.confirmDelete()
        #expect(await world.likeRepo.calls.isEmpty)
        #expect(vm.edit == nil)
        #expect(vm.deletePrompt == nil)
        #expect(await world.posts.deletedIDs.isEmpty)
    }

    @Test("TC-FEED-011 화면을 벗어나 조회가 취소돼도 오류로 보이지 않는다")
    func cancelledLoadIsSilent() async {
        let world = FeedWorld()
        let hold = Hold()
        await world.posts.setDetailHandler { _ in
            try await hold.wait()
            return F.detail(otherPost)
        }
        let vm = world.makeDetail(.mine(postId: F.postID(otherPost), thumbnailURL: nil))
        let task = Task { await vm.onAppear() }
        await world.posts.detailSignal.wait()
        vm.onDisappear()
        await task.value
        if case .failed = vm.state { Issue.record("취소가 오류가 되면 안 된다") }
        if case .notFound = vm.state { Issue.record("취소가 404가 되면 안 된다") }
        #expect(vm.toast == nil)
    }

    // MARK: 좋아요

    @Test("TC-LIKE-024 상세 확정 전 시드에서는 좋아요가 막히고 확정 후에만 허용된다")
    func likeBlockedUntilConfirmed() async {
        let world = FeedWorld()
        let item = F.listItem(otherPost, likeCount: 10)
        let hold = Hold()
        await world.posts.setDetailHandler { _ in
            try await hold.wait()
            return F.detail(otherPost, likeCount: 10)
        }
        let vm = world.makeDetail(.listItem(item))
        let task = Task { await vm.onAppear() }
        await world.posts.detailSignal.wait()
        vm.likeTapped()
        #expect(await world.likeRepo.calls.isEmpty)
        #expect(vm.like == LikeState(isLiked: false, likeCount: 10))
        await hold.open()
        await task.value
        vm.likeTapped()
        #expect(vm.like == LikeState(isLiked: true, likeCount: 11))
        await world.likeRepo.waitForCallCount(1)
        #expect(await world.likeRepo.calls == [.init(postId: F.postID(otherPost), liked: true)])
        await world.likeRepo.resolveNext()
        await world.coordinator.settledAll()
    }

    @Test("TC-LIKE-029 상세에서 요청 진행 중 화면을 벗어나면 상태는 반영되고 토스트는 뜨지 않는다")
    func likeFailureWhileHiddenHasNoToast() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(otherPost, likeCount: 10))
        let vm = world.makeDetail(.listItem(F.listItem(otherPost, likeCount: 10)))
        await vm.onAppear()
        vm.likeTapped()
        await world.likeRepo.waitForCallCount(1)
        vm.onDisappear()
        await world.likeRepo.failNext(FeedFailure.server(status: 500))
        await world.coordinator.settledAll()
        #expect(vm.like == LikeState(isLiked: false, likeCount: 10))
        #expect(vm.toast == nil)
    }

    @Test("TC-LIKE-029 상세가 보이는 동안의 실패는 롤백과 토스트를 함께 보인다")
    func likeFailureWhileVisibleShowsToast() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(otherPost, likeCount: 10))
        let vm = world.makeDetail(.listItem(F.listItem(otherPost, likeCount: 10)))
        await vm.onAppear()
        vm.likeTapped()
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.server(status: 500))
        await world.coordinator.settledAll()
        #expect(vm.like == LikeState(isLiked: false, likeCount: 10))
        #expect(vm.toast?.message == FeedCopy.likeGeneric)
    }

    @Test("TC-LIKE-010 상세에서 좋아요가 404이면 롤백 후 화면을 닫도록 알린다")
    func likeNotFoundDismisses() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(otherPost, likeCount: 10))
        let vm = world.makeDetail(.listItem(F.listItem(otherPost, likeCount: 10)))
        await vm.onAppear()
        vm.likeTapped()
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.notFound)
        await world.coordinator.settledAll()
        #expect(vm.like == LikeState(isLiked: false, likeCount: 10))
        #expect(vm.dismissal == .unavailable)
    }

    // MARK: 제목 수정

    @Test("TC-FEED-018 수정 다이얼로그는 현재 제목이 채워져 열리고 취소는 요청을 보내지 않는다")
    func editDialogPrefilledAndCancel() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID, title: "원래 제목"))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        #expect(vm.canEditTitle)
        vm.editTapped()
        #expect(vm.edit?.text == "원래 제목")
        #expect(vm.edit?.saveButtonTitle == "저장")
        vm.cancelEdit()
        #expect(vm.edit == nil)
        #expect(await world.posts.titleUpdates.isEmpty)
    }

    @Test("TC-FEED-018 입력은 앞뒤 공백 제거 후 10 code point까지만 받는다")
    func editInputClamped() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        vm.editTapped()
        vm.editTextChanged(String(repeating: "😀", count: 11))
        #expect(vm.edit?.text == String(repeating: "😀", count: 10))
    }

    @Test("TC-FEED-024 저장에 성공하면 다이얼로그를 닫고 토스트를 띄우며 상세와 목록·기록에 새 제목을 알린다")
    func saveSuccess() async {
        let world = FeedWorld()
        let recorder = PostChangeRecorder()
        world.ledger.addObserver(recorder)
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        vm.editTapped()
        vm.editTextChanged(" 새 제목 ")
        await vm.saveEdit()
        let updates = await world.posts.titleUpdates
        #expect(updates.count == 1)
        #expect(updates.first?.id == F.postID(minePost))
        #expect(vm.edit == nil)
        #expect(vm.title == "새 제목")
        #expect(vm.toast?.message == FeedCopy.editSuccess)
        #expect(recorder.changes == [.titleChanged(postId: F.postID(minePost), title: "새 제목")])
    }

    @Test("TC-FEED-024 전시에서 연 상세의 제목 수정은 전시 목록에도 반영된다")
    func saveSuccessReflectsInDisplayList() async {
        let world = FeedWorld()
        let display = world.makeDisplay()
        await display.onAppear()
        let target = display.item(3)
        await world.setDetail(F.detail(id: target.id, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(target))
        await vm.onAppear()
        vm.editTapped()
        vm.editTextChanged("새 제목")
        await vm.saveEdit()
        #expect(display.items.first { $0.id == target.id }?.title == "새 제목")
    }

    @Test("TC-FEED-025 저장 중에는 버튼이 저장 중으로 바뀌고 연타해도 PUT은 1회만 나간다")
    func saveIsSerialized() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let hold = Hold()
        await world.posts.setUpdateHandler { id, raw in
            try await hold.wait()
            return TitleUpdateResult(postId: id, title: PostTitle.normalized(raw))
        }
        vm.editTapped()
        vm.editTextChanged("새 제목")
        let first = Task { await vm.saveEdit() }
        await world.posts.updateSignal.wait()
        #expect(vm.edit?.isSaving == true)
        #expect(vm.edit?.saveButtonTitle == "저장 중...")
        await vm.saveEdit()
        await vm.saveEdit()
        await hold.open()
        await first.value
        #expect(await world.posts.titleUpdates.count == 1)
        #expect(vm.edit == nil)
    }

    @Test("TC-FEED-026 상세 재조회가 진행되는 동안 제목 수정이 성공하면 늦게 온 이전 응답이 새 제목을 덮지 않는다")
    func lateDetailDoesNotOverwriteEditedTitle() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID, title: "원래 제목"))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let late = Hold(ignoringCancellation: true)
        await world.posts.setDetailHandler { _ in
            try await late.wait()
            return F.detail(minePost, authorId: F.userAID, title: "원래 제목")
        }
        let revalidation = Task { await vm.onAppear() }
        await world.posts.detailSignal.wait(atLeast: 2)
        vm.editTapped()
        vm.editTextChanged("새 제목")
        await vm.saveEdit()
        #expect(vm.title == "새 제목")
        await late.open()
        await revalidation.value
        #expect(vm.title == "새 제목")
    }

    @Test("TC-FEED-017 화면이 열린 채 자정을 넘기면 저장 요청을 보내지 않는다")
    func saveBlockedAfterMidnight() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        vm.editTapped()
        vm.editTextChanged("새 제목")
        world.clock.setNow(Instant.parse("2026-10-27T15:00:00Z")!)
        #expect(!vm.canEditTitle)
        await vm.saveEdit()
        #expect(await world.posts.titleUpdates.isEmpty)
    }

    @Test("TC-FEED-027 TC-FEED-029 수정이 400·403이면 다이얼로그와 입력을 유지하고 사유를 알리며 다시 저장할 수 있다")
    func saveFailureKeepsDialog() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let counter = Counter()
        await world.posts.setUpdateHandler { id, raw in
            switch await counter.next() {
            case 1: throw FeedFailure.badRequest(message: "서버 문구")
            case 2: throw FeedFailure.banned
            default: return TitleUpdateResult(postId: id, title: PostTitle.normalized(raw))
            }
        }
        vm.editTapped()
        vm.editTextChanged("새 제목")
        await vm.saveEdit()
        #expect(vm.edit?.text == "새 제목")
        #expect(vm.edit?.isSaving == false)
        #expect(vm.edit?.error?.message == FeedCopy.editStateError)
        #expect(vm.title == "원래 제목")
        await vm.saveEdit()
        #expect(vm.edit?.error?.message == FeedCopy.editBanned)
        await vm.saveEdit()
        #expect(vm.edit == nil)
        #expect(vm.title == "새 제목")
    }

    @Test("TC-FEED-030 수정이 404이면 다이얼로그를 닫고 찾을 수 없음으로 화면을 닫도록 알린다")
    func saveNotFound() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        await world.posts.setUpdateHandler { _, _ in throw FeedFailure.notFound }
        vm.editTapped()
        vm.editTextChanged("새 제목")
        await vm.saveEdit()
        #expect(vm.edit == nil)
        #expect(vm.dismissal == .unavailable)
    }

    // MARK: 삭제

    @Test("TC-FEED-034 삭제 버튼은 내 게시물에만 보이고 남의 게시물에서는 삭제 요청을 보내지 않는다")
    func deleteOnlyForMine() async {
        let other = FeedWorld()
        await other.setDetail(F.detail(otherPost, authorId: F.userBID))
        let otherVM = other.makeDetail(.listItem(F.listItem(otherPost)))
        await otherVM.onAppear()
        #expect(!otherVM.canDelete)
        otherVM.deleteTapped()
        await otherVM.confirmDelete()
        #expect(otherVM.deletePrompt == nil)
        #expect(await other.posts.deletedIDs.isEmpty)

        let mine = FeedWorld()
        await mine.setDetail(F.detail(minePost, authorId: F.userAID))
        let mineVM = mine.makeDetail(.listItem(mineItem()))
        await mineVM.onAppear()
        #expect(mineVM.canDelete)
    }

    @Test("TC-FEED-035 삭제 버튼은 확인창을 먼저 띄우고 취소하면 요청이 없다")
    func deleteConfirmationPrompt() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        vm.deleteTapped()
        #expect(vm.deletePrompt == ConfirmationPrompt(message: "게시물을 삭제하시겠어요?", confirmTitle: "삭제", cancelTitle: "취소"))
        #expect(await world.posts.deletedIDs.isEmpty)
        vm.cancelDelete()
        #expect(vm.deletePrompt == nil)
        await vm.confirmDelete()   // 확인창이 없으면 무시
        #expect(await world.posts.deletedIDs.isEmpty)
    }

    @Test("TC-FEED-036 삭제가 성공하면 화면을 닫도록 알리고 삭제 토스트를 한 번 담는다")
    func deleteSuccessDismissesWithToast() async {
        let world = FeedWorld()
        let recorder = PostChangeRecorder()
        world.ledger.addObserver(recorder)
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        vm.deleteTapped()
        await vm.confirmDelete()
        guard case let .deleted(toast?) = vm.dismissal else {
            Issue.record("삭제 토스트가 담긴 닫기 요청이어야 한다: \(String(describing: vm.dismissal))")
            return
        }
        #expect(toast.message == FeedCopy.deleteSuccess)
        #expect(recorder.changes == [.deleted(postId: F.postID(minePost))])
        vm.consumeDismissal()
        #expect(vm.dismissal == nil)
    }

    @Test("TC-FEED-038 삭제 진행 중 연타해도 DELETE는 1회만 나가고 완료 후 반복 탭도 무시된다")
    func deleteIsSerialized() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let hold = Hold()
        await world.posts.setDeleteHandler { _ in try await hold.wait() }
        vm.deleteTapped()
        let first = Task { await vm.confirmDelete() }
        await world.posts.deleteSignal.wait()
        #expect(vm.isDeleting)
        await vm.confirmDelete()
        vm.deleteTapped()
        await vm.confirmDelete()
        await hold.open()
        await first.value
        vm.deleteTapped()
        await vm.confirmDelete()
        #expect(await world.posts.deletedIDs.count == 1)
    }

    @Test("TC-FEED-039 TC-FEED-042 삭제가 실패하면 화면에 머물러 사유를 알리고 다시 시도할 수 있다")
    func deleteFailureStaysAndRetries() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let counter = Counter()
        await world.posts.setDeleteHandler { _ in
            if await counter.next() == 1 { throw FeedFailure.network }
        }
        vm.deleteTapped()
        await vm.confirmDelete()
        #expect(vm.dismissal == nil)
        #expect(!vm.isDeleting)
        #expect(vm.toast?.message == FeedCopy.networkError)
        vm.deleteTapped()
        await vm.confirmDelete()
        #expect(await world.posts.deletedIDs.count == 2)
        if case .deleted = vm.dismissal {} else { Issue.record("재시도가 성공하면 닫기 요청이 있어야 한다") }
    }

    @Test("TC-FEED-044 삭제한 postId는 기억되어 이전 화면의 늦은 재검증 응답이 되살리지 못한다")
    func deletedPostNotResurrectedByLateResponse() async {
        let world = FeedWorld()
        let display = world.makeDisplay()
        await display.onAppear()
        let target = display.item(2)
        let late = Hold(ignoringCancellation: true)
        await world.posts.setListHandler { query in
            try await late.wait()
            return F.defaultPage(query)
        }
        let revalidation = Task { await display.tabReselected() }
        await world.posts.listSignal.wait(atLeast: 2)

        await world.setDetail(F.detail(id: target.id, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(target))
        await vm.onAppear()
        vm.deleteTapped()
        await vm.confirmDelete()
        #expect(!display.items.contains { $0.id == target.id })
        #expect(world.ledger.isRemoved(target.id))

        await late.open()
        await revalidation.value
        #expect(!display.items.contains { $0.id == target.id })
        #expect(display.items.count == 19)
    }

    @Test("TC-FEED-045 삭제 진행 중 화면을 벗어나도 결과는 반영되고 토스트는 담기지 않는다")
    func deleteWhileHiddenAppliesWithoutToast() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let hold = Hold()
        await world.posts.setDeleteHandler { _ in try await hold.wait() }
        vm.deleteTapped()
        let task = Task { await vm.confirmDelete() }
        await world.posts.deleteSignal.wait()
        vm.onDisappear()
        await hold.open()
        await task.value
        #expect(await world.posts.deletedIDs.count == 1)
        #expect(world.ledger.isRemoved(F.postID(minePost)))
        #expect(vm.dismissal == .deleted(toast: nil))
        #expect(vm.toast == nil)
    }

    // MARK: 계정 전환

    @Test("TC-FEED-057 사용자가 바뀌면 삭제 기억과 수정·삭제 버튼 판정이 이전 계정 기준으로 남지 않는다")
    func accountSwitchResetsDetailState() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        let vm = world.makeDetail(.listItem(mineItem()))
        await vm.onAppear()
        let removed = F.postID(88_001)
        world.ledger.record(.deleted(postId: removed))
        #expect(vm.isMine)
        #expect(vm.canEditTitle)
        #expect(vm.canDelete)
        #expect(world.ledger.isRemoved(removed))

        world.viewer.set(F.userB)
        #expect(!vm.isMine)
        #expect(!vm.canEditTitle)
        #expect(!vm.canDelete)
        #expect(!world.ledger.isRemoved(removed))
        vm.editTapped()
        vm.deleteTapped()
        #expect(vm.edit == nil)
        #expect(vm.deletePrompt == nil)
    }

    @Test("상세에서 재인증이 필요한 좋아요 실패는 needsLogin을 켠다")
    func likeReauthenticationRequired() async {
        let world = FeedWorld()
        await world.setDetail(F.detail(otherPost, likeCount: 10))
        let vm = world.makeDetail(.listItem(F.listItem(otherPost, likeCount: 10)))
        await vm.onAppear()
        vm.likeTapped()
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.unauthorized)
        await world.coordinator.settledAll()
        #expect(vm.needsLogin)
        #expect(vm.like == LikeState(isLiked: false, likeCount: 10))
    }
    // MARK: L2 연결용 보조(AI 대상, 다시 시도)

    @Test("AI 피드백 대상은 상세 응답 뒤에만 있고 topicDate와 내 게시물 판정을 담는다")
    func aiReviewTargetAfterConfirmation() async {
        let world = FeedWorld()
        let vm = world.makeDetail(.mine(postId: F.postID(minePost), thumbnailURL: nil))
        #expect(vm.aiReviewTarget == nil)
        await world.setDetail(F.detail(minePost, authorId: F.userAID, topicDate: F.today))
        await vm.onAppear()
        #expect(vm.aiReviewTarget == AIReviewTarget(postId: F.postID(minePost), topicDate: F.today, isMine: true))

        let other = world.makeDetail(.listItem(F.listItem(otherPost)))
        #expect(other.aiReviewTarget == nil)
        await world.setDetail(F.detail(otherPost, authorId: F.userBID))
        await other.onAppear()
        #expect(other.aiReviewTarget?.isMine == false)
    }

    @Test("오류 화면의 다시 시도는 상세를 다시 불러오고 screen_view를 다시 보내지 않는다")
    func retryReloadsWithoutScreenView() async {
        let world = FeedWorld()
        let vm = world.makeDetail(.mine(postId: F.postID(minePost), thumbnailURL: nil))
        await world.posts.setDetailHandler { _ in throw FeedFailure.server(status: 500) }
        await vm.onAppear()
        guard case .failed = vm.state else {
            Issue.record("오류 상태여야 한다: \(vm.state)")
            return
        }
        await world.setDetail(F.detail(minePost, authorId: F.userAID))
        await vm.retry()
        #expect(vm.state == .content)
        #expect(vm.isConfirmed)
        #expect(world.analytics.events == [.screenView(.feed, screenClass: nil)])
        await vm.retry() // 오류가 아니면 아무 일도 없다
        #expect(vm.state == .content)
    }
}
