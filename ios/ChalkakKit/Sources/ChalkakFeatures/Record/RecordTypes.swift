import Foundation
import ChalkakCore
import ChalkakData

/// 처음 불러오기 실패의 종류(REQ-REC-024). 오류 분기는 호출 API·HTTP 상태로만 한다(D-02).
public enum RecordLoadFailure: Sendable, Equatable {
    /// 401 → "로그인이 필요해요" + "로그인 하기"
    case loginRequired
    /// 400 → "조회할 수 없는 연월이에요"
    case invalidMonth
    /// 그 밖의 실패·계약 위반 → "기록을 불러오지 못했어요" + "다시 시도"
    case other

    /// 오류 화면 제목.
    public var title: String {
        switch self {
        case .loginRequired: RecordCopy.errorUnauthorized
        case .invalidMonth: RecordCopy.errorInvalidMonth
        case .other: RecordCopy.errorOther
        }
    }

    /// 오류 화면 버튼. 400은 버튼이 없다(다시 보내도 같은 결과).
    public var buttonTitle: String? {
        switch self {
        case .loginRequired: RecordCopy.loginButton
        case .invalidMonth: nil
        case .other: RecordCopy.retryButton
        }
    }
}

/// 화면 상태(상태 표). `idle`은 아직 들어오지 않았거나(또는 `reset` 직후) 게스트라 불러오지 않은 상태.
public enum RecordPhase: Sendable, Equatable {
    case idle
    /// 캐시 없는 달을 처음 불러오는 중(달력 내용은 비운다).
    case loading
    /// 보여 줄 달력이 있다(재검증 중이어도 `loaded`, `RecordViewModel.isRevalidating`로 구분).
    case loaded
    case failed(RecordLoadFailure)
}

/// 달력 한 달의 격자 배치(일요일 시작 7열). 순수 계산(REQ-REC-009, REQ-REC-010).
public struct RecordMonthLayout: Sendable, Equatable {
    public let month: YearMonth
    /// 1일 앞의 빈 칸 수(일요일이면 0, 토요일이면 6).
    public let leadingBlankCount: Int
    /// 그 달의 날수(윤년 반영).
    public let dayCount: Int
    /// `rowCount * 7`칸. 앞·뒤 빈 칸은 nil, 이전·다음 달 날짜는 채우지 않는다.
    public let cells: [KSTDate?]
    public var rowCount: Int { cells.count / 7 }

    /// 빈 배치(`.idle`용). 달력에 없는 연월의 배치와 같다.
    public static let empty = RecordMonthLayout(month: YearMonth(year: 0, month: 0))

    /// 연월이 달력에 없는 값(연 1...9999, 월 1...12 밖)이면 빈 배치다.
    public init(month: YearMonth) {
        self.month = month
        guard let first = KSTDate(year: month.year, month: month.month, day: 1),
              let blanks = KST.week(containing: first).firstIndex(of: first),
              let days = (28...31).last(where: { KSTDate(year: month.year, month: month.month, day: $0) != nil })
        else {
            leadingBlankCount = 0
            dayCount = 0
            cells = []
            return
        }
        leadingBlankCount = blanks
        dayCount = days
        let used = blanks + days
        let trailing = (7 - used % 7) % 7
        cells = Array(repeating: nil, count: blanks)
            + (1...days).map { KSTDate(year: month.year, month: month.month, day: $0) }
            + Array(repeating: nil, count: trailing)
    }
}

/// 월 선택지: 연월 최신순·중복 없음의 순수 값. 이웃 달·연도 선택 계산을 ViewModel에서 분리한다(REQ-REC-002, REQ-REC-005).
public struct RecordMonthOptions: Sendable, Equatable {
    /// 최신순, 중복 없음.
    public let months: [YearMonth]

    /// 서버 연월 목록 ∪ 현재 달(REQ-REC-002).
    public init(server: [YearMonth], current: YearMonth) {
        months = Array(Set(server + [current])).sorted(by: >)
    }

    /// 이미 정렬된 선택지를 그대로 쓴다.
    init(months: [YearMonth]) { self.months = months }

    /// 선택지에 있는 연도(최신순, 중복 없음).
    public var years: [Int] { Array(Set(months.map(\.year))).sorted(by: >) }

    /// 한 칸 더 오래된 달. `month`가 선택지에 없으면 nil.
    public func older(than month: YearMonth) -> YearMonth? { neighbor(of: month, offset: 1) }
    /// 한 칸 더 최신 달. `month`가 선택지에 없으면 nil.
    public func newer(than month: YearMonth) -> YearMonth? { neighbor(of: month, offset: -1) }

    /// `year`에 선택지가 있는 달 중 `month`의 월 번호와 가장 가까운 달(거리가 같으면 더 최신). 그 해가 선택지에 없으면 nil.
    public func nearest(inYear year: Int, to month: YearMonth) -> YearMonth? {
        months.filter { $0.year == year }.min { lhs, rhs in
            let (left, right) = (abs(lhs.month - month.month), abs(rhs.month - month.month))
            return left != right ? left < right : lhs.month > rhs.month
        }
    }

    private func neighbor(of month: YearMonth, offset: Int) -> YearMonth? {
        guard let index = months.firstIndex(of: month), months.indices.contains(index + offset) else { return nil }
        return months[index + offset]
    }
}

/// 이미지 저장에 쓰는 한 달의 내용.
public struct RecordCalendarSnapshot: Sendable, Equatable {
    public let month: YearMonth
    /// 화면에 보이는 게시물(삭제한 게시물은 빠진 상태).
    public let posts: [CalendarPost]
    public init(month: YearMonth, posts: [CalendarPost]) {
        self.month = month
        self.posts = posts
    }
}

/// 달력을 PNG로 그린다(플랫폼 구현: 앱 타깃의 SwiftUI/UIKit 렌더러). 결과는 PNG 바이트다.
public protocol CalendarImageRendering: Sendable {
    func renderPNG(of snapshot: RecordCalendarSnapshot) async throws -> Data
}

public enum CalendarImageSaveError: Error, Sendable, Equatable {
    /// 사진 추가 권한 거부 → "이미지 저장 권한이 필요해요"
    case permissionDenied
    /// 쓰기 실패 → "이미지 저장에 실패했어요"
    case failed
}

/// PNG를 사진 보관함에 저장한다(플랫폼 구현). 권한 거부는 `CalendarImageSaveError.permissionDenied`, 그 밖의 실패는 아무 오류나 던진다.
public protocol CalendarImageSaving: Sendable {
    func savePNG(_ data: Data, fileName: String) async throws
}

/// 기록 화면이 이동을 부탁하는 인터페이스(`MainShellViewModel`이 구현).
@MainActor
public protocol RecordNavigating: AnyObject {
    func openFeed(_ entry: PostDetailEntry)
    func openDisplay(date: KSTDate, sort: PostSort)
}

extension MainShellViewModel: RecordNavigating {}
