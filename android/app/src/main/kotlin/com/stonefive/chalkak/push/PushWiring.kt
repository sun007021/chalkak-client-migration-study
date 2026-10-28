package com.stonefive.chalkak.push

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.platform.PushPlatform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kr.chalkak.feature.navigation.NavState
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

    /** STUB (A8 test step). */
    fun update(state: NavState) {
    }
}

/** The tap queue plus the navigation view it reads; `RootDependencies.pushTaps`. The container starts the queue (restore, then start). */
class PushTapWiring(val queue: PushTapQueue, val nav: PushNavigationState)

/**
 * STUB (A8 test step). Push pipeline glue owned by the app container:
 *  - [start] (idempotent): creates channel `moderation_push` with copy `push.channel.name`; collects `platform.tokens.refreshed`
 *    and hands each token to `registration.onNewToken`;
 *  - [onMessageReceived]: the service's `onMessageReceived` (display text + parsed payload; [foreground] from the app lifecycle).
 */
class PushRuntime(
    scope: CoroutineScope,
    platform: PushPlatform,
    registration: PushRegistrationCoordinator,
    unread: UnreadStatusRefresher,
    copy: Copy,
) {
    fun start() {
    }

    suspend fun onMessageReceived(message: PushMessage, foreground: Boolean) {
    }
}
