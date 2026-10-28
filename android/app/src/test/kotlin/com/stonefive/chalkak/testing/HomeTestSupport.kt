package com.stonefive.chalkak.testing

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.home.testing.FakeBannerRepository
import kr.chalkak.core.data.home.testing.FakeHomeRepository
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.LikeToggler
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

val DAY_27: LocalDate = LocalDate.of(2026, 10, 27)

/** `22222222-2222-4222-8222-222222222<suffix>`: the post ids of the shared home/feed fixtures. */
fun postId(suffix: String) = "22222222-2222-4222-8222-222222222$suffix"

/** An analytics sink that drops everything (the navigation controller is the only sender in the app, D-22). */
object NoAnalytics : AnalyticsTracker {
    override fun screenView(screen: String) = Unit
}

/** Fakes preloaded with the Tuesday 2026-10-27 fixtures (their defaults); [setup] swaps handlers before the first load. */
class HomeFakes {
    val home = FakeHomeRepository()
    val banners = FakeBannerRepository()

    fun holder(scope: kotlinx.coroutines.CoroutineScope, mode: HomeMode, likes: LikeToggler = LikeToggler { _, _, _ -> }) =
        HomeStateHolder(scope, FakeClock(), home, banners, likes, NoAnalytics, mode)
}

/**
 * The real [HomeStateHolder] over fixture-backed fakes, loaded once on virtual time: the state the screen would be given.
 * (Screens are stateless; this keeps the state shapes honest instead of hand-building them.)
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
fun loadedHomeState(mode: HomeMode = HomeMode.Member, setup: HomeFakes.() -> Unit = {}): HomeUiState {
    var result: HomeUiState? = null
    runTest {
        val fakes = HomeFakes().apply(setup)
        val holder = fakes.holder(CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob()), mode)
        holder.onShown()
        advanceUntilIdle()
        result = holder.state.value
    }
    return result!!
}

fun HomeFakes.todayFixture(name: String) {
    home.todayHandler = { HomeFixtureModels.ok(HomeFixtureModels.today("home/posts-today__$name.json")) }
}

fun HomeFakes.todayFailure(name: String) {
    home.todayHandler = { HomeFixtureModels.failure("home/posts-today__$name.json") }
}

/** [RemoteImage] stand-in: records every requested url (null = fallback requested) and draws a tiny box. */
class RecordingImage {
    val urls = CopyOnWriteArrayList<String?>()

    val slot: @Composable (String?, Modifier) -> Unit = { url, modifier ->
        urls += url
        Box(modifier.size(8.dp).testTag("test.image"))
    }
}
