package com.stonefive.chalkak

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import com.stonefive.chalkak.platform.PushIntentParser
import com.stonefive.chalkak.ui.ChalkakRoot
import com.stonefive.chalkak.ui.theme.ChalkakTheme

class MainActivity : ComponentActivity() {
    private var startedOnce = false

    // Registered before STARTED, as the Activity Result API requires; Play's immediate update flow reports here.
    private val updateFlow = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        platform.updateFlowBridge.onResult(result.resultCode)
    }

    // The Photo Picker (album) and the system camera report here; both launchers are detached again in onDestroy.
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        platform.photoPickBridge.onAlbumResult(uri)
    }
    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        platform.photoPickBridge.onCameraResult(saved)
    }

    // Android 13+: the OS asks for POST_NOTIFICATIONS; the answer completes the request that is waiting in the permission adapter.
    private val requestNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        platform.pushPlatform.permissionBridge.onResult(granted)
    }

    private val container get() = (application as ChalkakApplication).container
    private val platform get() = container.platform

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        platform.currentActivity.set(this)
        platform.updateFlowBridge.launcher = updateFlow
        platform.photoPickBridge.albumLauncher = pickPhoto
        platform.photoPickBridge.cameraLauncher = takePhoto
        platform.pushPlatform.permissionBridge.launcher = requestNotifications
        container.startBoot()
        container.startPush()
        // A tap on a push notification that started this Activity (cold start) or is delivered to it (onNewIntent). A re-created
        // Activity (rotation, process restore) sees the same intent again; its tap was already handled or saved.
        if (savedInstanceState == null) forwardPushTap(intent)
        val deps = container.newRootDependencies(onExitApp = ::finish)
        setContent {
            ChalkakTheme {
                ChalkakRoot(copy = container.copy, deps = deps)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        forwardPushTap(intent)
    }

    private fun forwardPushTap(intent: Intent?) {
        PushIntentParser.fromIntent(intent)?.let(container::onPushTap)
    }

    override fun onStart() {
        super.onStart()
        // Back in the foreground: a Play priority bump while the app was away closes the gate (REQ-BOOT-009 style re-check).
        if (startedOnce) container.bootGate.recheckUpdate()
        startedOnce = true
    }

    override fun onDestroy() {
        platform.currentActivity.clear(this)
        platform.updateFlowBridge.detach(updateFlow)
        platform.photoPickBridge.detach(pickPhoto)
        platform.photoPickBridge.detach(takePhoto)
        platform.pushPlatform.permissionBridge.detach(requestNotifications)
        super.onDestroy()
    }
}
