package com.stonefive.chalkak.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class ScreenGoneEffectTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private var gone = 0

    @Test
    fun `leaving the screen runs onGone`() {
        var visible by mutableStateOf(true)
        rule.setContent { if (visible) ScreenGoneEffect(Unit) { gone++ } else Box {} }
        assertEquals(0, gone)
        visible = false
        rule.waitForIdle()
        assertEquals(1, gone)
    }

    @Test
    fun `an Activity recreation (rotation) does not run onGone because the holder survives it`() {
        rule.setContent { ScreenGoneEffect(Unit) { gone++ } }
        rule.activityRule.scenario.recreate()
        assertEquals(0, gone)
    }
}
