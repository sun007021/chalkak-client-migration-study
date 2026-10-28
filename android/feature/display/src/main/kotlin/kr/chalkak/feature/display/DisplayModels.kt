package kr.chalkak.feature.display

import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.Topic
import java.time.LocalDate

enum class DisplayStatus { Loading, Content, Empty, Error }

/**
 * Everything the exhibition tab renders. [photos] / [featured] already carry the shared like values
 * (merged through [LikeController]) and exclude removed posts ([PostChanges]).
 */
data class DisplayUiState(
    /** Shown date (the date the user moved to; unchanged until that date loaded). */
    val date: LocalDate,
    /** `AppConstants.FIRST_TOPIC_DATE`; never changed by a 404 (D-12). */
    val earliestDate: LocalDate,
    /** KST today as of the last [DisplayStateHolder.onScreenShown] / load. */
    val latestDate: LocalDate,
    val topic: Topic?,
    /** Selected sort of today's exhibition (restored when coming back to today). Archive ignores it and uses POPULAR. */
    val sort: PostSort,
    val status: DisplayStatus,
    /** `display.error` or `common.error.network` while [status] is Error, else null. */
    val errorCopyKey: String?,
    /** "다시 시도" visible: Error status only (not for Empty). */
    val showRetry: Boolean,
    /** [date] is before [latestDate]: popular only, no sort tabs, top-5 carousel. */
    val isArchive: Boolean,
    /** `[RECENT, POPULAR, RANDOM]` for today, empty in archive. */
    val sortOptions: List<PostSort>,
    /** `display.header.desc-latest` / `display.header.desc-archive`. */
    val descriptionKey: String,
    /** "M월 d일" from the response `topicDate` text (D-09), independent of the device time zone. */
    val dateLabel: String?,
    val photos: List<PostSummary>,
    /** Archive only: the first 5 photos of the popular list. */
    val featured: List<PostSummary>,
    val featuredPage: Int,
    val hasNext: Boolean,
    /** Seed of the random sort kept for page 2+ and revalidation; null for other sorts. */
    val randomSeed: String?,
    /** First page is being revalidated while old photos stay visible (sort change, tab re-select, return). */
    val isRefreshing: Boolean,
    val isPaging: Boolean,
    /** False while the first load is running (Loading) and at [earliestDate]. */
    val canGoPrevious: Boolean,
    /** False while the first load is running and at [latestDate]. */
    val canGoNext: Boolean,
    val toast: ToastMessage?,
)

sealed interface DisplayEffect {
    /** Open the post detail seeded with the list item (D-05: never emitted for guests). */
    data class OpenFeed(val post: PostSummary) : DisplayEffect
}
