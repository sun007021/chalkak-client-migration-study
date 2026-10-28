import Foundation
import ChalkakCore

/// 기록 탭 문구. 값은 `shared/copy/ko.json`의 `record.*`와 같아야 한다(`SharedCopy` 대조 테스트).
public enum RecordCopy {
    /// 요일 머리글(일요일 시작, 한 글자씩)
    public static let weekdayLabels: [String] = ["일", "월", "화", "수", "목", "금", "토"]
    public static let pickerTitle = "날짜 선택"
    public static let pendingBadge = "사진 반영 중"
    public static let pendingTooltip = "사진을 반영하고 있어요.\n표시되기까지 조금 시간이 걸릴 수도 있어요!"
    public static let pendingHintOpen = "자세한 안내 보기"
    public static let pendingHintClose = "자세한 안내 닫기"
    public static let actionFeed = "피드에서 보기"
    public static let actionDisplay = "전시 보러가기"
    public static let save = "이미지로 저장"
    public static let saveOK = "달력을 이미지로 저장했어요"
    public static let saveFail = "이미지 저장에 실패했어요"
    public static let saveDenied = "이미지 저장 권한이 필요해요"
    public static let guest = "기록을 보려면 로그인이 필요해요"
    public static let errorUnauthorized = "로그인이 필요해요"
    public static let errorInvalidMonth = "조회할 수 없는 연월이에요"
    public static let errorOther = "기록을 불러오지 못했어요"
    public static let loginButton = "로그인 하기"
    public static let retryButton = "다시 시도"

    /// 저장 파일 이름 `chalkak-calendar-{yyyy-MM}.png` (REQ-REC-037).
    public static func calendarFileName(for month: YearMonth) -> String {
        "chalkak-calendar-\(pad(month.year, 4))-\(pad(month.month, 2)).png"
    }

    private static func pad(_ value: Int, _ width: Int) -> String {
        let text = String(value)
        return String(repeating: "0", count: max(0, width - text.count)) + text
    }
}
