import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("Topic 저장소")
struct TopicRepositoryTests {
    @Test("TC-DISP-002 GET /topics?date= 요청 모양: 익명(Authorization 없음)이고 응답 topicDate를 정규 날짜로 매핑한다")
    func requestShapeAndMapping() async throws {
        let fixture = try Fixture.load("display/topics__open-2026-10-27.json")
        let sut = try FeedSUT(always: fixture)   // 세션이 있어도 토큰을 붙이지 않는다

        let topic = try await sut.topics.topic(on: day(2026, 10, 27))

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == fixture.query)
        #expect(request.header("Authorization") == nil)
        #expect(topic.id == UUID(uuidString: "11111111-1111-4111-8111-111111111127"))
        #expect(topic.title == "가을 하늘")
        #expect(topic.topicDate == day(2026, 10, 27))
        #expect(topic.phase == .open)
        #expect(topic.startsAt == Instant.parse("2026-10-26T15:00:00Z"))
        #expect(topic.endsAt == Instant.parse("2026-10-27T15:00:00Z"))
    }

    @Test("TC-DISP-009 phase가 BEFORE_OPEN이어도 정상 응답으로 매핑한다")
    func beforeOpenPhase() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/topics__before-open.json"))
        let topic = try await sut.topics.topic(on: day(2026, 10, 28))
        #expect(topic.phase == .beforeOpen)
        #expect(topic.topicDate == day(2026, 10, 28))
    }

    @Test("TC-DISP-028 최초 전시일 주제를 같은 방식으로 조회한다")
    func firstDate() async throws {
        let fixture = try Fixture.load("display/topics__first-date-2026-09-17.json")
        let sut = try FeedSUT(always: fixture)
        let topic = try await sut.topics.topic(on: AppConstants.firstTopicDate)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.queryDictionary == ["date": "2026-09-17"])
        #expect(topic.topicDate == AppConstants.firstTopicDate)
    }

    @Test("TC-DISP-006 TC-DISP-031 404는 notFound로 매핑하고 재시도하지 않는다")
    func notFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/topics__404-not-found.json"))
        let failure = await feedFailure { try await sut.topics.topic(on: day(2026, 10, 26)) }
        #expect(failure == .notFound)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-DISP-005 TC-DISP-033 500은 0.5초·1초 백오프로 2회 재시도한 뒤 server 오류다")
    func serverErrorRetries() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/topics__500-server-error.json"))
        let failure = await feedFailure { try await sut.topics.topic(on: day(2026, 10, 27)) }
        #expect(failure == .server(status: 500))
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-DISP-005 연결 실패는 재시도 후 network 오류다")
    func networkFailure() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        let failure = await feedFailure { try await sut.topics.topic(on: day(2026, 10, 27)) }
        #expect(failure == .network)
        #expect(await sut.transport.count == 3)
    }

    @Test("TC-DISP-048 취소는 FeedFailure로 바꾸지 않고 CancellationError로 전파한다(D-20)")
    func cancellationPropagates() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        await #expect(throws: CancellationError.self) { try await sut.topics.topic(on: day(2026, 10, 27)) }
    }
}
