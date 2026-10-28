package com.stonefive.chalkak.push

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.platform.PushPlatform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavState
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.notification.ForegroundPushHandler
import kr.chalkak.feature.notification.PushMessage
import kr.chalkak.feature.notification.PushRegistrationCoordinator
import kr.chalkak.feature.notification.PushTapQueue
import kr.chalkak.feature.notification.TopScreen
import kr.chalkak.feature.notification.UnreadStatusRefresher

/**
 * What [PushTapQueue] reads from the navigation: which screen is on top (for `NavModes.resolve`) and whether a screen that must not be
 * interrupted is open (login, terms, sign-up signature, upload, feedback, change-signature). The app host calls [update] on every
 * `NavState` change (also while MainHost is not composed, e.g. on the login screen).
 */
class PushNavigationState {
    /** True while a screen that holds a push tap back is on top (TC-PUSH-060/061). */
    val blocking = MutableStateFlow(false)

    @Volatile
    var top: TopScreen = TopScreen.Other

    /** What the host last reported about the navigation as a whole; null until the first [update] (the boot gate decides until then). */
    val reported = MutableStateFlow<Reported?>(null)

    /** [mainOpen]: the stack is built on a tab root (main area), not on the login / sign-up screens. */
    data class Reported(val mainOpen: Boolean, val accessMode: AccessMode)

    fun update(state: NavState) {
        val route = state.top
        top = when (route) {
            is Route.TabRoot -> if (route.tab == Tab.Home) TopScreen.Home else TopScreen.Other
            is Route.Feed -> TopScreen.PostDetail(route.postId)
            is Route.NotificationDetail -> TopScreen.NotificationDetail(route.notificationId)
            Route.Notifications -> TopScreen.Inbox
            else -> TopScreen.Other
        }
        // A terms/privacy sheet over a blocking screen does not unblock it.
        val underlying = if (route is Route.TermsDocument) state.stack.getOrNull(state.stack.size - 2) ?: route else route
        blocking.value = underlying.holdsPushTap()
        reported.value = Reported(mainOpen = state.stack.firstOrNull() is Route.TabRoot, accessMode = state.accessMode)
    }

    private fun Route.holdsPushTap(): Boolean = when (this) {
        Route.Login, Route.Terms, Route.OnboardingSignature, Route.OnboardingSignaturePreview,
        Route.PhotoUpload, Route.Feedback, Route.ChangeSignature, Route.ChangeSignaturePreview,
        -> true
        else -> false
    }
}

/** The tap queue plus the navigation view it reads; `RootDependencies.pushTaps`. The container starts the queue (restore, then start). */
class PushTapWiring(val queue: PushTapQueue, val nav: PushNavigationState)

/**
 * Push pipeline glue owned by the app container:
 *  - [start] (idempotent): creates channel `moderation_push` with copy `push.channel.name`; collects `platform.tokens.refreshed`
 *    and hands each token to `registration.onNewToken`;
 *  - [onMessageReceived]: the service's `onMessageReceived` (display text + parsed payload; [foreground] from the app lifecycle).
 */
class PushRuntime(
    private val scope: CoroutineScope,
    private val platform: PushPlatform,
    private val registration: PushRegistrationCoordinator,
    unread: UnreadStatusRefresher,
    private val copy: Copy,
) {
    private val foreground = ForegroundPushHandler(
        permission = platform.permission,
        display = platform.display,
        unread = unread,
        channelName = copy["push.channel.name"],
        defaultBody = copy["push.default.body"],
    )
    private val started = AtomicBoolean(false)

    fun start() {
        if (!started.compareAndSet(false, true)) return
        foreground.initChannel()
        scope.launch { platform.tokens.refreshed.collect { registration.onNewToken(it) } }
    }

    suspend fun onMessageReceived(message: PushMessage, foreground: Boolean) {
        this.foreground.onMessageReceived(message, foreground)
    }
}
