import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

private let myPost = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!

@Suite("HOME 오늘 게시물 상태(GET /posts/today) 저장소")
struct TodayPostRepositoryTests {
    @Test("TC-HOME-003 TC-HOME-004 TC-HOME-005 TC-HOME-010 상태 fixture를 모델로 매핑한다(null postId·moderationStatus도 깨지지 않는다)", arguments: [
        ("home/posts-today__not-posted.json", false, nil as UUID?, nil as ModerationStatus?),
        ("home/posts-today__not-posted-after-reject.json", false, nil as UUID?, nil as ModerationStatus?),
        ("home/posts-today__posted-validating.json", true, myPost as UUID?, ModerationStatus.validating as ModerationStatus?),
        ("home/posts-today__posted-pending.json", true, myPost as UUID?, ModerationStatus.pending as ModerationStatus?),
        ("home/posts-today__posted-approved.json", true, myPost as UUID?, ModerationStatus.approved as ModerationStatus?),
    ])
    func mapping(name: String, isPosted: Bool, postId: UUID?, status: ModerationStatus?) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)

        let result = try await sut.todayRepository.todayStatus()

        #expect(result.topicDate == day(2026, 10, 27))
        #expect(result.isPosted == isPosted)
        #expect(result.postId == postId)
        #expect(result.moderationStatus == status)
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")   // 로그인 필요 API(session 정책)
    }

    @Test("TC-HOME-002 404는 notFound(참여 가능한 주제 없음)이고 재시도하지 않는다")
    func noOpenTopic() async throws {
        let sut = try FeedSUT(always: Fixture.load("home/posts-today__404-no-open-topic.json"))
        let failure = await feedFailure { try await sut.todayRepository.todayStatus() }
        #expect(failure == .notFound)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-HOME-008 403(정지 회원)은 banned이고 재시도하지 않는다")
    func banned() async throws {
        let sut = try FeedSUT(always: Fixture.load("home/posts-today__403-banned.json"))
        let failure = await feedFailure { try await sut.todayRepository.todayStatus() }
        #expect(failure == .banned)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-HOME-009 500은 0.5초·1초 백오프로 2회 재시도한 뒤 server 오류이고 연결 실패는 network다")
    func serverAndNetworkFailures() async throws {
        let server = try FeedSUT(always: Fixture.load("home/posts-today__500-server-error.json"))
        let serverFailure = await feedFailure { try await server.todayRepository.todayStatus() }
        #expect(serverFailure == .server(status: 500))
        #expect(await server.transport.count == 3)
        #expect(server.clock.recordedSleeps == [.milliseconds(500), .seconds(1)])

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        let offlineFailure = await feedFailure { try await offline.todayRepository.todayStatus() }
        #expect(offlineFailure == .network)
    }

    @Test("TC-HOME-011 알 수 없는 moderationStatus는 응답 전체가 invalidResponse다(앱이 깨지지 않고 히어로 Error로 간다)")
    func unknownModerationStatus() async throws {
        let ok = try FeedSUT(always: Fixture.load("home/posts-today__posted-approved.json"))
        #expect(try await ok.todayRepository.todayStatus().moderationStatus == .approved)   // 정상 응답은 통과

        let sut = try FeedSUT(always: Fixture.load("home/posts-today__unknown-status.json"))
        let failure = await feedFailure { try await sut.todayRepository.todayStatus() }
        #expect(failure == .invalidResponse)
        #expect(await sut.transport.count == 1)
    }

    @Test("REQ-HOME-017 모순된 조합(isPosted=false인데 postId·moderationStatus가 있음, isPosted=true인데 postId 없음)은 invalidResponse다", arguments: [
        #"{"topicDate":"2026-10-27","isPosted":false,"postId":"22222222-2222-4222-8222-222222222201","moderationStatus":null}"#,
        #"{"topicDate":"2026-10-27","isPosted":false,"postId":null,"moderationStatus":"APPROVED"}"#,
        #"{"topicDate":"2026-10-27","isPosted":true,"postId":null,"moderationStatus":"APPROVED"}"#,
        #"{"topicDate":"2026-10-27","isPosted":true,"moderationStatus":"PENDING"}"#,
        #"{"isPosted":false,"postId":null,"moderationStatus":null}"#,
        #"{"topicDate":"2026-10-27","isPosted":"yes","postId":null,"moderationStatus":null}"#,
    ])
    func contradictoryCombinations(body: String) async throws {
        let valid = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, #"{"topicDate":"2026-10-27","isPosted":false,"postId":null,"moderationStatus":null}"#) })
        #expect(try await valid.todayRepository.todayStatus().isPosted == false)   // 정상 응답은 통과

        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
        let failure = await feedFailure { try await sut.todayRepository.todayStatus() }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-HOME-014 401 UNAUTHORIZED는 refresh 1회 뒤 원 요청을 1회 재전송해 정상 응답을 돌려준다")
    func unauthorizedRefreshesThenRetries() async throws {
        let unauthorized = try Fixture.load("home/posts-today__401-unauthorized.json")
        let ok = try Fixture.load("home/posts-today__posted-approved.json")
        let sut = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok.httpResponse : unauthorized.httpResponse
        })

        let result = try await sut.todayRepository.todayStatus()

        #expect(result.moderationStatus == .approved)
        let requests = await sut.transport.requests
        #expect(requests.filter { $0.url.path.hasSuffix("/posts/today") }.count == 2)
        #expect(requests.filter { $0.url.path.hasSuffix("/auth/refresh") }.count == 1)
    }

    @Test("취소(CancellationError)는 오류로 바꾸지 않고 그대로 전파한다")
    func cancellationPropagates() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        do {
            _ = try await sut.todayRepository.todayStatus()
            Issue.record("오류가 나야 한다")
        } catch is CancellationError {
        } catch {
            Issue.record("CancellationError가 아닌 오류: \(error)")
        }
    }
}

extension FeedSUT {
    var todayRepository: APITodayPostRepository { APITodayPostRepository(client: client) }
    var calendarRepository: APICalendarRepository { APICalendarRepository(client: client) }
    var bannerRepository: APIBannerRepository { APIBannerRepository(client: client) }
    var unreadRepository: APIUnreadStatusRepository { APIUnreadStatusRepository(client: client) }
}
