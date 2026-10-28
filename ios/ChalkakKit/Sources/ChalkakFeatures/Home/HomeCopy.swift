import Foundation
import ChalkakCore

/// 홈 문구. 값은 `shared/copy/ko.json`의 `home.*`와 같아야 한다(`SharedCopy` 대조 테스트).
public enum HomeCopy {
    /// "{M월 d일} · 오늘의 주제" (KST 날짜, 기기 시간대 무관)
    public static func topicHeader(_ date: KSTDate) -> String { "\(KST.monthDayLabel(date)) · 오늘의 주제" }
    public static let topicLoading = "오늘의 주제를 불러오는 중"
    public static let topicError = "오늘의 주제를 불러오지 못했어요"
    public static let topicNotReady = "오늘의 주제가 아직 준비되지 않았어요"
    public static let heroNoOpenTopic = "지금은 참여할 수 있는 주제가 없어요"
    /// `"{주제}" 사진을 공유하지 않았어요`. 제목이 비면 "오늘의 주제".
    public static func heroEmpty(topicTitle: String?) -> String {
        let title = topicTitle.flatMap { $0.isEmpty ? nil : $0 } ?? "오늘의 주제"
        return "\"\(title)\" 사진을 공유하지 않았어요"
    }
    public static let heroProcessing = "사진을 처리하고 있어요"
    public static let heroPendingBadge = "검수 대기"
    public static let heroError = "사진 상태를 불러오지 못했어요"
    public static let heroBanned = "이용이 정지되어 게시물을 작성할 수 없어요."
    public static let retry = "다시 시도"
    public static let weeklyTitle = "이번 주 기록"
    public static let weeklyMore = "보러가기"
    public static let weeklyPending = "대기"
    public static let weeklyError = "기록을 불러오지 못했어요"
    public static let rankingYesterdayTitle = "어제 랭킹"
    public static let rankingTodayTitle = "오늘 인기있는 사진"
    public static let rankingEmpty = "아직 올라온 사진이 없어요"
    /// "{섹션 제목} 사진을 불러오지 못했어요"
    public static func rankingError(sectionTitle: String) -> String { "\(sectionTitle) 사진을 불러오지 못했어요" }
    public static let issueTitle = "ISSUE"
    public static let issueError = "ISSUE를 불러오지 못했어요. 다시 시도"
    public static let guestUpload = "게시물을 추가하려면 로그인이 필요해요"
    public static let guestFeed = "게시물 피드를 보려면 로그인이 필요해요"
    public static let guestLike = "좋아요를 누르려면 로그인이 필요해요"
    public static let guestNotification = "로그인 후 알림을 확인할 수 있어요"
    /// 일~토 요일 라벨
    public static let weekdayLabels: [String] = ["일", "월", "화", "수", "목", "금", "토"]
}

/// 배너 웹뷰 문구. 값은 `shared/copy/ko.json`의 `banner.web.*`와 같아야 한다.
public enum BannerCopy {
    public static let linkUnavailable = "링크를 열 수 없어요"
    public static let loadError = "페이지를 불러오지 못했어요"
    public static let retry = "다시 시도"
    public static let noBrowser = "링크를 열 수 있는 브라우저가 없어요"
    public static let openFailed = "브라우저에서 링크를 열지 못했어요"
}
