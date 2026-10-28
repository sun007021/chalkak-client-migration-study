import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("NAV·HOME·BANR 문구가 shared/copy/ko.json과 같다")
struct NavHomeCopyTests {
    @Test("TC-NAV-023 게스트 제한 6종 토스트 문구가 ko.json 키와 정확히 같다", arguments: [
        ("nav.guest.record", NavCopy.guestRecord),
        ("nav.guest.upload", NavCopy.guestUpload),
        ("nav.guest.feed", NavCopy.guestFeed),
        ("nav.guest.like", NavCopy.guestLike),
        ("nav.guest.notification", NavCopy.guestNotification),
        ("nav.guest.feedback", NavCopy.guestFeedback),
    ])
    func guestToasts(key: String, actual: String) throws {
        #expect(!actual.isEmpty)
        #expect(try SharedCopy.require(key) == actual)
    }

    @Test("탭 라벨·업로드 접근성 이름·삭제 토스트가 ko.json과 같다")
    func tabsAndDeleted() throws {
        for tab in MainTab.allCases {
            #expect(try SharedCopy.require("nav.tab.\(tab.rawValue)") == NavCopy.label(for: tab))
        }
        #expect(MainTab.allCases == [.home, .display, .record, .settings])
        #expect(try SharedCopy.require("nav.tab.upload.a11y") == NavCopy.uploadAccessibilityLabel)
        #expect(try SharedCopy.require("nav.post-deleted") == NavCopy.postDeleted)
    }

    @Test("탭의 분석 destination은 home·display·record·settings다")
    func analyticsDestinations() {
        #expect(MainTab.allCases.map(\.analyticsDestination) == [.home, .display, .record, .settings])
    }

    @Test("TC-HOME-053 홈 고정 문구가 ko.json과 같다", arguments: [
        ("home.topic.loading", HomeCopy.topicLoading),
        ("home.topic.error", HomeCopy.topicError),
        ("home.topic.not-ready", HomeCopy.topicNotReady),
        ("home.hero.no-open-topic", HomeCopy.heroNoOpenTopic),
        ("home.hero.processing", HomeCopy.heroProcessing),
        ("home.hero.pending-badge", HomeCopy.heroPendingBadge),
        ("home.hero.error", HomeCopy.heroError),
        ("home.hero.banned", HomeCopy.heroBanned),
        ("home.hero.retry", HomeCopy.retry),
        ("home.weekly.title", HomeCopy.weeklyTitle),
        ("home.weekly.more", HomeCopy.weeklyMore),
        ("home.weekly.pending", HomeCopy.weeklyPending),
        ("home.weekly.error", HomeCopy.weeklyError),
        ("home.ranking.yesterday-title", HomeCopy.rankingYesterdayTitle),
        ("home.ranking.today-title", HomeCopy.rankingTodayTitle),
        ("home.ranking.empty", HomeCopy.rankingEmpty),
        ("home.banner.title", HomeCopy.issueTitle),
        ("home.banner.error", HomeCopy.issueError),
        ("home.guest.upload", HomeCopy.guestUpload),
        ("home.guest.feed", HomeCopy.guestFeed),
        ("home.guest.like", HomeCopy.guestLike),
        ("home.guest.notification", HomeCopy.guestNotification),
    ])
    func homeFixedCopy(key: String, actual: String) throws {
        #expect(!actual.isEmpty)
        #expect(try SharedCopy.require(key) == actual)
    }

    @Test("TC-HOME-053 치환 문구: 날짜 머리글, 공유하지 않았어요(제목 없으면 오늘의 주제), 랭킹 오류")
    func templates() throws {
        let header = try SharedCopy.require("home.topic.header")
        #expect(HomeCopy.topicHeader(KSTDate(year: 2026, month: 10, day: 27)!) == header.replacingOccurrences(of: "{M월 d일}", with: "10월 27일"))
        #expect(HomeCopy.topicHeader(KSTDate(year: 2026, month: 1, day: 5)!) == header.replacingOccurrences(of: "{M월 d일}", with: "1월 5일"))

        let empty = try SharedCopy.require("home.hero.empty")
        #expect(HomeCopy.heroEmpty(topicTitle: "가을 하늘") == empty.replacingOccurrences(of: "{주제}", with: "가을 하늘"))
        #expect(HomeCopy.heroEmpty(topicTitle: nil) == empty.replacingOccurrences(of: "{주제}", with: "오늘의 주제"))
        #expect(HomeCopy.heroEmpty(topicTitle: "") == empty.replacingOccurrences(of: "{주제}", with: "오늘의 주제"))

        let error = try SharedCopy.require("home.ranking.error")
        #expect(HomeCopy.rankingError(sectionTitle: HomeCopy.rankingYesterdayTitle) == error.replacingOccurrences(of: "{섹션 제목}", with: "어제 랭킹"))
        #expect(HomeCopy.rankingError(sectionTitle: HomeCopy.rankingYesterdayTitle) == "어제 랭킹 사진을 불러오지 못했어요")
    }

    @Test("요일 라벨은 일월화수목금토다")
    func weekdayLabels() {
        #expect(HomeCopy.weekdayLabels == ["일", "월", "화", "수", "목", "금", "토"])
    }

    @Test("TC-BANR-023 배너 웹뷰 문구가 ko.json과 같다", arguments: [
        ("banner.web.link-unavailable", BannerCopy.linkUnavailable),
        ("banner.web.load-error", BannerCopy.loadError),
        ("banner.web.retry", BannerCopy.retry),
        ("banner.web.no-browser", BannerCopy.noBrowser),
        ("banner.web.open-failed", BannerCopy.openFailed),
    ])
    func bannerWebCopy(key: String, actual: String) throws {
        #expect(!actual.isEmpty)
        #expect(try SharedCopy.require(key) == actual)
    }
}
