package com.stonefive.chalkak.ui.main

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.display.DisplayRoute
import com.stonefive.chalkak.ui.feed.FeedRoute
import com.stonefive.chalkak.ui.home.HomeRoute
import com.stonefive.chalkak.ui.issue.IssueWebRoute
import com.stonefive.chalkak.viewmodel.SessionHolders
import com.stonefive.chalkak.viewmodel.rememberStateHolder
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.issue.IssueWebContent
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.upload.UploadGateEffect

/**
 * Upload entry gate port: the host calls it once per accepted upload-button tap (`GET /posts/today` lives behind it). The answer is
 * the upload feature's [UploadGateEffect]: `Open` lets the upload screen open, `Toast` is shown (REQ-UPL-003/004/007), `LoginRequired`
 * (a 401 that survived the refresh) is handled by the auth event that the network layer sends. Either way the controller is told that
 * the gate finished.
 */
fun interface UploadEntryGate {
    suspend fun enter(): UploadGateEffect
}

/** "Scroll the visible list of this tab to the top" request: every [request] increments [count]; the tab content scrolls on a change. */
class ScrollToTopSignal {
    var count: Int by mutableIntStateOf(0)
        private set

    fun request() {
        count++
    }
}

/** Tab content of the tabs this PR does not build (record, settings): a box tagged `<tab>.root`. */
@Composable
fun TabPlaceholder(tab: Tab, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().testTag("${tab.analyticsName}.root"), contentAlignment = Alignment.Center) {
        Text(text = LocalCopy.current[tab.labelCopyKey], style = MaterialTheme.typography.titleMedium)
    }
}

/** Presence-only stand-in for a screen a later PR builds. */
@Composable
private fun RoutePlaceholder(tag: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().testTag(tag))
}

/**
 * Everything [MainHost] needs from the app. Factories/ports so JVM tests inject fakes.
 *
 * - [newHomeHolder]: built once per home screen with the holder scope. The home holder's `LikeToggler` is a `LikeControllerToggler(likes)`.
 * - [likes] / [postChanges]: shared like state; the APP resets both on account switch (logout, login as another user).
 * - [newDisplayHolder] / [newFeedHolder]: display and feed holders, kept in the session's ViewModel store (a new login gets new ones).
 * - [otherTab]: content of record / settings (default [TabPlaceholder]); gets the tab's [ScrollToTopSignal].
 * - [issueWeb]: the WebView adapter slot for the banner web screen.
 */
class MainDependencies(
    val newHomeHolder: (scope: CoroutineScope, mode: HomeMode) -> HomeStateHolder,
    val likes: LikeController,
    val postChanges: PostChanges,
    val uploadGate: UploadEntryGate,
    val issueOpener: ExternalLinkOpener,
    /** Display tab holder; the owner's scope, the date and sort the tab must open with (null = today, default sort). */
    val newDisplayHolder: (scope: CoroutineScope, date: LocalDate?, sort: PostSort?) -> DisplayStateHolder,
    /** Post detail holder for one feed entry. */
    val newFeedHolder: (scope: CoroutineScope, entry: FeedEntry) -> FeedStateHolder,
    val image: RemoteImage = { _, _ -> },
    /** Photo slot of display and feed (width given, height from the image's ratio); same type as [image]. */
    val photo: RemoteImage = image,
    val issueWeb: IssueWebContent = { _, _, _, _ -> },
    val otherTab: @Composable (tab: Tab, scrollToTop: ScrollToTopSignal) -> Unit = { tab, _ -> TabPlaceholder(tab) },
)

/**
 * Main area host (everything behind the boot gate except login / sign-up screens): collects `nav.state`, renders [MainShell] and lets
 * [MainCoordinator] execute every `NavOutcome` and home effect. System back goes to `nav.onSystemBack()`; `ExitApp` calls [onExitApp].
 * Screens other than home, display, feed and the banner web page are presence-only placeholders until their PRs land.
 *
 * [sessionKey] changes when a new login starts (see `RootSession`), so a new account never sees the previous account's home holder.
 * The host never sends analytics itself.
 */
@Composable
fun MainHost(
    nav: NavigationController,
    deps: MainDependencies,
    showToast: (String) -> Unit,
    onExitApp: () -> Unit,
    modifier: Modifier = Modifier,
    sessionKey: Int = 0,
) {
    val activity = LocalActivity.current
    // The holders of a finished session are cleared with it (not kept in the Activity's store until the Activity dies).
    SessionHolders(sessionKey, isChangingConfigurations = { activity?.isChangingConfigurations == true }) {
        MainHostContent(nav, deps, showToast, onExitApp, modifier, sessionKey)
    }
}

