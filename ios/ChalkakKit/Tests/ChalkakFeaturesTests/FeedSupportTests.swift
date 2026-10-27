import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

@MainActor
@Suite("FEED 화면 지원(분배기·장부·문구)", .timeLimit(.minutes(1)))
struct FeedSupportTests {
    @Test("좋아요 이벤트 분배기는 모든 구독자에게 순서대로 전달하고 해제된 구독자는 건너뛴다")
    func broadcasterFansOut() {
        let broadcaster = LikeEventBroadcaster()
        let first = LikeEventRecorder()
        broadcaster.subscribe(first)
        var second: LikeEventRecorder? = LikeEventRecorder()
        broadcaster.subscribe(second!)
        let event = LikeEvent.stateChanged(postId: F.postID(1), state: LikeState(isLiked: true, likeCount: 3), cause: .optimistic)
        broadcaster.likeCoordinator(didEmit: event)
        #expect(first.events == [event])
        #expect(second?.events == [event])
        second = nil
        broadcaster.likeCoordinator(didEmit: .reauthenticationRequired)
        #expect(first.events == [event, .reauthenticationRequired])
    }

    @Test("장부는 삭제·비공개를 기억하고 구독자에게 알리며 제목 수정은 기억하지 않고 알리기만 한다")
    func ledgerRecordsRemovals() {
        let world = FeedWorld()
        let recorder = PostChangeRecorder()
        world.ledger.addObserver(recorder)
        let deleted = F.postID(1), unavailable = F.postID(2), renamed = F.postID(3)
        world.ledger.record(.deleted(postId: deleted))
        world.ledger.record(.unavailable(postId: unavailable))
        world.ledger.record(.titleChanged(postId: renamed, title: nil))
        #expect(world.ledger.isRemoved(deleted))
        #expect(world.ledger.isRemoved(unavailable))
        #expect(!world.ledger.isRemoved(renamed))
        #expect(recorder.changes.count == 3)
    }

    @Test("장부는 reset과 뷰어 변경으로 기억을 비운다")
    func ledgerResets() {
        let world = FeedWorld()
        let id = F.postID(1)
        world.ledger.record(.deleted(postId: id))
        world.ledger.reset()
        #expect(!world.ledger.isRemoved(id))
        world.ledger.record(.deleted(postId: id))
        world.viewer.set(F.userB)
        #expect(!world.ledger.isRemoved(id))
    }

    @Test("다이얼로그 문구는 shared/copy/ko.json과 같다")
    func dialogCopyMatchesSharedCopy() throws {
        let pairs: [(String, String)] = [
            ("feed.edit.title", FeedDialogCopy.editTitle),
            ("feed.edit.placeholder", FeedDialogCopy.editPlaceholder),
            ("feed.edit.cancel", FeedDialogCopy.editCancel),
            ("feed.edit.save", FeedDialogCopy.editSave),
            ("feed.edit.saving", FeedDialogCopy.editSaving),
            ("feed.delete.title", FeedDialogCopy.deleteTitle),
            ("feed.delete.body", FeedDialogCopy.deleteBody),
            ("feed.delete.confirm", FeedDialogCopy.deleteConfirm),
            ("feed.delete.cancel", FeedDialogCopy.deleteCancel),
        ]
        for (key, text) in pairs { #expect(try SharedCopy.require(key) == text, "\(key)") }
    }

    @Test("전시 머리글 설명 문구는 shared/copy/ko.json과 같다")
    func displayCopyMatchesSharedCopy() throws {
        #expect(try SharedCopy.require("display.header.desc-latest") == DisplayCopy.descLatest)
        #expect(try SharedCopy.require("display.header.desc-archive") == DisplayCopy.descArchive)
    }
}
