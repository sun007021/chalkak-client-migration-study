package com.stonefive.chalkak

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import com.stonefive.chalkak.ui.ChalkakRoot
import com.stonefive.chalkak.ui.theme.ChalkakTheme

class MainActivity : ComponentActivity() {
    private var startedOnce = false

    // Registered before STARTED, as the Activity Result API requires; Play's immediate update flow reports here.
    private val updateFlow = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        platform.updateFlowBridge.onResult(result.resultCode)
    }

    private val container get() = (application as ChalkakApplication).container
    private val platform get() = container.platform

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        platform.currentActivity.set(this)
        platform.updateFlowBridge.launcher = updateFlow
        container.startBoot()
        val deps = container.newRootDependencies(onExitApp = ::finish)
        setContent {
            ChalkakTheme {
                ChalkakRoot(copy = container.copy, deps = deps)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        // Back in the foreground: a Play priority bump while the app was away closes the gate (REQ-BOOT-009 style re-check).
        if (startedOnce) container.bootGate.recheckUpdate()
        startedOnce = true
    }

    override fun onDestroy() {
        platform.currentActivity.clear(this)
        super.onDestroy()
    }
}
