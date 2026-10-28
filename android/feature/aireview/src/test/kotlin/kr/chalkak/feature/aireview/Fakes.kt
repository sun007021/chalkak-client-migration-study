package kr.chalkak.feature.aireview

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kr.chalkak.core.network.ApiResult
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

internal val TODAY: LocalDate = LocalDate.of(2026, 10, 27)
internal val YESTERDAY: LocalDate = LocalDate.of(2026, 10, 26)
internal const val POST = AiReviews.POST_ID
internal const val OTHER_POST = "22222222-2222-4222-8222-222222222202"

/** Fake clock instants around KST midnight of 2026-10-27 (UTC+9). */
internal const val KST_2359_59 = "2026-10-27T14:59:59Z"
internal const val KST_MIDNIGHT = "2026-10-27T15:00:00Z"

/**
 * Scope for the holders under test: runs on the test scheduler (so `runCurrent`/`advanceTimeBy` drive it) but, unlike
 * `backgroundScope`, counts as foreground work. Intervals are `delay`s, so no test ever sleeps.
 */
internal fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no StateFlow emission is conflated away). */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

/** Moves virtual time by [ms] and runs everything due at the new instant (advanceTimeBy alone stops just before it). */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun TestScope.elapse(ms: Long) {
    advanceTimeBy(ms)
    runCurrent()
}

/** The holder under test plus everything a test scripts or inspects. [clock] is the KST "today" source. */
internal class Env(
    val test: TestScope,
    val repo: FakeAiReviewRepository,
    val clock: FakeClock,
    val user: FakeUser,
    val holder: AiReviewStateHolder,
) {
    val state: AiReviewUiState get() = holder.state.value
    val pill: AiPill get() = state.pill
    val sheet: AiSheet? get() = state.sheet

    /** Virtual time in ms since the test started. */
    val now: Long get() = test.testScheduler.currentTime

    fun target(postId: String = POST, topicDate: LocalDate = TODAY) = AiReviewTarget(postId, topicDate)

    /** Host flow of a detail screen: target known, screen visible. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun enter(postId: String = POST, topicDate: LocalDate = TODAY) {
        holder.setTarget(target(postId, topicDate))
        holder.onScreenShown()
        test.runCurrent()
    }

    fun elapse(ms: Long) = test.elapse(ms)

    @OptIn(ExperimentalCoroutinesApi::class)
    fun settle() = test.runCurrent()

    fun leave() {
        holder.onScreenHidden()
        settle()
    }

    fun reenter() {
        holder.onScreenShown()
        settle()
    }

    /** Tap the pill, confirm the start sheet. */
    fun requestNow() {
        holder.onPillClicked()
        holder.onStartConfirmed()
        settle()
    }
}

internal fun TestScope.env(
    userId: String? = USER_A_ID,
    refreshCompletedOnShow: Boolean = true,
    openSheetOnEntry: Boolean = false,
    script: FakeAiReviewRepository.() -> Unit = {},
): Env {
    val repo = FakeAiReviewRepository().apply {
        timeSource = { testScheduler.currentTime }
        script()
    }
    val clock = FakeClock()
    val user = FakeUser(userId)
    val holder = AiReviewStateHolder(
        scope = holderScope(),
        repository = repo,
        user = user,
        calendar = KstCalendar(clock),
        windowClock = MonotonicClock { testScheduler.currentTime * 1_000_000L },
        refreshCompletedOnShow = refreshCompletedOnShow,
        openSheetOnEntry = openSheetOnEntry,
    )
    return Env(this, repo, clock, user, holder)
}

internal fun ok(review: AiReview): ApiResult<AiReview> = ApiResult.Success(review)
