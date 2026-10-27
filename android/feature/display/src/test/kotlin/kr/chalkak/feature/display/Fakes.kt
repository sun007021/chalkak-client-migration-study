package kr.chalkak.feature.display

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.PostsQuery
import kr.chalkak.core.data.post.testing.FakeLikeServer
import kr.chalkak.core.data.post.testing.FakePostRepository
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.USER_A_ID
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

/** Collects the `screen_view` names sent through [AnalyticsTracker]. */
internal class RecordingAnalytics(private val failure: RuntimeException? = null) : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()

    override fun screenView(screen: String) {
        screens += screen
        failure?.let { throw it }
    }
}

internal val TODAY: LocalDate = LocalDate.of(2026, 10, 27)
internal val YESTERDAY: LocalDate = LocalDate.of(2026, 10, 26)

/**
 * Scope for the holders under test: runs on the test scheduler (so `runCurrent`/`advanceUntilIdle`/`advanceTimeBy`
 * drive it) but, unlike `backgroundScope`, counts as foreground work.
 */
internal fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no StateFlow emission is conflated away). */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

internal fun q(date: LocalDate, sort: PostSort, page: Int = 1, seed: String? = null) = PostsQuery(date, sort, page, seed)

internal val List<PostSummary>.ids: List<String> get() = map { it.id }

/** Ids of the fixture page, in server order. */
internal fun fixtureIds(path: String): List<String> = PostFixtures.page(path).posts.ids

internal class DisplayRig(
    val t: TestScope,
    val holder: DisplayStateHolder,
    val repo: FakePostRepository,
    val likes: LikeController,
    val changes: PostChanges,
    val user: FakeUser,
    val clock: FakeClock,
    val server: FakeLikeServer,
    val effects: MutableList<DisplayEffect>,
    val states: MutableList<DisplayUiState>,
    val analytics: RecordingAnalytics,
) {
    val s: DisplayUiState get() = holder.state.value

    /** Shows the screen and lets everything finish. */
    fun show() {
        holder.onScreenShown()
        t.advanceUntilIdle()
    }

    fun idle() = t.advanceUntilIdle()

    /** Toast messages in the order they appeared in the state. */
    fun toasts(): List<ToastMessage> = states.mapNotNull { it.toast }.distinct()

    fun photo(idSuffix: String) = s.photos.first { it.id.endsWith(idSuffix) }
}

/**
 * [auto] answers every date with a generated topic and every query with the matching fixture page; scripted replies
 * (queued / sticky) take priority. The like server counts start at [likeCount] for every post.
 */
internal fun TestScope.displayRig(
    now: String? = null,
    userId: String? = USER_A_ID,
    initialDate: LocalDate? = null,
    initialSort: PostSort? = null,
    auto: Boolean = true,
    likeCount: Int = 38,
    analytics: RecordingAnalytics = RecordingAnalytics(),
): DisplayRig {
    val clock = FakeClock().also { c -> now?.let { c.set(it) } }
    val repo = FakePostRepository().also { if (auto) it.autoRespond() }
    val server = FakeLikeServer(initialLiked = false, initialCount = likeCount)
    repo.likeHandler = { put, id -> server.handle(put, id) }
    val user = FakeUser(userId)
    val changes = PostChanges()
    val likes = LikeController(holderScope(), repo, { user.id != null }, changes)
    val holder = DisplayStateHolder(holderScope(), repo, likes, changes, user, KstCalendar(clock), analytics, initialDate, initialSort)
    return DisplayRig(this, holder, repo, likes, changes, user, clock, server, collectAll(holder.effects), collectAll(holder.state), analytics)
}

internal class FeedRig(
    val t: TestScope,
    val holder: FeedStateHolder,
    val repo: FakePostRepository,
    val likes: LikeController,
    val changes: PostChanges,
    val user: FakeUser,
    val clock: FakeClock,
    val server: FakeLikeServer,
    val effects: MutableList<FeedEffect>,
    val states: MutableList<FeedUiState>,
    val analytics: RecordingAnalytics,
) {
    val s: FeedUiState get() = holder.state.value

    fun show() {
        holder.onScreenShown()
        t.advanceUntilIdle()
    }

    fun idle() = t.advanceUntilIdle()

    fun toasts(): List<ToastMessage> = states.mapNotNull { it.toast }.distinct()
}

internal fun TestScope.feedRig(
    entry: FeedEntry,
    userId: String? = USER_A_ID,
    now: String? = null,
    likeCount: Int = 10,
    analytics: RecordingAnalytics = RecordingAnalytics(),
): FeedRig {
    val clock = FakeClock().also { c -> now?.let { c.set(it) } }
    val repo = FakePostRepository()
    val server = FakeLikeServer(initialLiked = false, initialCount = likeCount)
    repo.likeHandler = { put, id -> server.handle(put, id) }
    val user = FakeUser(userId)
    val changes = PostChanges()
    val likes = LikeController(holderScope(), repo, { user.id != null }, changes)
    val holder = FeedStateHolder(holderScope(), repo, likes, changes, user, KstCalendar(clock), analytics, entry)
    return FeedRig(this, holder, repo, likes, changes, user, clock, server, collectAll(holder.effects), collectAll(holder.state), analytics)
}
