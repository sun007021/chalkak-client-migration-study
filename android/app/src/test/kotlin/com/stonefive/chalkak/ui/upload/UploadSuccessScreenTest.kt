package com.stonefive.chalkak.ui.upload

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.UPLOAD_ENTRY_DATE
import com.stonefive.chalkak.testing.UPLOAD_TOPIC_TITLE
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.previewOf
import kr.chalkak.core.data.upload.testing.UploadFixtures
import kr.chalkak.feature.upload.SuccessInfo
import kr.chalkak.feature.upload.UploadSuccessText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class UploadSuccessScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private var confirms = 0

    private fun show(fixture: String) {
        val created = UploadFixtures.created(fixture)
        val info = SuccessInfo(created.postId, UPLOAD_ENTRY_DATE, UPLOAD_TOPIC_TITLE, created.status)
        rule.setContent { TestApp(copy) { UploadSuccessScreen(info, previewOf(), onConfirm = { confirms++ }) } }
    }

    @Test
    fun `TC-UPL-085 PENDING이면 검수 대기 안내와 확인했어요 버튼이 보인다`() {
        show("upload/posts-create__201-pending.json")
        rule.onNodeWithTag("upload-success.root").assertIsDisplayed()
        rule.onNodeWithTag("upload-success.message").assertTextEquals(UploadSuccessText.title(UPLOAD_TOPIC_TITLE))
        rule.onNodeWithTag("upload-success.status-message").assertTextEquals(copy["upload.success.pending"])
        rule.onNodeWithTag("upload-success.confirm-button").assertIsEnabled().assertTextEquals(copy["upload.success.confirm"])
    }

    @Test
    fun `TC-UPL-085 VALIDATING이면 사진 확인 안내와 확인했어요 버튼이 보인다`() {
        show("upload/posts-create__201-validating.json")
        rule.onNodeWithTag("upload-success.status-message").assertTextEquals(copy["upload.success.validating"])
        rule.onNodeWithTag("upload-success.confirm-button").assertIsEnabled().assertTextEquals(copy["upload.success.confirm"])
    }

    @Test
    fun `TC-UPL-085 확인했어요를 누르면 콜백이 한 번 불린다`() {
        show("upload/posts-create__201-pending.json")
        rule.onNodeWithTag("upload-success.confirm-button").performClick()
        assertEquals(1, confirms)
    }
}
