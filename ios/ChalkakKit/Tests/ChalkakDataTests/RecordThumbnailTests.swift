import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("REC 저장소: 썸네일 값 검사", .timeLimit(.minutes(1)))
struct RecordThumbnailTests {
    private func body(_ thumbnail: String) -> String {
        #"{"year":2026,"month":10,"posts":[{"topicDate":"2026-10-27","postId":"22222222-2222-4222-8222-222222222201","thumbnailImageUrl":"\#(thumbnail)","status":"APPROVED"}]}"#
    }

    @Test("REQ-REC-018(4) 비어 있지 않은 http·형식 오류 썸네일은 계약 위반이 아니고 표시용 URL만 nil이다 (명세 확인 대상)", arguments: [
        "http://cdn.example.test/a.webp", "not a url", "ftp://cdn.example.test/a.webp",
    ])
    func nonEmptyButInsecureThumbnailIsAccepted(thumbnail: String) async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in .json(200, body(thumbnail)) })
        let calendar = try await sut.recordRepository.calendar(YearMonth(year: 2026, month: 10))
        #expect(calendar.posts.count == 1)
        #expect(calendar.posts.first?.thumbnailImageURL == nil)
    }

    @Test("https 썸네일은 그대로 URL이 된다")
    func httpsThumbnail() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in .json(200, body("https://cdn.example.test/a.webp")) })
        let calendar = try await sut.recordRepository.calendar(YearMonth(year: 2026, month: 10))
        #expect(calendar.posts.first?.thumbnailImageURL == URL(string: "https://cdn.example.test/a.webp"))
    }
}
