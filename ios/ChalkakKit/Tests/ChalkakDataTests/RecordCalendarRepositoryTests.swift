import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

extension FeedSUT {
    var recordRepository: APIRecordCalendarRepository { APIRecordCalendarRepository(client: client) }
}

private let oct = YearMonth(year: 2026, month: 10)

@Suite("REC 기록 저장소(월 목록·월별 달력)", .timeLimit(.minutes(1)))
struct RecordCalendarRepositoryTests {
    // MARK: 요청 모양

    @Test("TC-REC-001 월 목록은 GET /posts/calendar/months(인증 헤더, 쿼리 없음)로 요청한다")
    func monthsRequestShape() async throws {
        let fixture = try Fixture.load("record/posts-calendar-months__recent-first.json")
        let sut = try FeedSUT(always: fixture)

        _ = try await sut.recordRepository.months()

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary.isEmpty)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-REC-001 월별 달력은 GET /posts/calendar?year=2026&month=10(인증 헤더)로 요청하고 3건을 매핑한다")
    func calendarRequestShape() async throws {
        let fixture = try Fixture.load("record/posts-calendar__2026-10.json")
        let sut = try FeedSUT(always: fixture)

        let calendar = try await sut.recordRepository.calendar(oct)

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == ["year": "2026", "month": "10"])
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(calendar.year == 2026 && calendar.month == 10)
        #expect(calendar.posts.map(\.status) == [.approved, .pending, .approved])
        #expect(calendar.posts.map(\.topicDate) == [
            KSTDate(year: 2026, month: 10, day: 20)!, KSTDate(year: 2026, month: 10, day: 27)!, KSTDate(year: 2026, month: 10, day: 31)!,
        ])
    }

    // MARK: 월 목록 매핑

    @Test("TC-REC-002 TC-REC-003 월 목록은 서버가 준 연월을 그대로 돌려주고 현재 달을 임의로 넣지 않는다", arguments: [
        ("record/posts-calendar-months__recent-first.json", [[2026, 10], [2026, 9]]),
        ("record/posts-calendar-months__empty.json", []),
        ("record/posts-calendar-months__without-current.json", [[2026, 9]]),
        ("record/posts-calendar-months__multi-year.json", [[2026, 10], [2026, 9], [2025, 12], [2025, 3]]),
    ])
    func monthsMapping(name: String, expected: [[Int]]) async throws {
        let sut = try FeedSUT(always: Fixture.load(name))
        let months = try await sut.recordRepository.months()
        #expect(months == expected.map { YearMonth(year: $0[0], month: $0[1]) })
    }

    @Test("TC-REC-032 월 목록 500은 재시도 2회 뒤 server 오류다")
    func monthsServerError() async throws {
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__500-server-error.json"))
        let failure = await feedFailure { try await sut.recordRepository.months() }
        #expect(failure == .server(status: 500))
        #expect(await sut.transport.count == 3)
    }

    // MARK: 달력 매핑·정상 응답

    @Test("TC-REC-015 TC-REC-020 응답 순서와 무관하게 모든 항목을 매핑하고, 기록 없는 달(posts: [])은 오류가 아니다", arguments: [
        ("record/posts-calendar__2026-10-shuffled.json", 2026, 10, 3),
        ("record/posts-calendar__2026-10-after-delete.json", 2026, 10, 2),
        ("record/posts-calendar__2026-09.json", 2026, 9, 2),
        ("record/posts-calendar__2026-08-empty.json", 2026, 8, 0),
        ("record/posts-calendar__2026-11-empty.json", 2026, 11, 0),
    ])
    func validResponses(name: String, year: Int, month: Int, count: Int) async throws {
        let sut = try FeedSUT(always: Fixture.load(name))
        let calendar = try await sut.recordRepository.calendar(YearMonth(year: year, month: month))
        #expect(calendar.posts.count == count)
        #expect(calendar.year == year && calendar.month == month)
    }

    // MARK: 응답 검증 (REQ-REC-018)

    @Test("TC-REC-012 TC-REC-013 응답 year·month 불일치, 달 밖 날짜, 날짜 중복, 빈 썸네일은 InvalidResponse다", arguments: [
        "record/posts-calendar__month-mismatch.json",
        "record/posts-calendar__date-out-of-month.json",
        "record/posts-calendar__duplicate-date.json",
        "record/posts-calendar__empty-thumbnail.json",
    ])
    func contractViolations(name: String) async throws {
        let sut = try FeedSUT(always: Fixture.load(name))
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .invalidResponse)
        #expect(await sut.transport.count == 1, "계약 위반은 재시도하지 않는다")
    }

    @Test("TC-REC-013 썸네일이 없거나 null인 항목도 계약 위반이다 (기록 탭은 홈과 달리 썸네일이 필수)", arguments: [
        #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","thumbnailImageUrl":null,"status":"APPROVED"}]}"#,
        #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","status":"APPROVED"}]}"#,
    ])
    func missingThumbnail(body: String) async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in .json(200, body) })
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-REC-014 알 수 없는 status(REJECTED·새 값)가 하나라도 있으면 항목만 버리지 않고 응답 전체가 InvalidResponse다")
    func unknownStatusRejectsWholeResponse() async throws {
        // 스펙 REQ-REC-018(5)을 따랐다. 카탈로그의 "해당 날짜는 사진 패널이 없는 날로 다룬다"와 충돌한다(명세 확인 대상).
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__unknown-status.json"))
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .invalidResponse)
    }

    // MARK: 요청 값 범위·오류 매핑

    @Test("TC-REC-031 year는 1~9999, month는 1~12 범위만 보낸다: 범위 밖이면 요청 없이 badRequest다", arguments: [
        YearMonth(year: 0, month: 5), YearMonth(year: 10000, month: 5),
        YearMonth(year: 2026, month: 0), YearMonth(year: 2026, month: 13),
    ])
    func outOfRangeIsNotSent(month: YearMonth) async throws {
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__2026-10.json"))
        let failure = await feedFailure { try await sut.recordRepository.calendar(month) }
        #expect(failure == .badRequest(message: nil))
        #expect(await sut.transport.count == 0)
    }

    @Test("TC-REC-031 범위의 경계값(1년 1월, 9999년 12월)은 그대로 보낸다")
    func boundaryValuesAreSent() async throws {
        let body = #"{"year":9999,"month":12,"posts":[]}"#
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in .json(200, body) })
        _ = try await sut.recordRepository.calendar(YearMonth(year: 9999, month: 12))
        let request = try #require(await sut.transport.requests.first)
        #expect(request.queryDictionary == ["year": "9999", "month": "12"])
    }

    @Test("TC-REC-031 서버 400은 badRequest(재시도 없음)다")
    func serverBadRequest() async throws {
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__400-invalid-month.json"))
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .badRequest(message: "조회 연월이 올바르지 않습니다."))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-REC-032 달력 500은 재시도 2회 뒤 server 오류다")
    func calendarServerError() async throws {
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__500-server-error.json"))
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .server(status: 500))
        #expect(await sut.transport.count == 3)
    }

    @Test("TC-REC-030 갱신할 수 없는 401은 unauthorized다")
    func unauthorized() async throws {
        let sut = try FeedSUT(always: Fixture.load("record/posts-calendar__401-unauthorized.json"))
        let failure = await feedFailure { try await sut.recordRepository.calendar(oct) }
        #expect(failure == .unauthorized)
    }
}