@Composable
private fun MainHostContent(
    nav: NavigationController,
    deps: MainDependencies,
    showToast: (String) -> Unit,
    onExitApp: () -> Unit,
    modifier: Modifier,
    sessionKey: Int,
) {
    val copy = LocalCopy.current
    val navState by nav.state.collectAsState()
    val session = rememberStateHolder("main-$sessionKey") { scope -> MainSession(scope) }
    val latestToast by rememberUpdatedState(showToast)
    val latestExit by rememberUpdatedState(onExitApp)
    val coordinator = remember(nav, deps, session, copy) {
        MainCoordinator(nav, deps, session, copy, showToast = { latestToast(it) }, exitApp = { latestExit() })
    }
    LaunchedEffect(navState.stack) { session.feeds.retain(navState.stack) }
    val homeList = rememberLazyListState()
    val idleSignal = remember { ScrollToTopSignal() }

    BackHandler(onBack = coordinator::onSystemBack)
    val homeScrollCount = session.homeScroll.count
    LaunchedEffect(homeScrollCount) {
        if (homeScrollCount != session.homeScrollHandled) {
            session.homeScrollHandled = homeScrollCount
            homeList.animateScrollToItem(0)
        }
    }

    MainShell(navState, onTabClick = coordinator::onTabClick, onUploadClick = coordinator::onUploadClick, modifier = modifier) { route ->
        when (route) {
            Route.TabRoot(Tab.Home) -> {
                val mode = navState.accessMode
                val holder = rememberStateHolder("home-$sessionKey-$mode") { scope -> deps.newHomeHolder(scope, mode.toHomeMode()) }
                HomeRoute(
                    holder = holder,
                    likes = deps.likes,
                    postChanges = deps.postChanges,
                    listState = homeList,
                    image = deps.image,
                    showToast = { latestToast(it) },
                    onEffect = coordinator::onHomeEffect,
                    onWeekMore = coordinator::onWeekMore,
                )
            }
            Route.TabRoot(Tab.Display) -> {
                val entry = session.displayEntry
                val holder = rememberStateHolder("display-$sessionKey-${entry.seq}") { scope ->
                    deps.newDisplayHolder(scope, entry.date, entry.sort)
                }
                // Upload success asks for its topic date through the controller; the route applies it once, then it is consumed.
                val requestedDate = navState.displayDateRequest
                DisplayRoute(
                    holder = holder,
                    remoteImage = deps.photo,
                    onOpenFeed = coordinator::onDisplayOpenFeed,
                    requestedDate = requestedDate,
                    scrollToTopCount = session.displayScroll.count,
                )
                LaunchedEffect(requestedDate) { if (requestedDate != null) nav.consumeDisplayDateRequest() }
            }
            is Route.TabRoot -> deps.otherTab(route.tab, idleSignal)
            Route.Notifications -> RoutePlaceholder("notifications.root")
            is Route.Feed -> {
                val slot = session.feeds.slotFor(navState.stack.lastIndex, route, session.feedSeeds)
                val holder = rememberStateHolder("feed-$sessionKey-${slot.id}") { scope -> deps.newFeedHolder(scope, slot.entry) }
                slot.holder = holder
                FeedRoute(
                    holder = holder,
                    remoteImage = deps.photo,
                    onBack = coordinator::onSystemBack,
                    onDeleted = coordinator::onFeedDeleted,
                    onClosed = { coordinator.onFeedClosed() },
                    onLoginRequired = coordinator::onFeedLoginRequired,
                    // Only the top route is composed: a feed under another screen must live on; its entry's removal finishes it.
                    finishOnLeave = false,
                )
            }
            Route.PhotoUpload -> RoutePlaceholder("upload.root")
            is Route.PhotoUploadSuccess -> RoutePlaceholder("upload-success.root")
            is Route.NotificationDetail -> RoutePlaceholder("notification-detail.root")
            Route.Feedback -> RoutePlaceholder("feedback.root")
            Route.BannerWeb -> {
                val banner = session.issueBanner
                if (banner == null) {
                    LaunchedEffect(Unit) { coordinator.onSystemBack() }
                } else {
                    IssueWebRoute(
                        banner = banner,
                        opener = deps.issueOpener,
                        showToast = { latestToast(it) },
                        onBack = coordinator::onSystemBack,
                        web = deps.issueWeb,
                    )
                }
            }
            else -> Unit
        }
    }
}

private fun AccessMode.toHomeMode(): HomeMode = when (this) {
    AccessMode.Member -> HomeMode.Member
    AccessMode.Guest -> HomeMode.Guest
}
