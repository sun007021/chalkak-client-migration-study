package com.stonefive.chalkak.platform

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.stonefive.chalkak.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Firebase Cloud Messaging adapter, compiled only with `-PfcmProjectId=...` (plus `fcmApplicationId`, `fcmApiKey`, `fcmSenderId`).
 * Firebase is initialised by hand from BuildConfig values: no google-services plugin and no google-services.json in the repo.
 */
object FcmTokens {
    // replay = 1: the service may deliver a token right after starting the runtime, before its collector subscribed (the
    // registration coordinator de-duplicates by (user, token), so a repeated delivery is harmless).
    private val refreshedFlow = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 16)

    fun create(context: Context): PushTokenSource {
        val app = context.applicationContext
        if (FirebaseApp.getApps(app).isEmpty()) {
            FirebaseApp.initializeApp(
                app,
                FirebaseOptions.Builder()
                    .setProjectId(BuildConfig.FCM_PROJECT_ID)
                    .setApplicationId(BuildConfig.FCM_APPLICATION_ID)
                    .setApiKey(BuildConfig.FCM_API_KEY)
                    .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                    .build(),
            )
        }
        return Source
    }

    /** `FirebaseMessagingService.onNewToken`. */
    internal fun onNewToken(token: String) {
        refreshedFlow.tryEmit(token)
    }

    private object Source : PushTokenSource {
        override val refreshed: Flow<String> = refreshedFlow

        @Suppress("DEPRECATION")
        override suspend fun currentToken(): String? = try {
            suspendCancellableCoroutine { cont ->
                FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                    cont.resume(if (task.isSuccessful) task.result else null)
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }
}
