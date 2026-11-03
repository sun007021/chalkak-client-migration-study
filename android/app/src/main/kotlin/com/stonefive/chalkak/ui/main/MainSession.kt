package com.stonefive.chalkak.ui.main

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.stonefive.chalkak.ui.upload.UploadResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import java.time.LocalDate

/**
 * What the main area keeps across configuration changes (held by `rememberStateHolder`, so it lives in a ViewModel): the scope the
 * upload gate runs in (a rotation must not cancel a gate the controller still counts as running), the "scroll to top" requests,
 * the banner whose web page is open, the display entry requested from home, the feed holders of the stacked feed routes and the
 * upload visit (topic date, serial, result for the success screen).
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

    /** Thumbnail seeds of feeds opened from the record tab ("피드에서 보기"), by post id; taken like [feedSeeds]. */
    val recordSeeds = HashMap<String, FeedEntry.FromRecord>()

    /** Day the home week row asked the record tab to select; consumed once by the record route (REQ-REC-025). */
    var recordRequestedDate: LocalDate? = null

    val feeds = FeedSlots()

    /**
     * "Open the AI sheet on entry" by post id, set right before a push or an inbox row opens that post's detail and taken (once) when
     * the feed route first shows. A side table because the route itself (`Route.Feed`) is the navigation module's and has no such flag.
     */
    val aiSheetOnEntry = HashMap<String, Boolean>()

    /** "Refresh the home screen" requests (push on the visible home); the home route acts on a change. */
    val homeRefresh = ScrollToTopSignal()
    var homeRefreshHandled: Int = 0

    /**
     * Bumped when a push replaces the feed that is on top by an equal route: the navigation state does not change (an equal `NavState`
     * is not re-published), so the feed route reads this to recompose and take its fresh slot.
     */
    var feedReplaceSerial: Int by mutableStateOf(0)

    /** Bumped when a push replaces the notification detail / inbox that is on top: the screen gets a fresh holder and loads again. */
    var notificationDetailSerial: Int by mutableStateOf(0)
    var inboxSerial: Int by mutableStateOf(0)

    /** `topicDate` the upload gate opened the upload screen for (pinned for the whole visit, REQ-UPL-008). */
    var uploadTopicDate: LocalDate? = null

    /** Counts opened upload screens: each visit gets its own holder (a finished one cannot be reused). */
    var uploadSerial: Int = 0

    /** What the success screen shows; set when the submit succeeded. */
    var uploadResult: UploadResult? = null

    /** Counts opened feedback screens: each visit gets a fresh holder (empty input, no old error). */
    var feedbackSerial: Int = 0

    /** Counts opened change-signature visits: each one gets a fresh drawing pad (REQ-SIGN-011). */
    var changeSerial: Int = 0

    /** Counts previews of the current visit: each preview gets a fresh upload holder (a failed one keeps its error). */
    var changePreviewSerial: Int = 0

    /** PNG the pad produced for the change-signature preview. */
    var changePng: ByteArray? = null

    /** Address of the legal document the last settings row asked for; the document sheet loads it. */
    var documentUrl: String? = null
}

class DisplayEntry(val seq: Int, val date: LocalDate?, val sort: PostSort?)

/** One stacked `Route.Feed`: its identity (holder key), the entry it was opened with and the holder once composed. */
class FeedSlot(val id: Int, val route: Route.Feed, val entry: FeedEntry) {
    var holder: FeedStateHolder? = null

    /** `openSheetOnEntry` of this feed's AI holder; decided when the slot first shows (null before). */
    var openAiSheet: Boolean? = null

    /** AI feedback holder of this feed (null without an AI area); finished together with [holder]. */
    var aiHolder: AiReviewStateHolder? = null
}

/**
 * Feed holders by position in the navigation stack. `MainHost` composes only the top route, so a feed under another stacked
 * screen leaves the composition without being closed; its holder is finished here, when the entry is gone from the stack.
 */
class FeedSlots {
    private var nextId = 0
    private val slots = HashMap<Int, FeedSlot>()

    /** The slot of the feed at stack [index]; created (seed taken from [seeds]) when none matches [route]. */
    fun slotFor(
        index: Int,
        route: Route.Feed,
        seeds: MutableMap<String, PostSummary>,
        recordSeeds: MutableMap<String, FeedEntry.FromRecord> = HashMap(),
    ): FeedSlot {
        slots[index]?.takeIf { it.route == route }?.let { return it }
        slots.remove(index)?.finish()
        val seed = if (route.source == FeedSource.Display) seeds[route.postId] else null
        seeds.remove(route.postId)
        val recordSeed = if (route.source == FeedSource.ById) recordSeeds[route.postId] else null
        recordSeeds.remove(route.postId)
        val entry = when {
            seed != null -> FeedEntry.FromDisplay(seed)
            recordSeed != null -> recordSeed
            else -> FeedEntry.FromPush(route.postId)
        }
        return FeedSlot(nextId++, route, entry).also { slots[index] = it }
    }

    /** Forgets the slot at [index] (its holders are finished): the next [slotFor] there builds a fresh one even for an equal route. */
    fun invalidate(index: Int) {
        slots.remove(index)?.finish()
    }

    /** Finishes the holders of feed entries that are no longer in [stack] (popped, replaced, session ended). */
    fun retain(stack: List<Route>) {
        val gone = slots.filter { (index, slot) -> stack.getOrNull(index) != slot.route }
        gone.forEach { (index, slot) ->
            slots.remove(index)
            slot.finish()
        }
    }

    private fun FeedSlot.finish() {
        holder?.onCleared()
        aiHolder?.onCleared()
    }
}
