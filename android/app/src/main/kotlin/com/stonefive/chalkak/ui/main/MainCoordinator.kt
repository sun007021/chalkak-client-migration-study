package com.stonefive.chalkak.ui.main

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.ui.upload.UploadResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.home.HomeEffect
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavOutcome
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.OpenVia
import kr.chalkak.feature.navigation.RouteRules
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import java.time.LocalDate
import kr.chalkak.feature.notification.NavCommand
import kr.chalkak.feature.notification.NavMode
import kr.chalkak.feature.notification.NotificationDestination
import kr.chalkak.feature.notification.PushNavigationEvent
import kr.chalkak.feature.upload.UploadCopyKeys
import kr.chalkak.feature.upload.SuccessInfo
import kr.chalkak.feature.upload.UploadGateEffect
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.PickedPhoto

/**
 * Executes what the main area's inputs ask for and what the [NavigationController] answers: toasts for blocked guest actions, the
 * upload entry gate, scroll-to-top requests, home effects and system back. The composables only forward events here.
 *
 * Analytics are never sent from here: the controller owns `screen_view` / `bottom_navigation_selected` (D-22).
 */
class MainCoordinator(
    private val nav: NavigationController,
    private val deps: MainDependencies,
    private val session: MainSession,
    private val copy: Copy,
    private val showToast: (String) -> Unit,
    private val exitApp: () -> Unit,
) {
    /** Bottom bar tab tap. Re-selecting home scrolls home to the top (TC-NAV-009) although the controller answers Ignored for it. */
    fun onTabClick(tab: Tab) {
        val wasOnHome = nav.top == Route.TabRoot(Tab.Home)
        when (val outcome = nav.onTabSelected(tab)) {
            is NavOutcome.Blocked -> showToast(copy[outcome.copyKey])
            is NavOutcome.ScrollToTop -> if (outcome.tab == Tab.Display) session.displayScroll.request()
            NavOutcome.Ignored -> if (tab == Tab.Home && wasOnHome) session.homeScroll.request()
            else -> Unit
        }
    }

    /** Upload button / hero upload: at most one `deps.uploadGate.enter()` runs at a time (the controller ignores taps meanwhile). */
    fun onUploadClick() {
        when (val outcome = nav.onUploadButton()) {
            is NavOutcome.Blocked -> showToast(copy[outcome.copyKey])
            NavOutcome.StartUploadGate -> session.scope.launch {
                val effect = try {
                    deps.uploadGate.enter()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    UploadGateEffect.Toast(0, UploadCopyKeys.GATE_CHECK_FAILED)
                }
                if (effect is UploadGateEffect.Toast) showToast(copy[effect.copyKey])
                if (effect is UploadGateEffect.Open) {
                    session.uploadTopicDate = effect.topicDate
                    session.uploadSerial++
                }
                // LoginRequired: the 401 also arrives as AuthEvent.GoToLogin, which ends the session (the controller then drops this result).
                nav.onUploadGateFinished(effect is UploadGateEffect.Open)
            }
            else -> Unit
        }
    }

    /** The upload holder reported a created post: the upload route is replaced by the success route (REQ-NAV-037). */
    fun onUploadSucceeded(info: SuccessInfo, photo: PickedPhoto?, edit: PhotoEdit) {
        session.uploadResult = UploadResult(info, photo, edit)
        nav.onUploadSubmitted(info.topicDate)
    }

    /** "확인했어요.": the display tab of the uploaded date; upload and success screens are gone (REQ-NAV-038). */
    fun onUploadSuccessConfirmed() {
        nav.onUploadSuccessConfirmed()
        session.uploadResult = null
    }

    fun onSystemBack() {
        if (nav.onSystemBack() == NavOutcome.ExitApp) exitApp()
    }

    fun onHomeEffect(effect: HomeEffect) {
        when (effect) {
            is HomeEffect.ShowToast -> showToast(copy[effect.copyKey])
            HomeEffect.OpenUpload -> onUploadClick()
            is HomeEffect.OpenFeed -> {
                val seed = effect.seed
                if (seed != null) session.feedSeeds[effect.postId] = seed.toSeed()
                open(Route.Feed(effect.postId, if (seed != null) FeedSource.Display else FeedSource.ById))
            }
            // REQ-HOME-031: the section's date, most popular first. The tab itself is selected like a bottom bar tap.
            is HomeEffect.OpenDisplay -> {
                session.displayEntry = DisplayEntry(session.displayEntry.seq + 1, effect.date, PostSort.POPULAR)
                onTabClick(Tab.Display)
            }
            is HomeEffect.OpenRecord -> {
                session.recordRequestedDate = effect.date
                onTabClick(Tab.Record)
                // A blocked / ignored tab move (guest) never reaches the record route: do not leave the request behind.
                if (nav.top != Route.TabRoot(Tab.Record)) session.recordRequestedDate = null
            }
            HomeEffect.OpenNotifications -> open(Route.Notifications)
            is HomeEffect.OpenIssue -> {
                session.issueBanner = effect.banner
                open(Route.BannerWeb)
            }
        }
    }

    /** "이번 주 기록 보러가기": the record tab. */
    fun onWeekMore() = onTabClick(Tab.Record)

    /** Display list item tapped: the feed opens seeded with that item. */
    fun onDisplayOpenFeed(post: PostSummary) {
        session.feedSeeds[post.id] = post
        open(Route.Feed(post.id, FeedSource.Display))
    }

    /** Record tab "피드에서 보기": my post's detail seeded with the thumbnail; back returns to the record tab. */
    fun onRecordOpenFeed(entry: FeedEntry.FromRecord) {
        session.recordSeeds[entry.postId] = entry
        open(Route.Feed(entry.postId, FeedSource.ById))
    }

    /** Record tab "전시 보러가기": the display tab of [date] pushed on top of the record tab (REQ-REC-035, REQ-NAV-030). */
    fun onRecordOpenDisplay(date: LocalDate) {
        session.displayEntry = DisplayEntry(session.displayEntry.seq + 1, date, null)
        open(Route.TabRoot(Tab.Display))
    }

    /** The post was deleted: the feed on top is popped and the deletion toast shown (REQ-NAV-039/040). */
    fun onFeedDeleted(@Suppress("UNUSED_PARAMETER") postId: String, toastCopyKey: String) {
        val outcome = nav.onPostDeleted()
        showToast(copy[(outcome as? NavOutcome.Navigated)?.toastCopyKey ?: toastCopyKey])
    }

    /** The post is gone (404 on edit or like): the detail closes, the lists already dropped it through `PostChanges`. */
    fun onFeedClosed() {
        if (nav.top is Route.Feed) onSystemBack()
    }

    /**
     * A 401 that survived the refresh: the network layer also reports it as `AuthEvent.GoToLogin`, which `ChalkakRoot` turns into
     * `nav.onSessionEnded()` (new session key, signup context discarded). Doing it here as well would end the session twice.
     */
    fun onFeedLoginRequired() = Unit

    // ---- notifications and push taps -------------------------------------------------------------------------------------

    /**
     * Executes a destination of the notification table (D-11): an inbox row's `Navigate` effect and a queue-released push tap.
     * [NavMode.Push] adds the screen, [NavMode.ReplaceTop] replaces the same post / notification on top with a fresh one,
     * [NavMode.AlreadyThere] only runs the side effects of being on home.
     */
    fun onNotificationNavigate(command: NavCommand) {
        when (val destination = command.destination) {
            is NotificationDestination.Home -> goHome(destination, command.mode)
            is NotificationDestination.PostDetail -> openPostDetail(destination)
            is NotificationDestination.NotificationDetail -> {
                val route = Route.NotificationDetail(destination.notificationId)
                val replacing = RouteRules.sameDestination(nav.top, route)
                if (replacing) session.notificationDetailSerial++
                openFromNotification(route)
            }
            NotificationDestination.Inbox -> {
                val replacing = nav.top == Route.Notifications
                if (replacing) session.inboxSerial++
                openFromNotification(Route.Notifications)
            }
        }
    }

    /** What `PushTapQueue` released: the queue decided when, this decides how. */
    fun onPushEvent(event: PushNavigationEvent) {
        when (event) {
            is PushNavigationEvent.Go -> {
                event.toastCopyKey?.let { showToast(copy[it]) }
                onNotificationNavigate(event.command)
            }
            is PushNavigationEvent.Toast -> showToast(copy[event.copyKey])
            // The login screen is reached through AuthEvent.GoToLogin (the network layer reports the same 401); nothing to do here.
            PushNavigationEvent.RequireLogin -> Unit
        }
    }

    /** "알림함으로" on a detail that has no inbox below it: the inbox takes the detail's place. */
    fun onOpenInboxInsteadOfDetail() {
        if (nav.top is Route.NotificationDetail) nav.onSystemBack()
        open(Route.Notifications)
    }

    private fun goHome(destination: NotificationDestination.Home, mode: NavMode) {
        val home = Route.TabRoot(Tab.Home)
        val already = mode == NavMode.AlreadyThere || nav.top == home
        // Pop to home; the home route's own `onShown` refreshes it silently, so only the already-there case asks for a refresh.
        while (nav.top != home && nav.stack.size > 1 && nav.onSystemBack() is NavOutcome.Navigated) Unit
        if (destination.scrollToTopAndRefresh) {
            session.homeScroll.request()
            if (already) session.homeRefresh.request()
        }
    }

    private fun openPostDetail(destination: NotificationDestination.PostDetail) {
        val route = Route.Feed(destination.postId, FeedSource.ById)
        if (RouteRules.sameDestination(nav.top, route)) {
            session.feeds.invalidate(nav.stack.lastIndex)
            session.feedReplaceSerial++
        }
        session.aiSheetOnEntry[destination.postId] = destination.openAiFeedbackSheet
        val outcome = nav.open(route, OpenVia.Push)
        if (outcome is NavOutcome.Blocked) {
            session.aiSheetOnEntry.remove(destination.postId)
            showToast(copy[outcome.copyKey])
        }
    }

    private fun openFromNotification(route: Route) {
        val outcome = nav.open(route, OpenVia.Push)
        if (outcome is NavOutcome.Blocked) showToast(copy[outcome.copyKey])
    }

    private fun open(route: Route) {
        val outcome = nav.open(route)
        if (outcome is NavOutcome.Blocked) showToast(copy[outcome.copyKey])
        if (outcome !is NavOutcome.Navigated && outcome !is NavOutcome.Replaced && route is Route.Feed) {
            session.feedSeeds.remove(route.postId)
            session.recordSeeds.remove(route.postId)
        }
    }

    private fun HomePost.toSeed() = PostSummary(
        id = id,
        authorId = authorId,
        originalImageUrl = originalImageUrl,
        thumbnailImageUrl = thumbnailImageUrl,
        // Home cards carry no signature; the detail answer fills it in (the feed draws no signature for a blank url).
        signatureOriginalImageUrl = "",
        title = title,
        likeCount = likeCount,
        isLiked = isLiked,
        isMine = isMine,
    )
}
