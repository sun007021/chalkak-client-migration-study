import Foundation
import ChalkakCore
import ChalkakNetwork

// 홈·배너 저장소. 실패는 `FeedFailure`(호출 종류는 `FeedOperation.todayPost/.calendar/.banners/.unreadStatus`), 취소는 `CancellationError`.

public protocol TodayPostRepository: Sendable {
    /// `GET /posts/today` (로그인 필요, session 정책). 404 → `.notFound`(참여 가능한 주제 없음), 403 → `.banned`.
    func todayStatus() async throws -> TodayPostStatus
}

public protocol CalendarRepository: Sendable {
    /// `GET /posts/calendar?year=&month=` (로그인 필요).
    func month(_ month: YearMonth) async throws -> MonthlyCalendar
}

public protocol BannerRepository: Sendable {
    /// `GET /banners?page=&pageSize=` — 항상 anonymous(로그인 상태에서도 Authorization을 붙이지 않고, 401에서 갱신하지 않는다).
    func page(_ page: Int, pageSize: Int) async throws -> BannerPage
}

public protocol UnreadStatusRepository: Sendable {
    /// `GET /notifications/unread-status` (로그인 필요).
    func unreadStatus() async throws -> UnreadStatus
}

public struct APITodayPostRepository: TodayPostRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }
    public func todayStatus() async throws -> TodayPostStatus {
        let request = HTTPRequest(method: .get, path: "/posts/today")
        return try await perform(.todayPost) { try await client.send(request, as: TodayPostStatus.self) }
    }
}

public struct APICalendarRepository: CalendarRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }
    public func month(_ month: YearMonth) async throws -> MonthlyCalendar {
        let request = HTTPRequest(method: .get, path: "/posts/calendar", query: [.int("year", month.year), .int("month", month.month)])
        return try await perform(.calendar) { try await client.send(request, as: MonthlyCalendar.self) }
    }
}

public struct APIBannerRepository: BannerRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }
    public func page(_ page: Int, pageSize: Int) async throws -> BannerPage {
        // 로그인 여부와 무관하게 토큰을 붙이지 않으므로 401에서도 갱신하지 않는다.
        let request = HTTPRequest(method: .get, path: "/banners", query: [.int("page", page), .int("pageSize", pageSize)], authPolicy: .anonymous)
        return try await perform(.banners) { try await client.send(request, as: BannerPage.self) }
    }
}

public struct APIUnreadStatusRepository: UnreadStatusRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }
    public func unreadStatus() async throws -> UnreadStatus {
        let request = HTTPRequest(method: .get, path: "/notifications/unread-status")
        return try await perform(.unreadStatus) { try await client.send(request, as: UnreadStatus.self) }
    }
}
