package com.stonefive.chalkak.ui.boot

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.click
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class UpdateGateDialogTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var updateClicks = 0

    private fun show() = rule.setContent {
        TestApp(copy) {
            Box(Modifier.fillMaxSize().testTag("test.host")) {
                UpdateGateDialog(onUpdateClick = { updateClicks++ })
            }
        }
    }

    @Test
    fun `TC-BOOT-028 강제 업데이트 다이얼로그는 제목 본문 버튼 하나를 copy 문구로 보인다`() {
        show()
        rule.onNodeWithTag("update-gate.dialog").assertIsDisplayed()
        rule.onNodeWithTag("update-gate.title").assertTextEquals(copy["boot.update.title"])
        rule.onNodeWithTag("update-gate.message").assertTextEquals(copy["boot.update.body"])
        rule.onNodeWithTag("update-gate.update-button").assertIsEnabled().assertTextEquals(copy["boot.update.button"])
        rule.onAllNodes(hasClickAction()).assertCountEquals(1)
    }

    @Test
    fun `TC-BOOT-028 뒤로가기로 닫히지 않는다`() {
        show()
        // Back goes through the activity dispatcher: an in-tree overlay must swallow it (BackHandler); a Dialog window handles it itself.
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.onNodeWithTag("update-gate.dialog").assertIsDisplayed()
        rule.onNodeWithTag("update-gate.update-button").assertIsDisplayed()
    }

    @Test
    fun `TC-BOOT-028 바깥을 탭해도 닫히지 않는다`() {
        show()
        rule.onNodeWithTag("test.host").performTouchInput { click(Offset(2f, 2f)) }
        rule.waitForIdle()
        rule.onNodeWithTag("update-gate.dialog").assertIsDisplayed()
        assertEquals(0, updateClicks, "an outside tap must not trigger the update button")
    }

    @Test
    fun `TC-BOOT-028 업데이트 버튼 탭은 콜백을 호출하고 다이얼로그는 남는다`() {
        show()
        rule.onNodeWithTag("update-gate.update-button").performClick()
        rule.waitForIdle()
        assertEquals(1, updateClicks)
        rule.onNodeWithTag("update-gate.dialog").assertIsDisplayed()
    }
}
