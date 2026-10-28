import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 홈 ISSUE 배너 목록(최초 조회, 페이징, 새로고침). docs/spec/features/home.md REQ-BANR-001~011.
///
/// - `loadFirstPage()`: 1페이지 조회. 성공(1개 이상) `.items`, 성공(0개) `.hidden`, 실패 `.failed(HomeCopy.issueError)`. 취소는 상태를 바꾸지 않는다.
/// - `itemAppeared(index:)`: 마지막 카드가 보이면(`index == count - 1`, 끝에서 `prefetchDistance`개 이내) 다음 페이지를 요청한다.
///   로딩 중·`hasNext == false`·직전 추가 페이지가 비었음·새로고침 중이면 요청하지 않는다. 추가 페이지는 중복 id를 거르며 누적한다.
///   실패하면 쌓인 목록을 유지하고 같은 페이지 번호로 다시 시도할 수 있다.
/// - `refresh()`: 새 1페이지로 교체하고 다음 요청을 2페이지부터 다시 시작한다. 실패면 기존 목록을 유지하고 실패를 돌려준다(토스트는 호출자).
///   빈 성공이면 `.hidden`. 새로고침·`cancel()`·`reset()` 이전에 보낸 요청의 늦은 응답은 버린다.
@MainActor
@Observable
public final class BannerListViewModel {
    /// 마지막 카드가 끝에서 이 개수 이내로 들어오면 다음 페이지를 요청한다.
    public static let prefetchDistance = 2

    public private(set) var state: IssueSectionState = .loading
    public private(set) var isLoadingMore = false
    public private(set) var isRefreshing = false
    public private(set) var hasNext = false
    /// 다음에 요청할 페이지 번호.
    public private(set) var nextPage = 2

    @ObservationIgnored private let repository: any BannerRepository
    @ObservationIgnored private let pageSize: Int
    @ObservationIgnored private let work = ActiveWork()
    /// 새로고침·취소·초기화·첫 조회마다 올라간다. 이전 세대의 늦은 응답을 알아보는 데 쓴다.
    @ObservationIgnored private var generation = 0

    public init(repository: any BannerRepository, pageSize: Int = AppConstants.bannerPageSize) {
        self.repository = repository
        self.pageSize = pageSize
    }

    public func loadFirstPage() async {
        generation += 1
        let token = generation
        work.cancel()
        isLoadingMore = false
        isRefreshing = false
        await work.run { [self] in
            do {
                let page = try await repository.page(1, pageSize: pageSize)
                guard token == generation, !Task.isCancelled else { return }
                apply(firstPage: page)
            } catch {
                guard token == generation, !error.isCancellation, !Task.isCancelled else { return }
                state = .failed(HomeCopy.issueError)
            }
        }
    }

    /// 최초 조회 실패 뒤 "다시 시도": 로딩 표시로 돌아가 1페이지를 다시 요청한다.
    public func retry() async {
        state = .loading
        await loadFirstPage()
    }

    /// 진행 중이던 새로고침·추가 페이지는 취소하고 새 세대로 다시 시작한다(중복 억제는 호출자 몫).
    @discardableResult
    public func refresh() async -> FeedFailure? {
        generation += 1
        let token = generation
        work.cancel()
        isLoadingMore = false
        isRefreshing = true
        var failure: FeedFailure?
        await work.run { [self] in
            // 해제는 자기 세대일 때만(더 새로운 요청이 이어받았으면 건드리지 않는다).
            defer { if token == generation { isRefreshing = false } }
            do {
                let page = try await repository.page(1, pageSize: pageSize)
                guard token == generation, !Task.isCancelled else { return }
                apply(firstPage: page)
            } catch {
                guard token == generation, !error.isCancellation, !Task.isCancelled else { return }
                failure = error as? FeedFailure ?? .network
                // 보이는 목록이 없으면 로딩에 머물지 않고 오류를 보인다.
                if state == .loading { state = .failed(HomeCopy.issueError) }
            }
        }
        return failure
    }

    public func itemAppeared(index: Int) async {
        guard case let .items(banners) = state, hasNext, !isLoadingMore, !isRefreshing,
              index >= banners.count - Self.prefetchDistance else { return }
        let token = generation
        let page = nextPage
        isLoadingMore = true
        await work.run { [self] in
            defer { if token == generation { isLoadingMore = false } }
            do {
                let result = try await repository.page(page, pageSize: pageSize)
                guard token == generation, !Task.isCancelled else { return }
                apply(extraPage: result, current: banners)
            } catch {
                // 실패·취소 모두 쌓인 목록과 다음 페이지 번호를 그대로 둬 같은 페이지를 다시 요청할 수 있다.
            }
        }
    }

    /// 화면 이탈: 진행 중 요청을 취소하고 늦은 응답을 버린다.
    public func cancel() {
        generation += 1
        isLoadingMore = false
        isRefreshing = false
        work.cancel()
    }

    /// 계정 전환: 목록을 비우고 `.loading`으로 돌아간다.
    public func reset() {
        cancel()
        state = .loading
        hasNext = false
        nextPage = 2
    }

    private func apply(firstPage page: BannerPage) {
        let banners = unique(page.banners)
        hasNext = page.hasNext
        nextPage = 2
        state = banners.isEmpty ? .hidden : .items(banners)
    }

    private func apply(extraPage page: BannerPage, current: [Banner]) {
        let known = Set(current.map(\.id))
        let added = unique(page.banners).filter { !known.contains($0.id) }
        nextPage += 1
        // 빈 페이지는 hasNext가 true여도 끝으로 본다.
        hasNext = page.hasNext && !page.banners.isEmpty
        state = .items(current + added)
    }

    private func unique(_ banners: [Banner]) -> [Banner] {
        var seen = Set<UUID>()
        return banners.filter { seen.insert($0.id).inserted }
    }
}
