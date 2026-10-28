package kr.chalkak.feature.home

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.home.testing.FakeBannerRepository
import kr.chalkak.core.data.home.testing.FakeHomeRepository
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

/** Runs on the test scheduler (so runCurrent / advanceUntilIdle drive it) but counts as foreground work. */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] eagerly for the rest of the test so no emission is missed. */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

class RecordingLikeToggler : LikeToggler {
    val calls = CopyOnWriteArrayList<Pair<String, Boolean>>()
    override suspend fun toggle(postId: String, currentlyLiked: Boolean) { calls += postId to currentlyLiked }
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

class Rig(
    val holder: HomeStateHolder,
    val home: FakeHomeRepository,
    val banners: FakeBannerRepository,
    val likes: RecordingLikeToggler,
    val analytics: RecordingAnalytics,
    val clock: FakeClock,
    val states: List<HomeUiState>,
    val effects: List<HomeEffect>,
) {
    val s: HomeUiState get() = holder.state.value
    val toasts: List<String> get() = effects.filterIsInstance<HomeEffect.ShowToast>().map { it.copyKey }
    val nonToastEffects: List<HomeEffect> get() = effects.filterNot { it is HomeEffect.ShowToast }
}

/** Fresh fakes + holder. Nothing is loaded yet: set handlers first, then [show]. Default clock = FIXTURE_NOW (2026-10-27 12:00 KST). */
fun TestScope.rig(
    mode: HomeMode = HomeMode.Member,
    clock: FakeClock = FakeClock(),
    diagnostics: HomeDiagnostics = HomeDiagnostics.Ignore,
): Rig {
    val home = FakeHomeRepository()
    val banners = FakeBannerRepository()
    val likes = RecordingLikeToggler()
    val analytics = RecordingAnalytics()
    val holder = HomeStateHolder(holderScope(), clock, home, banners, likes, analytics, mode, diagnostics)
    return Rig(holder, home, banners, likes, analytics, clock, collectAll(holder.state), collectAll(holder.effects))
}

/** First presentation of the screen, then let every pending request finish (virtual time only). */
fun TestScope.show(r: Rig) {
    r.holder.onShown()
    advanceUntilIdle()
}

fun <T> ok(value: T): ApiResult<T> = ApiResult.Success(value)

val T26: LocalDate = LocalDate.of(2026, 10, 26)
val T27: LocalDate = LocalDate.of(2026, 10, 27)
val T28: LocalDate = LocalDate.of(2026, 10, 28)

fun todayFx(name: String) = HomeFixtureModels.today("home/posts-today__$name.json")
