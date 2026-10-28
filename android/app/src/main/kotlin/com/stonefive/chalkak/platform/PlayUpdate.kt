package com.stonefive.chalkak.platform

import android.app.Activity
import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kr.chalkak.feature.auth.PlayUpdateSource
import kr.chalkak.feature.auth.UpdateFlowResult
import kr.chalkak.feature.auth.UpdateLauncher
import kotlin.coroutines.resume

/** `updatePriority` from Play In-App Update (D-15, REQ-BOOT-008). 0 when no update is available, null when Play cannot answer. */
class PlayUpdateSourceAdapter(private val manager: AppUpdateManager) : PlayUpdateSource {
    constructor(context: Context) : this(AppUpdateManagerFactory.create(context.applicationContext))

    override suspend fun updatePriority(): Int? = suspendCancellableCoroutine { continuation ->
        manager.appUpdateInfo
            .addOnSuccessListener { info ->
                val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                if (continuation.isActive) continuation.resume(if (available) info.updatePriority() else 0)
            }
            .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
    }
}

/**
 * Bridge between the Activity result API and the suspending [PlayUpdateLauncher]. `MainActivity` registers
 * `StartIntentSenderForResult`, stores it in [launcher] and forwards the result code to [onResult].
 */
class UpdateFlowBridge {
    @Volatile
    var launcher: ActivityResultLauncher<IntentSenderRequest>? = null

    @Volatile
    private var pending: CompletableDeferred<Int>? = null

    /** Drops [registered] when the Activity that owns it is destroyed: the launcher references that Activity's result registry. */
    fun detach(registered: ActivityResultLauncher<IntentSenderRequest>) {
        if (launcher === registered) launcher = null
    }

    internal fun begin(): CompletableDeferred<Int> = CompletableDeferred<Int>().also { pending = it }

    fun onResult(resultCode: Int) {
        pending?.complete(resultCode)
        pending = null
    }
}

/**
 * Update dialog button: Play IMMEDIATE update flow (REQ-BOOT-008). When Play cannot run the flow (not allowed, no Activity, sideloaded
 * build) the store page is opened instead through [StoreOpener]. Play's immediate flow restarts the app itself on success.
 */
class PlayUpdateLauncher(
    private val manager: AppUpdateManager,
    private val activity: CurrentActivity,
    private val bridge: UpdateFlowBridge,
    private val store: StoreOpener,
) : UpdateLauncher {
    override suspend fun launch(): UpdateFlowResult {
        val info = fetchInfo() ?: return openStore()
        val options = AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
        val launcher = bridge.launcher
        if (activity.get() == null || launcher == null || !info.isUpdateTypeAllowed(options)) return openStore()
        val result = bridge.begin()
        if (!manager.startUpdateFlowForResult(info, launcher, options)) return openStore()
        return when (result.await()) {
            Activity.RESULT_OK -> UpdateFlowResult.Completed
            Activity.RESULT_CANCELED -> UpdateFlowResult.Cancelled
            else -> UpdateFlowResult.Failed
        }
    }

    private fun openStore(): UpdateFlowResult = if (store.open()) UpdateFlowResult.Completed else UpdateFlowResult.Failed

    private suspend fun fetchInfo(): AppUpdateInfo? = suspendCancellableCoroutine { continuation ->
        manager.appUpdateInfo
            .addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
            .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
    }
}
