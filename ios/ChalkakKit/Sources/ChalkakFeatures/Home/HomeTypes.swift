import Foundation
import ChalkakCore
import ChalkakData

/// 홈 섹션(섹션별 다시 시도·테스트 식별자 단위). `topic` 머리글은 오늘 인기 섹션과 함께 불러오고 함께 다시 시도한다.
public enum HomeSection: String, Sendable, Equatable, CaseIterable {
    /// 히어로 (`home.hero-*`)
    case hero
    /// 이번 주 기록 (`home.week-*`)
    case week
    /// 어제 랭킹 (`home.ranking-*`)
    case ranking
    /// 오늘 인기있는 사진 (`home.popular-*`)
    case popular
    /// ISSUE 배너 (`home.issue-*`)
    case issue
}

/// 섹션 하나의 상태. `failed`는 사용자에게 보일 문구를 담는다(ViewModel이 `HomeCopy`에서 고른다).
public enum SectionState<Value: Sendable & Equatable>: Sendable, Equatable {
    case loading
    case ready(Value)
    case failed(String)
}

/// 오늘 주제 머리글 (`home.topic-date`, `home.topic-title`).
public enum TopicHeaderState: Sendable, Equatable {
    case loading
    /// `dateLabel` = "10월 27일 · 오늘의 주제"
    case ready(dateLabel: String, title: String)
    /// 주제 404 → "오늘의 주제가 아직 준비되지 않았어요"
    case notReady
    /// 그 밖의 실패 → "오늘의 주제를 불러오지 못했어요"
    case failed

    var isReady: Bool {
        if case .ready = self { true } else { false }
    }
}

/// 히어로 카드 상태(D-06). 썸네일은 이번 주 기록 응답의 같은 postId에서 찾고 없으면 nil(대체 배경)이다.
public enum HeroState: Sendable, Equatable {
    case loading
    case noOpenTopic
    /// `banned == true`(403)이면 모양은 같지만 업로드 진입 시 정지 안내를 보인다.
    case empty(banned: Bool)
    case processing
    case photo(postId: UUID, thumbnailURL: URL?, isPending: Bool)
    case error
}

/// 이번 주 기록 한 칸(일~토).
public struct WeekDay: Sendable, Equatable {
    public var date: KSTDate
    /// "일"~"토"
    public var weekdayLabel: String
    /// 기록이 없는 칸은 nil
    public var post: CalendarPost?
    public init(date: KSTDate, weekdayLabel: String, post: CalendarPost?) {
        self.date = date
        self.weekdayLabel = weekdayLabel
        self.post = post
    }
}

public struct WeekRecord: Sendable, Equatable {
    /// 항상 7칸(일~토)
    public var days: [WeekDay]
    public init(days: [WeekDay]) { self.days = days }
    /// 사진이 있는 날 수
    public var recordedCount: Int { days.filter { $0.post != nil }.count }
    /// "N/7"
    public var countLabel: String { "\(recordedCount)/\(days.count)" }
}

/// 홈 데이터를 불러오는 저장소 묶음.
public struct HomeRepositories: Sendable {
    public var topics: any TopicRepository
    public var posts: any PostRepository
    public var today: any TodayPostRepository
    public var calendar: any CalendarRepository
    public var banners: any BannerRepository
    public var unread: any UnreadStatusRepository

    public init(
        topics: any TopicRepository, posts: any PostRepository, today: any TodayPostRepository,
        calendar: any CalendarRepository, banners: any BannerRepository, unread: any UnreadStatusRepository
    ) {
        self.topics = topics
        self.posts = posts
        self.today = today
        self.calendar = calendar
        self.banners = banners
        self.unread = unread
    }
}
