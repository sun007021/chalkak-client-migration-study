import Foundation
import ChalkakCore
import ChalkakNetwork

// 기록 탭(REC) 저장소. 실패는 `FeedFailure`(호출 종류는 `.calendar`), 취소는 `CancellationError`.
// 홈 주간 기록용 `CalendarRepository`는 느슨한 디코딩(썸네일 nil 허용)이라 그대로 쓰지 않는다. 기록 탭은 응답 검증이 엄격하다(REQ-REC-018).

public protocol RecordCalendarRepository: Sendable {
    /// `GET /posts/calendar/months` (로그인 필요). 서버가 준 순서 그대로 돌려준다(정렬·중복 제거·현재 달 합치기는 ViewModel 몫, REQ-REC-002).
    func months() async throws -> [YearMonth]

    /// `GET /posts/calendar?year=&month=` (로그인 필요).
    /// - 요청 전 검증: `year`가 1...9999, `month`가 1...12가 아니면 요청을 보내지 않고 `FeedFailure.badRequest(message: nil)`을 던진다(TC-REC-031).
    /// - 응답 검증(REQ-REC-018): 응답의 year·month가 요청과 같고, 모든 `topicDate`가 그 달 안이며, 날짜가 중복되지 않고,
    ///   `thumbnailImageUrl`이 비어 있지 않고, `status`가 PENDING 또는 APPROVED여야 한다. 하나라도 어기면 `FeedFailure.invalidResponse`.
    /// - `posts: []`는 정상이다(REQ-REC-020). 응답 순서는 신경 쓰지 않는다(TC-REC-015).
    func calendar(_ month: YearMonth) async throws -> MonthlyCalendar
}

/// `GET /posts/calendar/months` 응답. 항목이 사용할 수 없는 연월(범위 밖)이면 디코딩 실패(→ `invalidResponse`)로 만든다.
private struct CalendarMonthList: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        let year: Int
        let month: Int
    }

    let months: [Item]
}

private extension YearMonth {
    /// 요청·응답에 쓸 수 있는 연월인가(연 1...9999, 월 1...12).
    var isRequestable: Bool { (1...9999).contains(year) && (1...12).contains(month) }
}

public struct APIRecordCalendarRepository: RecordCalendarRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func months() async throws -> [YearMonth] {
        let request = HTTPRequest(method: .get, path: "/posts/calendar/months")
        let list = try await perform(.calendar) { try await client.send(request, as: CalendarMonthList.self) }
        let months = list.months.map { YearMonth(year: $0.year, month: $0.month) }
        // 명세에 없는 연월은 계약 위반으로 본다(명세 확인 대상: 항목만 버릴지 전체를 버릴지).
        guard months.allSatisfy(\.isRequestable) else { throw FeedFailure.invalidResponse }
        return months
    }

    public func calendar(_ month: YearMonth) async throws -> MonthlyCalendar {
        // 범위 밖 연월은 서버가 400으로 거절할 값이라 요청을 보내지 않는다(TC-REC-031).
        guard month.isRequestable else { throw FeedFailure.badRequest(message: nil) }
        let request = HTTPRequest(method: .get, path: "/posts/calendar", query: [.int("year", month.year), .int("month", month.month)])
        let response = try await perform(.calendar) { try await client.send(request, as: RecordCalendarResponse.self) }
        return try response.validated(for: month)
    }
}

/// 기록 탭 전용 응답 모델. 홈의 `CalendarPost`는 썸네일 nil·깨진 값을 허용하므로 쓰지 않고, raw 문자열을 받아 REQ-REC-018을 직접 검사한다.
private struct RecordCalendarResponse: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        let topicDate: KSTDate
        let postId: UUID
        /// 키 없음·null이면 nil(계약 위반).
        let thumbnailImageUrl: String?
        let status: CalendarPostStatus

        private enum CodingKeys: String, CodingKey { case topicDate, postId, thumbnailImageUrl, status }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            topicDate = try c.decodeKSTDate(forKey: .topicDate)
            postId = try c.decode(APIUUID.self, forKey: .postId).value
            thumbnailImageUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailImageUrl)
            // PENDING·APPROVED 외 값은 항목만 버리지 않고 응답 전체를 계약 위반으로 본다(REQ-REC-018(5), 명세 확인 대상).
            guard let parsed = CalendarPostStatus(rawValue: try c.decode(String.self, forKey: .status)) else {
                throw DecodingError.dataCorruptedError(forKey: .status, in: c, debugDescription: "알 수 없는 status")
            }
            status = parsed
        }
    }

    let year: Int
    let month: Int
    let posts: [Item]

    /// REQ-REC-018: year·month 일치, 날짜가 그 달 안, 날짜 중복 없음, 썸네일이 비어 있지 않음. 하나라도 어기면 `invalidResponse`.
    /// 썸네일은 비어 있지 않기만 하면 되고, 표시용 URL은 https가 아니거나 형식이 틀리면 nil(대체 배경)이다(명세 확인 대상: 이런 값을 계약 위반으로 볼지).
    func validated(for requested: YearMonth) throws -> MonthlyCalendar {
        guard year == requested.year, month == requested.month else { throw FeedFailure.invalidResponse }
        var seen: Set<KSTDate> = []
        var posts: [CalendarPost] = []
        for item in self.posts {
            guard item.topicDate.year == requested.year, item.topicDate.month == requested.month,
                  let thumbnail = item.thumbnailImageUrl, !thumbnail.isEmpty,
                  seen.insert(item.topicDate).inserted else { throw FeedFailure.invalidResponse }
            posts.append(CalendarPost(topicDate: item.topicDate, postId: item.postId, thumbnailImageURL: URL.secureWebURL(thumbnail), status: item.status))
        }
        return MonthlyCalendar(year: year, month: month, posts: posts)
    }
}
