package com.stonefive.chalkak.platform

import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
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

/** Update dialog button: goes straight to this app's store page (REQ-BOOT-009). A store that cannot be opened counts as a failure. */
class StoreUpdateLauncher(private val store: StoreOpener) : UpdateLauncher {
    override suspend fun launch(): UpdateFlowResult = if (store.open()) UpdateFlowResult.Completed else UpdateFlowResult.Failed
}
