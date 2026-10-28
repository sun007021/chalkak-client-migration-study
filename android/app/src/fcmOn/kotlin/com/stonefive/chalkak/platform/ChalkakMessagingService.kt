package com.stonefive.chalkak.platform

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.stonefive.chalkak.ChalkakApplication
import kotlinx.coroutines.runBlocking
import kr.chalkak.feature.notification.PushMessage
import kr.chalkak.feature.notification.PushPayloadParser

/**
 * Forwards FCM events to the app's [com.stonefive.chalkak.push.PushRuntime]. Messages that carry a `notification` block are shown by the
 * system while the app is in the background; `onMessageReceived` only runs for them in the foreground (and for data-only messages).
 */
@Suppress("OVERRIDE_DEPRECATION")
class ChalkakMessagingService : FirebaseMessagingService() {
    private val container get() = (application as ChalkakApplication).container

    override fun onNewToken(token: String) {
        container.pushRuntime.start()
        FcmTokens.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val runtime = container.pushRuntime
        runtime.start()
        val notification = message.notification
        val push = PushMessage(notification?.title, notification?.body, PushPayloadParser.fromData(message.data))
        // The service's process time is short; the runtime call only refreshes unread and posts a notification.
        runBlocking { runtime.onMessageReceived(push, container.appForeground.isForeground) }
    }
}
