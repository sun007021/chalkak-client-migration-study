package com.stonefive.chalkak.platform

import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import org.junit.Test
import kotlin.test.assertNull
import kotlin.test.assertSame

class UpdateFlowBridgeTest {
    private class FakeLauncher : ActivityResultLauncher<IntentSenderRequest>() {
        override fun launch(input: IntentSenderRequest, options: ActivityOptionsCompat?) = Unit
        override fun unregister() = Unit
        override val contract: ActivityResultContract<IntentSenderRequest, *> = ActivityResultContracts.StartIntentSenderForResult()
    }

    @Test
    fun `a destroyed Activity releases its launcher so the bridge does not keep the Activity alive`() {
        val bridge = UpdateFlowBridge()
        val old = FakeLauncher()
        bridge.launcher = old
        bridge.detach(old)
        assertNull(bridge.launcher)
    }

    @Test
    fun `a late detach of the old Activity does not drop the launcher of the new one`() {
        val bridge = UpdateFlowBridge()
        val old = FakeLauncher()
        val new = FakeLauncher()
        bridge.launcher = old
        bridge.launcher = new
        bridge.detach(old)
        assertSame(new, bridge.launcher)
    }
}
