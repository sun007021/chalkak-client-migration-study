package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.UPLOAD_ENTRY_DATE
import com.stonefive.chalkak.testing.UPLOAD_TOPIC_TITLE
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.hasNode
import com.stonefive.chalkak.testing.loadCopy
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.upload.UploadGateEffect
import kr.chalkak.feature.upload.UploadSuccessText
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * [MainHost] with the real upload holder, editor holder and navigation controller over fakes at the ports (picker, codec, editor session,
 * repositories). The gate opens the upload screen for [UPLOAD_ENTRY_DATE], the day the fake topic repository knows.
 */
@RunWith(RobolectricTestRunner::class)
class MainHostUploadTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var rig = MainRig()

    @After
    fun tearDown() = rig.close()

    private fun launchOnUploadDay() {
        rig.close()
        rig = MainRig().apply { gate.result = UploadGateEffect.Open(UPLOAD_ENTRY_DATE) }
        rig.launch(rule, copy)
        rule.awaitTag("home.hero-photo")
    }

    private fun node(tag: String) = rule.onNodeWithTag(tag)

    private fun tap(tag: String) {
        node(tag).performClick()
        rule.waitForIdle()
    }

    private fun openUpload() {
        tap("bottom-bar.upload-button")
        rule.awaitTag("upload.topic-title")
    }

    private fun pickAndConfirmEdit() {
        tap("upload.album-button")
        rule.awaitTag("photo-edit.root")
        rule.waitUntil(2_000) { rig.uploadEditSource.opened > 0 }
        rule.waitForIdle()
        tap("photo-edit.done-button")
        rule.waitUntil(2_000) { !rule.hasNode("photo-edit.root") }
    }

    @Test
    fun `TC-UPL-002 게이트가 열어 준 날짜의 업로드 화면이 열리고 그 날짜의 주제를 보인다`() {
        launchOnUploadDay()
        openUpload()
        assertEquals(Route.PhotoUpload, rig.nav.top)
        node("upload.topic-title").assertTextEquals(copy.format("upload.heading", "주제" to UPLOAD_TOPIC_TITLE))
        node("upload.album-button").assertIsDisplayed()
        node("bottom-bar.root").assertDoesNotExist()
    }

    @Test
    fun `TC-UPL-014 업로드 화면을 닫았다 다시 열면 이전 사진 없이 새 화면으로 시작한다`() {
        launchOnUploadDay()
        openUpload()
        pickAndConfirmEdit()
        node("upload.photo-preview").assertIsDisplayed()
        tap("upload.close-button")
        node("upload.root").assertDoesNotExist()
        node("home.root").assertExists()
        openUpload()
        node("upload.photo-preview").assertDoesNotExist()
        node("upload.album-button").assertIsDisplayed()
    }

    @Test
    fun `TC-NAV-037 제출에 성공하면 업로드 화면이 성공 화면으로 바뀌고 뒤로 가도 업로드 화면으로 돌아가지 않는다`() {
        launchOnUploadDay()
        openUpload()
        pickAndConfirmEdit()
        tap("upload.submit-button")
        rule.awaitTag("upload-success.root")
        assertEquals(Route.PhotoUploadSuccess(UPLOAD_ENTRY_DATE), rig.nav.top)
        assertFalse(rule.hasNode("upload.root"))
        node("upload-success.message").assertTextEquals(UploadSuccessText.title(UPLOAD_TOPIC_TITLE))
        node("upload-success.confirm-button").assertTextEquals(copy["upload.success.confirm"])
        assertTrue("photo_upload_success" in rig.analytics.screens)
        assertEquals(1, rig.analytics.screens.count { it == "photo_upload" })
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        node("home.root").assertExists()
        assertFalse(rule.hasNode("upload.root"), "back from the success screen never reopens the upload screen")
    }

    @Test
    fun `TC-NAV-038 확인했어요를 누르면 업로드한 날짜의 전시 탭이 열리고 업로드와 성공 화면은 사라진다`() {
        launchOnUploadDay()
        openUpload()
        pickAndConfirmEdit()
        tap("upload.submit-button")
        rule.awaitTag("upload-success.root")
        tap("upload-success.confirm-button")
        rule.awaitTag("display.root")
        assertEquals(Route.TabRoot(Tab.Display), rig.nav.top)
        assertEquals(UPLOAD_ENTRY_DATE, rig.nav.state.value.displayDateRequest)
        assertFalse(rule.hasNode("upload-success.root"))
        assertFalse(rule.hasNode("upload.root"))
        node("bottom-bar.root").assertIsDisplayed()
        assertEquals(listOf(Route.TabRoot(Tab.Home), Route.TabRoot(Tab.Display)), rig.nav.stack)
    }
}
