package com.stonefive.chalkak.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kr.chalkak.core.common.AppConstants

@RunWith(RobolectricTestRunner::class)
class ToastLayerTest {
    @get:Rule
    val rule = createComposeRule()

    private var toast by mutableStateOf<ToastUi?>(null)
    private val expired = mutableListOf<Long>()

    private fun setContent() = rule.setContent {
        ChalkakTheme { ToastLayer(toast = toast, onExpired = { expired += it }) }
    }

    @Test
    fun `toast message tag shows the text and container is absent without a toast`() {
        setContent()
        rule.onNodeWithTag("toast.container").assertDoesNotExist()
        toast = ToastUi(1, "저장했어요")
        rule.waitForIdle()
        rule.onNodeWithTag("toast.message").assertIsDisplayed().assertTextEquals("저장했어요")
    }

    @Test
    fun `same text with a new id is redrawn and each id expires after the toast duration`() {
        setContent()
        toast = ToastUi(1, "같은 문구")
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(2_000)
        check(expired.isEmpty())
        toast = ToastUi(2, "같은 문구")
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(2_000)
        check(expired.isEmpty()) { "the first window must not expire the newer toast: $expired" }
        rule.mainClock.advanceTimeBy(AppConstants.TOAST_DURATION_MS - 2_000 + 100)
        check(expired == listOf(2L)) { "expired=$expired" }
    }
}
