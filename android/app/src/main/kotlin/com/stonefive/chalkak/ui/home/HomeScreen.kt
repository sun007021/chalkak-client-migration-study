package com.stonefive.chalkak.ui.home

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.RankingKind
import java.time.LocalDate

/** Loads a remote image; a null [url] (unusable server value) draws the fallback image. Real adapter lives in the app container. */
typealias RemoteImage = @Composable (url: String?, modifier: Modifier) -> Unit

/** Every user action of the home screen. All default to no-ops so a test sets only what it observes. */
class HomeCallbacks(
    val onNotificationClick: () -> Unit = {},
    val onHeroClick: () -> Unit = {},
    val onHeroRetry: () -> Unit = {},
    val onWeekDayClick: (LocalDate) -> Unit = {},
    val onWeekMoreClick: () -> Unit = {},
    val onWeekRetry: () -> Unit = {},
    val onRankingPostClick: (HomePost) -> Unit = {},
    val onRankingMoreClick: (RankingKind) -> Unit = {},
    val onRankingRetry: (RankingKind) -> Unit = {},
    val onLikeClick: (HomePost) -> Unit = {},
    val onBannerClick: (Banner) -> Unit = {},
    val onBannerScrolled: (lastVisibleIndex: Int) -> Unit = {},
    val onIssueRetry: () -> Unit = {},
    val onRefresh: () -> Unit = {},
)

/**
 * Stateless home screen. STUB (TDD step 1): renders nothing yet.
 *
 * Required behaviour (testids.md "홈", TC-HOME-*, TC-BANR-007/010/029):
 * - root `home.root`; one scroll container `home.scroll` (the [listState] scrolls it; pull down on it -> `onRefresh`);
 *   `home.refresh-indicator` exists only while `state.refreshing`; content stays visible while refreshing.
 * - bell `home.notification-button` (-> onNotificationClick); `home.notification-unread-dot` exists only when `state.hasUnread`.
 * - topic: `home.topic-date` = `TopicHeader.Ready.dateLabel`, `home.topic-title` = title. For other topic states `home.topic-title`
 *   carries the message: Loading `home.topic.loading`, NotReady `home.topic.not-ready`, Error `home.topic.error`.
 * - hero (one of, tag -> text): Loading `home.hero-loading` = `home.topic.loading`; NoOpenTopic `home.hero-no-open-topic`
 *   = `home.hero.no-open-topic` (no retry, no upload button); Empty (also banned and guest) `home.hero-empty` = `home.hero.empty`
 *   with `{주제}` = topic title (fallback `오늘의 주제` when the title is unavailable) plus `home.hero-upload-button` (-> onHeroClick);
 *   Processing `home.hero-processing` = `home.hero.processing`; Photo `home.hero-photo` (click -> onHeroClick; image = thumbnailUrl
 *   through [image], null url = fallback) and `home.hero-pending-badge` = `home.hero.pending-badge` only when PENDING;
 *   Error `home.hero-error` = `home.hero.error` (network -> `common.error.network`) plus `home.hero-retry-button` = `home.hero.retry` (-> onHeroRetry).
 * - AI card: container `home.ai-card` only when `state.aiCardVisible`, content from [aiCard].
 * - week: `home.week-section` (title `home.weekly.title`, more link `home.weekly.more` -> onWeekMoreClick), `home.week-count` = "N/7"
 *   (days with an entry), seven `home.week-day-{yyyy-mm-dd}` cells showing the weekday label and day of month, `home.week-photo-{date}`
 *   only for days with an entry (PENDING cells also show `home.weekly.pending`); a cell with an entry -> onWeekDayClick(date).
 *   Error: `home.week-error` = `home.weekly.error` + `home.week-retry-button` (-> onWeekRetry).
 * - yesterday ranking: `home.ranking-section` (title `home.ranking.yesterday-title`), `home.ranking-more-link` (-> onRankingMoreClick(Yesterday)),
 *   items `home.ranking-item-{postId}` (-> onRankingPostClick(post)), `home.ranking-like-button-{postId}` (selected = isLiked, -> onLikeClick(post)),
 *   `home.ranking-like-count-{postId}` = likeCount; empty `home.ranking-empty` = `home.ranking.empty`; error `home.ranking-error`
 *   = `home.ranking.error` with the section title + `home.ranking-retry-button` (-> onRankingRetry(Yesterday)).
 *   Today ("오늘 인기있는 사진") is the same with prefix `home.popular-` (`home.popular-section`, `-more-link`, `-item-`, `-like-button-`,
 *   `-like-count-`, `-empty`, `-error`, `-retry-button`).
 * - ISSUE: `home.issue-section` (title `home.banner.title`) with one `home.issue-item-{bannerId}` per banner (title + subtitle text,
 *   thumbnail through [image], click -> onBannerClick). Hidden and Loading: no section. Error: `home.issue-error` = `home.banner.error`
 *   + `home.issue-retry-button` (-> onIssueRetry), still no `home.issue-section`. The last visible banner index is reported to onBannerScrolled.
 */
@Composable
fun HomeScreen(
    state: HomeUiState,
    callbacks: HomeCallbacks,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    image: RemoteImage = { _, _ -> },
    aiCard: @Composable () -> Unit = {},
) {
}
