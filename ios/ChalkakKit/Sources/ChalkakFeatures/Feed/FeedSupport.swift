import Foundation
import ChalkakData

// MARK: 좋아요 이벤트 분배

/// `LikeCoordinator`는 sink를 하나만 가지므로, 화면 ViewModel 여러 개(전시·상세·홈)가 함께 받도록 나눠 주는 중계기.
/// 앱 조립 지점에서 `LikeCoordinator(sink: broadcaster)`로 꽂고, 각 ViewModel이 `subscribe`한다(약한 참조).
@MainActor
public final class LikeEventBroadcaster: LikeEventSink {
    private struct Subscriber { weak var sink: (any LikeEventSink)? }
    private var subscribers: [Subscriber] = []

    public init() {}

    public func subscribe(_ sink: any LikeEventSink) {
        subscribers.append(Subscriber(sink: sink))
    }

    /// 구독 순서대로 전달한다. 해제된 구독자는 건너뛰고 정리한다.
    public func likeCoordinator(didEmit event: LikeEvent) {
        let live = subscribers.compactMap(\.sink)
        subscribers.removeAll { $0.sink == nil }
        for sink in live { sink.likeCoordinator(didEmit: event) }
    }
}

// MARK: 화면 간 게시물 변경 동기화

/// 한 화면에서 일어난 게시물 변경(상세의 삭제·제목 수정 등)을 다른 화면(전시 목록·기록·홈)에 알리는 일.
public enum PostChange: Sendable, Equatable {
    /// 내가 삭제했다(204, 또는 삭제 404). 목록·캐시·추천 카드에서 빼야 한다.
    case deleted(postId: UUID)
    /// 제목을 고쳤다. 목록 캐시의 제목을 바꿔야 한다(`nil`이면 무제).
    case titleChanged(postId: UUID, title: String?)
    /// 404: 이미 없거나 비공개다(좋아요·상세·수정 404). 목록·캐시에서 빼야 한다.
    case unavailable(postId: UUID)
}

@MainActor
public protocol PostChangeObserver: AnyObject {
    func postChangeLedger(didRecord change: PostChange)
}

/// 삭제·비공개로 확인된 게시물을 기억해(늦게 도착한 목록 재검증 응답이 되살리지 못하게) 둔 장부이자 변경 알림 허브.
/// 뷰어가 바뀌면(로그아웃·계정 전환) 장부를 비우고 이전 계정의 기억이 남지 않게 한다(`LikeCoordinator`처럼 viewer를 보고 스스로 감지).
@MainActor
public final class PostChangeLedger {
    private struct Observer { weak var observer: (any PostChangeObserver)? }
    private let viewer: any ViewerContext
    private var observers: [Observer] = []
    private var removed: Set<UUID> = []
    private var owner: String?

    public init(viewer: any ViewerContext) {
        self.viewer = viewer
        owner = viewer.userId?.lowercased()
    }

    /// 변경을 기록하고 구독자(전시 목록 등)에게 알린다. `deleted`·`unavailable`은 `isRemoved`로 기억한다.
    /// 이미 기억한 게시물의 삭제·비공개는 다시 알리지 않는다(여러 화면이 같은 404를 따로 기록해도 한 번만 전파).
    public func record(_ change: PostChange) {
        syncOwner()
        switch change {
        case let .deleted(postId), let .unavailable(postId):
            guard removed.insert(postId).inserted else { return }
        case .titleChanged:
            break
        }
        for observer in observers.compactMap(\.observer) { observer.postChangeLedger(didRecord: change) }
        observers.removeAll { $0.observer == nil }
    }

    /// 삭제·비공개로 확인된 게시물인가. 목록 응답을 그릴 때 이 게시물은 거른다.
    public func isRemoved(_ postId: UUID) -> Bool {
        syncOwner()
        return removed.contains(postId)
    }

    /// 약한 참조로 구독한다.
    public func addObserver(_ observer: any PostChangeObserver) {
        observers.append(Observer(observer: observer))
    }

    /// 기억을 모두 비운다(계정 전환). 뷰어가 바뀐 것을 감지했을 때도 스스로 부른다.
    public func reset() {
        removed.removeAll()
        owner = viewer.userId?.lowercased()
    }

    private func syncOwner() {
        if viewer.userId?.lowercased() != owner { reset() }
    }
}

// MARK: 문구(화면 전용)

/// 제목 수정·삭제 다이얼로그 문구. 값은 `shared/copy/ko.json`과 같아야 한다.
public enum FeedDialogCopy {
    public static let editTitle = "게시물 제목 수정"
    public static let editPlaceholder = "제목을 입력해 주세요."
    public static let editCancel = "취소"
    public static let editSave = "저장"
    public static let editSaving = "저장 중..."
    public static let deleteTitle = "게시물 삭제"
    public static let deleteBody = "게시물을 삭제하시겠어요?"
    public static let deleteConfirm = "삭제"
    public static let deleteCancel = "취소"
}

/// 전시 머리글 설명 문구. 값은 `shared/copy/ko.json`의 `display.header.desc-*`와 같아야 한다.
public enum DisplayCopy {
    public static let descLatest = "같은 주제에서 다른 시선을 느껴보세요"
    public static let descArchive = "가장 사람들이 좋아했던 사진들이에요"
}

// MARK: 상세 진입

/// 게시물 상세로 들어오는 경로(D-26): 응답 전에는 경로가 주는 값을 임시로 쓴다.
public enum PostDetailEntry: Sendable, Equatable {
    /// 전시·홈 랭킹: 목록의 게시물을 시드로 먼저 보여 주고 상세를 재검증한다. `isMine`은 목록 값.
    case listItem(PostListItem)
    /// 기록·푸시: 내 게시물(썸네일은 있으면 먼저 보여 준다). 상세 응답 전에는 로딩.
    case mine(postId: UUID, thumbnailURL: URL?)
}
