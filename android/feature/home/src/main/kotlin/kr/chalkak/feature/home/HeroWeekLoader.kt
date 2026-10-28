package kr.chalkak.feature.home

import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kr.chalkak.core.common.Week
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/** Hero (`posts/today`) and "이번 주 기록" (calendar of every month of the week); the hero thumbnail comes from the calendar. */
internal class HeroWeekLoader(private val core: HomeCore, private val home: HomeRepository) {

    /** All months of the week must succeed; the first failure is reported and nothing partial is used. */
    suspend fun fetchCalendar(week: Week): ApiResult<List<CalendarEntry>> = coroutineScope {
        val results = week.months.map { month -> async { core.guarded { home.calendar(month) } } }.awaitAll()
        results.filterIsInstance<ApiResult.Failure>().firstOrNull()
            ?: ApiResult.Success(results.filterIsInstance<ApiResult.Success<List<CalendarEntry>>>().flatMap { it.value })
    }

    /** Calendar entries currently shown in the week (a hero retry does not ask the calendar again). */
    fun shownEntries(): List<CalendarEntry>? =
        (core.state.value.week as? Section.Ready)?.value?.mapNotNull { it.entry }

    /** [entries] supplies the calendar used for the photo thumbnail; it is only awaited for photo states. */
    suspend fun loadHero(batch: Batch, entries: suspend () -> List<CalendarEntry>?) =
        core.section("hero", { error -> core.update(batch) { it.copy(hero = heroAfterFailure(batch, it.hero, error)) } }) {
            fetchHero(batch, entries)
        }

    suspend fun loadWeek(batch: Batch, week: Week, calendar: Deferred<ApiResult<List<CalendarEntry>>>?) =
        core.section("week", { error -> core.update(batch) { it.copy(week = sectionAfterFailure(batch, it.week, error)) } }) {
            fetchWeek(batch, week, calendar)
        }

    private suspend fun fetchHero(batch: Batch, entries: suspend () -> List<CalendarEntry>?) {
        if (!core.member) return core.update(batch) { it.copy(hero = HeroState.Empty()) }
        when (val result = core.guarded { home.today() }) {
            is ApiResult.Success -> {
                val calendar = if (result.value.postId != null) entries() else null
                core.update(batch) { it.copy(hero = heroOf(result.value) { postId -> thumbnailFor(postId, calendar, it.hero) }) }
            }
            is ApiResult.Failure -> if (!result.error.isCancelled()) {
                core.update(batch) { it.copy(hero = heroAfterFailure(batch, it.hero, result.error)) }
            }
        }
    }

    private suspend fun fetchWeek(batch: Batch, week: Week, calendar: Deferred<ApiResult<List<CalendarEntry>>>?) {
        if (calendar == null) return core.update(batch) { it.copy(week = Section.Ready(weekDays(week, emptyList()))) }
        when (val result = calendar.await()) {
            is ApiResult.Success -> {
                core.update(batch) { it.copy(week = Section.Ready(weekDays(week, result.value))) }
                fillHeroThumbnail(batch, result.value)
            }
            is ApiResult.Failure -> if (!result.error.isCancelled()) {
                core.update(batch) { it.copy(week = sectionAfterFailure(batch, it.week, result.error)) }
            }
        }
    }

    /** The calendar's thumbnail, or the one already shown for the same post (a failed calendar refresh must not blank it). */
    private fun thumbnailFor(postId: String, calendar: List<CalendarEntry>?, shown: HeroState): String? =
        calendar?.firstOrNull { it.postId == postId }?.thumbnailImageUrl
            ?: (shown as? HeroState.Photo)?.takeIf { it.postId == postId }?.thumbnailUrl

    private fun heroAfterFailure(batch: Batch, shown: HeroState, error: ApiError): HeroState {
        val failed = heroOfFailure(error)
        val hasContent = shown != HeroState.Loading && shown !is HeroState.Error
        return if (failed is HeroState.Error && batch.keepContent && hasContent) {
            batch.noteFailure(error)
            shown
        } else {
            failed
        }
    }

    /** Fill the thumbnail of an already shown photo once the week's calendar arrives later than the hero. */
    private fun fillHeroThumbnail(batch: Batch, entries: List<CalendarEntry>) = core.update(batch) {
        val photo = it.hero as? HeroState.Photo
        val thumbnail = photo?.let { p -> thumbnailFor(p.postId, entries, p) }
        if (photo != null && photo.thumbnailUrl == null && thumbnail != null) it.copy(hero = photo.copy(thumbnailUrl = thumbnail)) else it
    }
}

internal fun ApiResult<List<CalendarEntry>>.entriesOrNull(): List<CalendarEntry>? = (this as? ApiResult.Success)?.value
