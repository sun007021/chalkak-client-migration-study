package com.stonefive.chalkak.testing

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.platform.PhotoPreviewLoader
import com.stonefive.chalkak.platform.UploadPlatform
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import com.stonefive.chalkak.ui.main.MainDependencies
import com.stonefive.chalkak.ui.main.MainHost
import com.stonefive.chalkak.ui.main.TabPlaceholder
import com.stonefive.chalkak.ui.main.UploadEntryGate
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kr.chalkak.core.common.testing.FakeMonotonicClock
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.core.data.post.testing.FakeLikeServer
import kr.chalkak.core.data.post.testing.FakePostRepository
import kr.chalkak.feature.home.BrowserOpenResult
import kr.chalkak.feature.home.ExternalBrowser
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.LikeControllerToggler
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.core.data.record.testing.FakeRecordRepository
import kr.chalkak.feature.record.RecordStateHolder
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList
import kr.chalkak.feature.upload.UploadGateEffect

/** Upload gate stand-in: counts `GET /posts/today` runs, optionally held on [hold]. */
class RecordingUploadGate(var result: UploadGateEffect = Open, var hold: CompletableDeferred<Unit>? = null) : UploadEntryGate {
    var calls = 0
    override suspend fun enter(): UploadGateEffect {
        calls++
        hold?.await()
        return result
    }

    companion object {
        val Open = UploadGateEffect.Open(LocalDate.of(2026, 10, 28))
    }
}

class RecordingBrowser(var result: BrowserOpenResult = BrowserOpenResult.Opened) : ExternalBrowser {
    val opened = CopyOnWriteArrayList<String>()
    override fun open(url: String): BrowserOpenResult {
        opened += url
        return result
    }
}

/**
 * [MainHost] over a real [NavigationController], real [HomeStateHolder][kr.chalkak.feature.home.HomeStateHolder], real [LikeController]
 * and fixture-backed fakes at the ports. Toasts go through the real `ToastLayer`, so tests read `toast.message` like a user would.
 */
class MainRig(val mode: AccessMode = AccessMode.Member) {
    val analytics = RecordingAnalytics()
    val nav = NavigationController(analytics, mode).also { it.start() }
    val fakes = HomeFakes()
    val posts = FakePostRepository()
    val likeServer = FakeLikeServer(initialLiked = false, initialCount = 10)
    val changes = PostChanges()
    val gate = RecordingUploadGate()
    val browser = RecordingBrowser()
    val holderScope = HolderScope()
    val likes = LikeController(holderScope.scope, posts, { mode == AccessMode.Member }, changes)

    val otherTabsComposed = CopyOnWriteArrayList<Tab>()
    var exits = 0
    var toast by mutableStateOf<ToastUi?>(null)
    private var toastIds = 0L
    val shownToasts = CopyOnWriteArrayList<String>()
    val images = RecordingImage()

    /** Display / feed side: fixture-answered post list and detail endpoints, the signed-in user and a fixed KST day. */
    val user = FakeUser(if (mode == AccessMode.Member) USER_A_ID else null)
    val postClock = FakeClock()
    val postAnalytics = RecordingAnalytics()

    /** Record tab (A7): fixture-answered calendar endpoints and the stand-ins for the PNG renderer / MediaStore writer. */
    val recordRepo = FakeRecordRepository()
    val recordRenderer = RecordingCalendarRenderer()
    val recordSaver = RecordingCalendarSaver()

    /** Every display holder / feed entry the host asked for, in order (a holder per request, not per recomposition). */
    val displayRequests = CopyOnWriteArrayList<Pair<LocalDate?, PostSort?>>()
    val feedEntries = CopyOnWriteArrayList<FeedEntry>()

    // Upload flow: the real holder over fakes; the system picker / camera stand-in, editor session and edit painter are scripted here.
    val uploadAcquirer = FakePhotoAcquirer()
    val uploadCodec = FakeUploadCodec()
    val uploadEditSource = FakeEditSource()
    val uploadPainter = RecordingEditPainter()
    val uploadPlatform = UploadPlatform(uploadAcquirer, PhotoPreviewLoader { previewOf() }, uploadEditSource, uploadPainter)

    /** AI feedback side: scripted repository and every holder the host asked for (one per stacked feed). */
    val aiRepo = FakeAiReviewRepository()
    val aiHolders = CopyOnWriteArrayList<AiReviewStateHolder>()

    init {
        posts.autoRespond()
        posts.likeHandler = { put, id -> likeServer.handle(put, id) }
    }

    fun close() = holderScope.close()

    fun deps() = MainDependencies(
        newHomeHolder = { scope, homeMode -> fakes.holder(scope, homeMode, LikeControllerToggler(likes)) },
        likes = likes,
        postChanges = changes,
        uploadGate = gate,
        issueOpener = ExternalLinkOpener(browser),
        newUploadHolder = { scope, topicDate -> fakeUploadHolder(scope, uploadCodec, topicDate) },
        uploadPlatform = uploadPlatform,
        image = images.slot,
        newDisplayHolder = { scope, date, sort ->
            displayRequests += date to sort
            DisplayStateHolder(scope, posts, likes, changes, user, KstCalendar(postClock), postAnalytics, date, sort)
        },
        newFeedHolder = { scope, entry ->
            feedEntries += entry
            FeedStateHolder(scope, posts, likes, changes, user, KstCalendar(postClock), postAnalytics, entry)
        },
        newAiReviewHolder = { scope ->
            AiReviewStateHolder(scope, aiRepo, user, KstCalendar(postClock), FakeMonotonicClock()).also { aiHolders += it }
        },
        otherTab = { tab, _ ->
            otherTabsComposed += tab
            TabPlaceholder(tab)
        },
        newRecordHolder = { scope, recordMode ->
            RecordStateHolder(scope, postClock, recordRepo, changes, NoAnalytics, recordMode, recordRenderer, recordSaver)
        },
    )

    @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
    @Composable
    fun Content(copy: Copy) {
        TestApp(copy) {
            Box(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                MainHost(
                    nav = nav,
                    deps = deps(),
                    showToast = {
                        shownToasts += it
                        toast = ToastUi(++toastIds, it)
                    },
                    onExitApp = { exits++ },
                )
                ToastLayer(toast = toast, onExpired = { id -> if (toast?.id == id) toast = null })
            }
        }
    }

    fun launch(rule: ComposeContentTestRule, copy: Copy) {
        rule.setContent { Content(copy) }
        rule.waitForIdle()
    }
}

/** Waits (real time, idling the main looper in between) until a node with [tag] is in the tree. */
fun ComposeContentTestRule.awaitTag(tag: String, timeoutMs: Long = 2_000) {
    waitUntil(timeoutMs) { onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
}

fun ComposeContentTestRule.hasNode(tag: String): Boolean = onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
