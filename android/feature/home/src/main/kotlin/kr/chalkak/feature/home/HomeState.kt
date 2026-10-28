package kr.chalkak.feature.home

import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate

/** Header above the hero: "{M월 d일} · 오늘의 주제" + title (REQ-HOME-004/005). */
sealed interface TopicHeader {
    data object Loading : TopicHeader

    /** [dateLabel] is the already-formatted KST label, e.g. "10월 27일 · 오늘의 주제". */
    data class Ready(val dateLabel: String, val title: String) : TopicHeader

    /** `GET /topics` 404: "오늘의 주제가 아직 준비되지 않았어요" (not an error). */
    data object NotReady : TopicHeader

    /** Any other failure: "오늘의 주제를 불러오지 못했어요". */
    data object Error : TopicHeader
}

/** The 7 hero states of D-06. */
sealed interface HeroState {
    data object Loading : HeroState
    data object NoOpenTopic : HeroState

    /** isPosted=false, 403 ([banned]=true) and guests. The UI shows `"{주제}" 사진을 공유하지 않았어요` using [TopicHeader]. */
    data class Empty(val banned: Boolean = false) : HeroState

    /** VALIDATING. */
    data object Processing : HeroState

    /** PENDING (badge) or APPROVED. [thumbnailUrl] comes from the calendar entry with the same postId, null when unavailable. */
    data class Photo(
        val postId: String,
        val topicDate: LocalDate,
        val thumbnailUrl: String?,
        val status: ModerationStatus,
    ) : HeroState {
        val pendingBadge: Boolean get() = status == ModerationStatus.PENDING
    }

    /** [network] true = connection failure -> "네트워크 연결을 확인해 주세요." instead of the hero error text. */
    data class Error(val network: Boolean = false) : HeroState
}

/** Common state of week / ranking sections. An empty [Ready] list is the "empty" state. */
sealed interface Section<out T> {
    data object Loading : Section<Nothing>
    data class Ready<T>(val value: T) : Section<T>
    data class Error(val network: Boolean = false) : Section<Nothing>
}

/** One of the 7 cells of "이번 주 기록". [entry] is null for days without an APPROVED/PENDING record. */
data class WeekDay(val date: LocalDate, val weekdayLabel: String, val entry: CalendarEntry?)

/** ISSUE section (banner list with paging). */
sealed interface IssueState {
    data object Loading : IssueState

    /** Successful but 0 banners: the section is hidden (REQ-BANR-005). */
    data object Hidden : IssueState

    /** First load failed (REQ-BANR-006). */
    data object Error : IssueState

    /**
     * [nextPage] is the page number the next prefetch will request. [loadingMore] blocks duplicate requests.
     * [hasNext] false = no more requests until a refresh.
     */
    data class Ready(
        val banners: List<Banner>,
        val hasNext: Boolean,
        val nextPage: Int = 2,
        val loadingMore: Boolean = false,
    ) : IssueState
}

data class HomeUiState(
    val mode: HomeMode,
    /** KST date of the last (re)load; null before the first one. */
    val loadedDate: LocalDate? = null,
    val topic: TopicHeader = TopicHeader.Loading,
    val hero: HeroState = HeroState.Loading,
    val week: Section<List<WeekDay>> = Section.Loading,
    val yesterday: Section<List<HomePost>> = Section.Loading,
    val popular: Section<List<HomePost>> = Section.Loading,
    val issue: IssueState = IssueState.Loading,
    val hasUnread: Boolean = false,
    /** Pull-to-refresh indicator only. Silent refreshes (resume / foreground) never set it. */
    val refreshing: Boolean = false,
) {
    /**
     * AI feedback card (REQ-HOME-034): hero is an APPROVED photo whose topicDate is [loadedDate] (KST today).
     * Never for PENDING/VALIDATING/Empty/NoOpenTopic/guest/past topic. (The card's own polling lives in the AIR area.)
     */
    val aiCardVisible: Boolean
        get() {
            val photo = hero as? HeroState.Photo ?: return false
            return mode == HomeMode.Member && photo.status == ModerationStatus.APPROVED && photo.topicDate == loadedDate
        }
}

enum class RankingKind { Yesterday, Today }

/** One-shot UI events. Toast text is a `shared/copy/ko.json` key; every occurrence is a new object (same text twice still shows, D-20). */
sealed interface HomeEffect {
    data class ShowToast(val id: Long, val copyKey: String) : HomeEffect
    /** Hero Empty tapped by a member who may upload (REQ-HOME-009). */
    data object OpenUpload : HomeEffect
    /** Post detail. [seed] is the list item so the detail shows the image before its response (D-04); null for the hero. */
    data class OpenFeed(val postId: String, val seed: HomePost? = null) : HomeEffect
    /** Display tab opened on [date] sorted by popularity (REQ-HOME-031). */
    data class OpenDisplay(val date: LocalDate) : HomeEffect
    /** Record tab with [date] selected (REQ-HOME-023). */
    data class OpenRecord(val date: LocalDate) : HomeEffect
    data object OpenNotifications : HomeEffect
    /** Banner web view titled "ISSUE". */
    data class OpenIssue(val banner: Banner) : HomeEffect
}

object HomeCopyKeys {
    const val GUEST_UPLOAD = "home.guest.upload"
    const val GUEST_FEED = "home.guest.feed"
    const val GUEST_LIKE = "home.guest.like"
    const val GUEST_NOTIFICATION = "home.guest.notification"
    const val HERO_BANNED = "home.hero.banned"
    const val TOPIC_HEADER = "home.topic.header"
    const val COMMON_NETWORK = "common.error.network"
    const val COMMON_GENERIC = "common.error.generic"
    const val BANNER_LINK_INVALID = "banner.link-invalid"
    const val BANNER_NO_BROWSER = "banner.no-browser"
    const val BANNER_OPEN_FAILED = "banner.open-failed"
}

/** Receives unexpected exceptions (bugs, not API failures) that a load turned into an error state, with where they happened. */
fun interface HomeDiagnostics {
    fun unexpected(where: String, error: Throwable)

    companion object {
        val Ignore = HomeDiagnostics { _, _ -> }
    }
}
