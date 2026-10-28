package com.stonefive.chalkak.ui.upload

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.UploadHolderRig
import com.stonefive.chalkak.testing.albumPhoto
import com.stonefive.chalkak.testing.editableText
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.uploadHolderRig
import kr.chalkak.core.common.PostTitle
import kr.chalkak.feature.upload.PickerResult
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class UploadRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val scope = HolderScope()
    private lateinit var rig: UploadHolderRig

    @After
    fun tearDown() = scope.close()

    private fun showRoute(hasCamera: Boolean = true) {
        rig = uploadHolderRig(scope, hasCamera)
        rule.setContent {
            TestApp(copy) {
                UploadRoute(rig.holder, rig.platform, onClose = {}, onShowSuccess = {}, onReauthRequired = {})
            }
        }
        rule.waitForIdle()
    }

    private fun pick(id: String) {
        rig.acquirer.album = PickerResult.Picked(albumPhoto(id))
        rule.onNodeWithTag("upload.album-button").performClick()
        rule.waitForIdle()
    }

    @Test
    fun `TC-UPL-014 앨범 버튼을 누르면 시스템 선택기를 열고 사진을 고르는 즉시 편집 화면이 뜬다`() {
        showRoute()
        rule.onNodeWithTag("photo-edit.root").assertDoesNotExist()
        pick("album-photo")
        assertEquals(1, rig.acquirer.albumCalls)
        assertEquals(0, rig.acquirer.cameraCalls)
        rule.onNodeWithTag("photo-edit.root").assertIsDisplayed()
        assertEquals("album-photo", rig.holder.state.value.editor?.photo?.id)
    }

    @Test
    fun `TC-UPL-014 선택기를 취소하면 상태가 바뀌지 않고 편집 화면도 뜨지 않는다`() {
        showRoute()
        val before = rig.holder.state.value
        rig.acquirer.album = PickerResult.Cancelled
        rule.onNodeWithTag("upload.album-button").performClick()
        rule.waitForIdle()
        assertEquals(1, rig.acquirer.albumCalls)
        assertEquals(before, rig.holder.state.value)
        rule.onNodeWithTag("photo-edit.root").assertDoesNotExist()
        rule.onNodeWithTag("upload.album-button").assertIsDisplayed()
        rule.onNodeWithTag("upload.submit-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-UPL-021 0바이트 사진을 고르면 편집 화면 없이 준비 실패 문구를 보인다`() {
        showRoute()
        rig.codec.unreadable += "zero-bytes.jpg"
        pick("zero-bytes.jpg")
        rule.onNodeWithTag("photo-edit.root").assertDoesNotExist()
        rule.onNodeWithTag("upload.error-message").assertIsDisplayed().assertTextEquals(copy["upload.error.prepare"])
        rule.onNodeWithTag("upload.photo-preview").assertDoesNotExist()
        rule.onNodeWithTag("upload.submit-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-UPL-021 손상된 사진을 고르면 편집 화면 없이 준비 실패 문구를 보인다`() {
        showRoute()
        rig.codec.corrupt += "corrupt-truncated.jpg"
        pick("corrupt-truncated.jpg")
        rule.onNodeWithTag("photo-edit.root").assertDoesNotExist()
        rule.onNodeWithTag("upload.error-message").assertIsDisplayed().assertTextEquals(copy["upload.error.prepare"])
        rule.onNodeWithTag("upload.submit-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-UPL-080 한글 10자는 입력되고 11번째 입력은 들어가지 않는다`() {
        showRoute()
        val ten = "가".repeat(10)
        rule.onNodeWithTag("upload.title-input").performTextInput(ten)
        assertEquals(ten, rule.onNodeWithTag("upload.title-input").editableText())
        rule.onNodeWithTag("upload.title-input").performTextInput("나")
        assertEquals(ten, rule.onNodeWithTag("upload.title-input").editableText())
        assertEquals(ten, rig.holder.state.value.title)
    }

    @Test
    fun `TC-UPL-080 이모지 10개는 입력되고 11번째 이모지는 들어가지 않는다`() {
        showRoute()
        val ten = "😀".repeat(10) // 10 code points, 20 UTF-16 units
        rule.onNodeWithTag("upload.title-input").performTextInput(ten)
        assertEquals(ten, rule.onNodeWithTag("upload.title-input").editableText())
        rule.onNodeWithTag("upload.title-input").performTextInput("😀")
        assertEquals(ten, rule.onNodeWithTag("upload.title-input").editableText())
        assertEquals(10, PostTitle.length(rig.holder.state.value.title))
    }

    @Test
    fun `TC-UPL-081 결합 이모지 2개와 한 글자를 붙여넣으면 10 code point까지만 들어간다`() {
        showRoute()
        val family = "👨‍👩‍👧" // 5 code points, one grapheme
        rule.onNodeWithTag("upload.title-input").performTextReplacement(family + family + "가")
        assertEquals(family + family, rule.onNodeWithTag("upload.title-input").editableText())
        assertEquals(10, PostTitle.length(rig.holder.state.value.title))
    }

    @Test
    fun `TC-UPL-081 결합 이모지 2개가 이미 있으면 한 글자도 더 들어가지 않는다`() {
        showRoute()
        val family = "👨‍👩‍👧"
        rule.onNodeWithTag("upload.title-input").performTextInput(family + family)
        rule.onNodeWithTag("upload.title-input").performTextInput("가")
        assertEquals(family + family, rule.onNodeWithTag("upload.title-input").editableText())
    }
}
