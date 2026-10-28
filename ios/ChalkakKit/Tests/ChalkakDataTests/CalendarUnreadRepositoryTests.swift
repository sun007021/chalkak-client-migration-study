import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("HOME 이번 주 기록(캘린더)·미읽음 저장소")
struct CalendarUnreadRepositoryTests {
    @Test("TC-HOME-026 TC-HOME-030 캘린더 요청 모양(year·month)과 매핑: 썸네일·상태·날짜", arguments: [
        ("home/posts-calendar__2026-10-week-approved.json", 2026, 10, 3),
        ("home/posts-calendar__2026-09-week.json", 2026, 9, 2),
        ("home/posts-calendar__2026-12-week.json", 2026, 12, 2),
        ("home/posts-calendar__2026-10-empty.json", 2026, 10, 0),
        ("home/posts-calendar__2027-01-empty.json", 2027, 1, 0),
    ])
    func mapping(name: String, year: Int, month: Int, count: Int) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)

        let calendar = try await sut.calendarRepository.month(YearMonth(year: year, month: month))

        #expect(calendar.year == year)
        #expect(calendar.month == month)
        #expect(calendar.posts.count == count)
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == fixture.query)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-HOME-030 PENDING·APPROVED 상태와 썸네일 URL을 그대로 매핑한다")
    func statusAndThumbnail() async throws {
        let sut = try FeedSUT(always: Fixture.load("home/posts-calendar__2026-10-week-pending.json"))
        let calendar = try await sut.calendarRepository.month(YearMonth(year: 2026, month: 10))
        #expect(calendar.posts.map(\.status) == [.approved, .pending])
        #expect(calendar.posts.map(\.topicDate) == [day(2026, 10, 26), day(2026, 10, 27)])
        #expect(calendar.posts[1].postId == UUID(uuidString: "22222222-2222-4222-8222-222222222201"))
        #expect(calendar.posts[1].thumbnailImageURL == URL(string: "https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/thumbnail.webp"))
    }

    @Test("썸네일이 없거나 null이어도 항목은 유지하고 thumbnailImageURL은 nil이다(대체 배경)", arguments: [
        #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","thumbnailImageUrl":null,"status":"APPROVED"}]}"#,
        #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","status":"APPROVED"}]}"#,
    ])
    func nullableThumbnail(body: String) async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
        let calendar = try await sut.calendarRepository.month(YearMonth(year: 2026, month: 10))
        #expect(calendar.posts.count == 1)
        #expect(calendar.posts[0].thumbnailImageURL == nil)
        #expect(calendar.posts[0].status == .approved)
    }

    @Test("TC-HOME-007 TC-HOME-032 500은 재시도 2회 뒤 server, 400은 badRequest(재시도 없음), 알 수 없는 status·깨진 날짜는 invalidResponse다")
    func failures() async throws {
        let server = try FeedSUT(always: Fixture.load("home/posts-calendar__500-server-error.json"))
        let serverFailure = await feedFailure { try await server.calendarRepository.month(YearMonth(year: 2026, month: 10)) }
        #expect(serverFailure == .server(status: 500))
        #expect(await server.transport.count == 3)

        let bad = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(400, #"{"errorCode":"BUSINESS_ERROR","message":"조회 조건이 올바르지 않습니다."}"#) })
        let badFailure = await feedFailure { try await bad.calendarRepository.month(YearMonth(year: 2026, month: 10)) }
        #expect(badFailure == .badRequest(message: "조회 조건이 올바르지 않습니다."))
        #expect(await bad.transport.count == 1)

        let ok = try FeedSUT(transport: FakeFeedTransport { _, _ in
            jsonResponse(200, #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","thumbnailImageUrl":null,"status":"PENDING"}]}"#)
        })
        #expect(try await ok.calendarRepository.month(YearMonth(year: 2026, month: 10)).posts.count == 1)

        for body in [
            #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","status":"REJECTED"}]}"#,
            #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-13-40","postId":"22222222-2222-4222-8222-222222222201","status":"APPROVED"}]}"#,
            #"{"year":2026,"month":10}"#,
        ] {
            let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
            let failure = await feedFailure { try await sut.calendarRepository.month(YearMonth(year: 2026, month: 10)) }
            #expect(failure == .invalidResponse)
        }
    }

    @Test("TC-HOME-050 unread-status의 hasUnread를 true·false로 매핑한다", arguments: [
        ("home/notifications-unread-status__true.json", true),
        ("home/notifications-unread-status__false.json", false),
    ])
    func unreadMapping(name: String, expected: Bool) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)
        let status = try await sut.unreadRepository.unreadStatus()
        #expect(status.hasUnread == expected)
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-HOME-052 unread-status 500은 재시도 2회 뒤 server 오류, hasUnread가 없으면 invalidResponse다")
    func unreadFailures() async throws {
        let server = try FeedSUT(always: Fixture.load("home/notifications-unread-status__500-server-error.json"))
        let failure = await feedFailure { try await server.unreadRepository.unreadStatus() }
        #expect(failure == .server(status: 500))
        #expect(await server.transport.count == 3)

        let ok = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, #"{"hasUnread":false}"#) })
        #expect(try await ok.unreadRepository.unreadStatus().hasUnread == false)
        let missing = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, "{}") })
        let missingFailure = await feedFailure { try await missing.unreadRepository.unreadStatus() }
        #expect(missingFailure == .invalidResponse)
    }

    @Test("FeedFailureMapper: 홈 호출의 403은 todayPost만 banned(D-08)이고 나머지는 forbidden, 404는 notFound다")
    func mapperForHomeOperations() {
        #expect(FeedFailureMapper.failure(status: 403, message: nil, operation: .todayPost) == .banned)
        for operation in [FeedOperation.calendar, .banners, .unreadStatus] {
            #expect(FeedFailureMapper.failure(status: 403, message: nil, operation: operation) == .forbidden)
        }
        for operation in [FeedOperation.todayPost, .calendar, .banners, .unreadStatus] {
            #expect(FeedFailureMapper.failure(status: 404, message: nil, operation: operation) == .notFound)
            #expect(FeedFailureMapper.failure(status: 401, message: nil, operation: operation) == .unauthorized)
            #expect(FeedFailureMapper.failure(status: 503, message: nil, operation: operation) == .server(status: 503))
        }
    }
}
