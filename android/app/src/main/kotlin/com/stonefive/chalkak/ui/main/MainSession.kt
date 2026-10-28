package com.stonefive.chalkak.ui.main

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import java.time.LocalDate

/**
 * What the main area keeps across configuration changes (held by `rememberStateHolder`, so it lives in a ViewModel): the scope the
 * upload gate runs in (a rotation must not cancel a gate the controller still counts as running), the "scroll to top" requests,
 * the banner whose web page is open, the display entry requested from home and the feed holders of the stacked feed routes.
 */
class MainSession(val scope: CoroutineScope) {
    val homeScroll = ScrollToTopSignal()
    val displayScroll = ScrollToTopSignal()

    /** Last home-scroll request that the home list already acted on. */
    var homeScrollHandled: Int = 0

    /** Banner of the last `HomeEffect.OpenIssue`; the `BannerWeb` route shows it. */
    var issueBanner: Banner? = null

    /**
     * How the display tab must open. Home's section "더보기" (REQ-HOME-031) asks for a date in popular order; each such request gets
     * a new [DisplayEntry.seq], which gives the display tab a fresh holder (the navigation controller's own `displayDateRequest`
     * is only set by the upload success flow, which `MainHost` forwards to the running holder).
     */
    var displayEntry: DisplayEntry by mutableStateOf(DisplayEntry(0, null, null))

    private var displayJob: Job? = null

    /**
     * Scope for a new display holder, as a child of [parent] (the holder's ViewModel scope). The previous display holder's child scope
     * is cancelled: each "더보기" request builds a new holder, and the old one (replaced for good) must stop collecting shared state.
     */
    fun newDisplayScope(parent: CoroutineScope): CoroutineScope {
        displayJob?.cancel()
        val job = SupervisorJob(parent.coroutineContext[Job])
        displayJob = job
        return CoroutineScope(parent.coroutineContext + job)
    }

    /** List items handed over by the screen that opens a feed, by post id; taken when the feed route first shows (D-26). */
    val feedSeeds = HashMap<String, PostSummary>()

    val feeds = FeedSlots()
}

class DisplayEntry(val seq: Int, val date: LocalDate?, val sort: PostSort?)

/** One stacked `Route.Feed`: its identity (holder key), the entry it was opened with and the holder once composed. */
class FeedSlot(val id: Int, val route: Route.Feed, val entry: FeedEntry) {
    var holder: FeedStateHolder? = null
}

/**
 * Feed holders by position in the navigation stack. `MainHost` composes only the top route, so a feed under another stacked
 * screen leaves the composition without being closed; its holder is finished here, when the entry is gone from the stack.
 */
class FeedSlots {
    private var nextId = 0
    private val slots = HashMap<Int, FeedSlot>()

    /** The slot of the feed at stack [index]; created (seed taken from [seeds]) when none matches [route]. */
    fun slotFor(index: Int, route: Route.Feed, seeds: MutableMap<String, PostSummary>): FeedSlot {
        slots[index]?.takeIf { it.route == route }?.let { return it }
        slots.remove(index)?.finish()
        val seed = if (route.source == FeedSource.Display) seeds[route.postId] else null
        seeds.remove(route.postId)
        val entry = if (seed != null) FeedEntry.FromDisplay(seed) else FeedEntry.FromPush(route.postId)
        return FeedSlot(nextId++, route, entry).also { slots[index] = it }
    }

    /** Finishes the holders of feed entries that are no longer in [stack] (popped, replaced, session ended). */
    fun retain(stack: List<Route>) {
        val gone = slots.filter { (index, slot) -> stack.getOrNull(index) != slot.route }
        gone.forEach { (index, slot) ->
            slots.remove(index)
            slot.finish()
        }
    }

    private fun FeedSlot.finish() = holder?.onCleared()
}
