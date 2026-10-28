package com.stonefive.chalkak.ui.main

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
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
import com.stonefive.chalkak.platform.PhotoPreview
import com.stonefive.chalkak.platform.UploadPlatform
import com.stonefive.chalkak.ui.issue.IssueWebRoute
import com.stonefive.chalkak.ui.record.RecordRoute
import com.stonefive.chalkak.ui.notification.NotificationDetailRoute
import com.stonefive.chalkak.ui.notification.NotificationRoute
import com.stonefive.chalkak.ui.upload.UploadRoute
import com.stonefive.chalkak.ui.upload.UploadSuccessScreen
import com.stonefive.chalkak.viewmodel.SessionHolders
import com.stonefive.chalkak.viewmodel.rememberStateHolder
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.issue.IssueWebContent
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.feature.aireview.AiReviewStateHolder
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
import kr.chalkak.feature.record.RecordStateHolder
import kr.chalkak.feature.notification.NotificationDetailStateHolder
import kr.chalkak.feature.notification.NotificationInboxStateHolder
import kr.chalkak.feature.notification.NotificationPermissionFlow
import kr.chalkak.feature.notification.PermissionFlowOutcome
import kr.chalkak.feature.notification.PushNavigationEvent
import kotlinx.coroutines.flow.Flow
import com.stonefive.chalkak.ui.home.ActiveHomeUnread
import kr.chalkak.feature.upload.PhotoUploadStateHolder
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
 * - [newUploadHolder] / [uploadPlatform]: the upload flow (picker, camera, editor) behind the upload and success routes.
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
    /** AI feedback holder for one feed entry (one per stacked feed, finished with it); null = no AI area. */
    val newAiReviewHolder: ((scope: CoroutineScope) -> AiReviewStateHolder)? = null,
    val image: RemoteImage = { _, _ -> },
    /** Photo slot of display and feed (width given, height from the image's ratio); same type as [image]. */
    val photo: RemoteImage = image,
    val issueWeb: IssueWebContent = { _, _, _, _ -> },
    /** Built once per opened upload screen (a fresh holder each time: a finished upload holder cannot be reused). */
    val newUploadHolder: (scope: CoroutineScope, topicDate: LocalDate) -> PhotoUploadStateHolder,
    val uploadPlatform: UploadPlatform,
    val otherTab: @Composable (tab: Tab, scrollToTop: ScrollToTopSignal) -> Unit = { tab, _ -> TabPlaceholder(tab) },
    /** Record tab holder (A7); null = the record tab is still the [otherTab] placeholder. */
    val newRecordHolder: ((scope: CoroutineScope, mode: HomeMode) -> RecordStateHolder)? = null,
    /** KST today for the record calendar's today marker; always from the injected clock (TC-TIME-029). */
    val today: () -> LocalDate,
    /** Inbox list holder, built once per opened inbox screen; null = presence-only placeholder (`notifications.root`). */
    val newNotificationInboxHolder: ((scope: CoroutineScope) -> NotificationInboxStateHolder)? = null,
    /** Notification detail holder, built once per opened detail screen; null = presence-only placeholder. */
    val newNotificationDetailHolder: ((scope: CoroutineScope) -> NotificationDetailStateHolder)? = null,
    /**
     * AI feedback holder with the push entry flag (`openSheetOnEntry`); takes precedence over [newAiReviewHolder] when non-null.
     * The flag is true only for the feed that a push or an inbox row opened with `PostDetail(openAiFeedbackSheet = true)`.
     */
    val newAiReviewHolderOnEntry: ((scope: CoroutineScope, openSheetOnEntry: Boolean) -> AiReviewStateHolder)? = null,
    /** Asked once each time an authenticated home opens (`onMainEntered`); null = no OS permission prompt. */
    val notificationPermission: NotificationPermissionFlow? = null,
    /** Re-checks the unread dot of the home holder shown by this host; attached/detached by the host. */
    val homeUnread: ActiveHomeUnread? = null,
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
    /** Push taps the queue released (`PushTapQueue.events`); the host navigates. Null = no push taps. */
    pushEvents: Flow<PushNavigationEvent>? = null,
) {
    val activity = LocalActivity.current
    // The holders of a finished session are cleared with it (not kept in the Activity's store until the Activity dies).
    SessionHolders(sessionKey, isChangingConfigurations = { activity?.isChangingConfigurations == true }) {
        MainHostContent(nav, deps, showToast, onExitApp, modifier, sessionKey, pushEvents)
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
    pushEvents: Flow<PushNavigationEvent>?,
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
    // Taps the queue released (also those released before this host composed: the channel buffers them). The queue decides when.
    val latestPushEvents by rememberUpdatedState(pushEvents)
    val hasPushEvents = pushEvents != null
    LaunchedEffect(hasPushEvents, coordinator) {
        if (hasPushEvents) latestPushEvents?.collect { coordinator.onPushEvent(it) }
    }
    // The home holder lives as long as the host, so a push keeps refreshing the unread dot while the inbox covers home.
    val homeMode = navState.accessMode
    val homeHolder = rememberStateHolder("home-$sessionKey-$homeMode") { scope -> deps.newHomeHolder(scope, homeMode.toHomeMode()) }
    val homeUnread = deps.homeUnread
    DisposableEffect(homeHolder, homeUnread) {
        homeUnread?.attach(homeHolder)
        onDispose { homeUnread?.detach(homeHolder) }
    }
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
                val holder = homeHolder
                // Authenticated main opened (again): the OS permission is asked once per install; the flow itself skips guests.
                val permissionFlow = deps.notificationPermission
                LaunchedEffect(permissionFlow, homeMode) {
                    val outcome = permissionFlow?.onMainEntered(homeMode.toHomeMode())
                    if (outcome is PermissionFlowOutcome.Failed) latestToast(copy[outcome.toastCopyKey])
                }
                val refreshCount = session.homeRefresh.count
                LaunchedEffect(refreshCount) {
                    if (refreshCount != session.homeRefreshHandled) {
                        session.homeRefreshHandled = refreshCount
                        holder.onPullToRefresh()
                    }
                }
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
                    deps.newDisplayHolder(session.newDisplayScope(scope), entry.date, entry.sort)
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
            Route.TabRoot(Tab.Record) -> {
                val newHolder = deps.newRecordHolder
                if (newHolder == null) {
                    deps.otherTab(Tab.Record, idleSignal)
                } else {
                    val mode = navState.accessMode
                    val holder = rememberStateHolder("record-$sessionKey-$mode") { scope -> newHolder(scope, mode.toHomeMode()) }
                    // Home's week row asks for a day once; the route takes it when it first shows.
                    val requestedDate = remember(holder) { session.recordRequestedDate.also { session.recordRequestedDate = null } }
                    RecordRoute(
                        holder = holder,
                        image = deps.image,
                        showToast = { latestToast(it) },
                        onOpenFeed = coordinator::onRecordOpenFeed,
                        onOpenDisplay = coordinator::onRecordOpenDisplay,
                        onLoginRequired = { }, // the 401 also ends the session through AuthEvent.GoToLogin (as for feed)
                        today = deps.today,
                        requestedDate = requestedDate,
                    )
                }
            }
            is Route.TabRoot -> deps.otherTab(route.tab, idleSignal)
            Route.Notifications -> {
                val create = deps.newNotificationInboxHolder
                if (create == null) {
                    RoutePlaceholder("notifications.root")
                } else {
                    val holder = rememberStateHolder("inbox-$sessionKey-${session.inboxSerial}") { scope -> create(scope) }
                    NotificationRoute(
                        holder = holder,
                        image = deps.image,
                        showToast = { latestToast(it) },
                        onNavigate = coordinator::onNotificationNavigate,
                        onRequireLogin = {}, // AuthEvent.GoToLogin ends the session.
                        onBack = coordinator::onSystemBack,
                    )
                }
            }
            is Route.Feed -> {
                @Suppress("UNUSED_VARIABLE")
                val replaced = session.feedReplaceSerial // read only: a pushed replacement of this very route recomposes the feed
                val slot = session.feeds.slotFor(navState.stack.lastIndex, route, session.feedSeeds, session.recordSeeds)
                val holder = rememberStateHolder("feed-$sessionKey-${slot.id}") { scope -> deps.newFeedHolder(scope, slot.entry) }
                slot.holder = holder
                val aiFactory: ((CoroutineScope) -> AiReviewStateHolder)? = deps.newAiReviewHolderOnEntry?.let { create ->
                    // The push / inbox flag is taken once per feed slot (REQ-AIR-046/047); any other way into the feed has none.
                    val openSheet = slot.openAiSheet ?: (session.aiSheetOnEntry.remove(route.postId) == true).also { slot.openAiSheet = it }
                    val factory: (CoroutineScope) -> AiReviewStateHolder = { scope -> create(scope, openSheet) }
                    factory
                } ?: deps.newAiReviewHolder
                val aiHolder = aiFactory?.let { create ->
                    rememberStateHolder("ai-$sessionKey-${slot.id}") { scope -> create(scope) }
                }
                slot.aiHolder = aiHolder
                FeedRoute(
                    holder = holder,
                    remoteImage = deps.photo,
                    onBack = coordinator::onSystemBack,
                    onDeleted = coordinator::onFeedDeleted,
                    onClosed = { coordinator.onFeedClosed() },
                    onLoginRequired = coordinator::onFeedLoginRequired,
                    // Only the top route is composed: a feed under another screen must live on; its entry's removal finishes it.
                    finishOnLeave = false,
                    aiReview = aiHolder,
                )
            }
            Route.PhotoUpload -> {
                val topicDate = session.uploadTopicDate
                if (topicDate == null) {
                    LaunchedEffect(Unit) { coordinator.onSystemBack() }
                } else {
                    val holder = rememberStateHolder("upload-$sessionKey-${session.uploadSerial}") { scope -> deps.newUploadHolder(scope, topicDate) }
                    UploadRoute(
                        holder = holder,
                        platform = deps.uploadPlatform,
                        onClose = coordinator::onSystemBack,
                        onShowSuccess = { info -> coordinator.onUploadSucceeded(info, holder.state.value.photo, holder.state.value.edit) },
                        // The 401 also arrives as AuthEvent.GoToLogin (session end); what the holder kept is dropped with it.
                        onReauthRequired = holder::onSessionEnded,
                    )
                }
            }
            is Route.PhotoUploadSuccess -> {
                val result = session.uploadResult
                if (result == null) {
                    LaunchedEffect(Unit) { coordinator.onSystemBack() }
                } else {
                    val platform = deps.uploadPlatform
                    val preview by produceState<PhotoPreview?>(null, result) { value = result.photo?.let { platform.previews.load(it) } }
                    val photoContent: (@Composable (Modifier) -> Unit)? = result.photo?.let { photo ->
                        { m -> platform.editPainter.Preview(photo, result.edit, m) }
                    }
                    UploadSuccessScreen(
                        info = result.info,
                        preview = preview,
                        onConfirm = coordinator::onUploadSuccessConfirmed,
                        edit = result.edit,
                        photoContent = photoContent,
                    )
                }
            }
            is Route.NotificationDetail -> {
                val create = deps.newNotificationDetailHolder
                if (create == null) {
                    RoutePlaceholder("notification-detail.root")
                } else {
                    val holder = rememberStateHolder("notification-detail-$sessionKey-${route.notificationId}-${session.notificationDetailSerial}") { scope ->
                        create(scope)
                    }
                    NotificationDetailRoute(
                        holder = holder,
                        notificationId = route.notificationId,
                        inboxIsBelow = navState.stack.dropLast(1).contains(Route.Notifications),
                        image = deps.image,
                        showToast = { latestToast(it) },
                        onClose = coordinator::onSystemBack,
                        onOpenInbox = coordinator::onOpenInboxInsteadOfDetail,
                        // The inbox reloads silently whenever it is shown again, which is when it is next seen.
                        onInvalidateInbox = {},
                        onRequireLogin = {}, // AuthEvent.GoToLogin ends the session.
                    )
                }
            }
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
