package com.stonefive.chalkak.copy

import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class CopyTest {
    private val copy = Copy.load(ApplicationProvider.getApplicationContext())

    @Test
    fun `assets contain shared ko json and a known key resolves`() {
        assertEquals("찰칵", copy["app.name"])
        assertEquals("AI 피드백이 완료되었어요", copy["ai.card.completed"])
        assertTrue(copy.contains("display.picker.day"))
    }

    @Test
    fun `format fills named placeholders and a missing key falls back to the key`() {
        assertEquals("5일", copy.format("display.picker.day", "n" to 5))
        assertEquals("no.such.key", copy["no.such.key"])
    }

    @Test
    fun `constants json asset matches AppConstants`() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val text = ctx.assets.open("shared/constants.json").bufferedReader().readText()
        val max = Regex("\"POST_TITLE_MAX\"\\s*:\\s*(\\d+)").find(text)!!.groupValues[1].toInt()
        assertEquals(kr.chalkak.core.common.AppConstants.POST_TITLE_MAX, max)
    }
}
