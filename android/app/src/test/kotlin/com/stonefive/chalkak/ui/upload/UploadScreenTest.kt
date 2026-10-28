package com.stonefive.chalkak.ui.upload

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.stonefive.chalkak.platform.PhotoPreview
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.UPLOAD_TOPIC_TITLE
import com.stonefive.chalkak.testing.albumPhoto
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.previewOf
import kr.chalkak.feature.upload.Preparation
import kr.chalkak.feature.upload.PhotoUploadUiState
import kr.chalkak.feature.upload.TopicState
import kr.chalkak.feature.upload.UploadCopyKeys
import kr.chalkak.feature.upload.UploadError
import kr.chalkak.feature.upload.image.ImageSize
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class UploadScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val loadedTopic = TopicState.Loaded("topic-1", UPLOAD_TOPIC_TITLE)

    private val clicks = mutableListOf<String>()
    private val titles = mutableListOf<String>()
    private val actions = object : UploadActions {
        override fun onAlbumClick() { clicks += "album" }
        override fun onCameraClick() { clicks += "camera" }
        override fun onSubmit() { clicks += "submit" }
        override fun onPhotoClick() { clicks += "photo" }
        override fun onTitleChange(raw: String) { titles += raw }
    }

    private fun show(state: PhotoUploadUiState, preview: PhotoPreview? = null) =
        rule.setContent { TestApp(copy) { UploadScreen(state, preview, actions) } }

    private fun withPhoto(change: PhotoUploadUiState.() -> PhotoUploadUiState = { this }) =
        PhotoUploadUiState(topic = loadedTopic, photo = albumPhoto()).change()

    @Test
    fun `TC-UPL-015 카메라가 없는 기기에서는 카메라 버튼이 없고 앨범 버튼은 있다`() {
        show(PhotoUploadUiState(topic = loadedTopic, cameraAvailable = false))
        rule.onNodeWithTag("upload.camera-button").assertDoesNotExist()
        rule.onNodeWithTag("upload.album-button").assertIsDisplayed().assertIsEnabled()
    }

    @Test
    fun `TC-UPL-015 카메라가 있는 기기에서는 앨범과 카메라 버튼이 모두 보이고 탭이 전달된다`() {
        show(PhotoUploadUiState(topic = loadedTopic, cameraAvailable = true))
        rule.onNodeWithTag("upload.camera-button").assertIsDisplayed().performClick()
        rule.onNodeWithTag("upload.album-button").assertIsDisplayed().performClick()
        assertEquals(listOf("camera", "album"), clicks)
    }

    @Test
    fun `TC-UPL-047 사진이 없으면 전시하기는 비활성이다`() {
        show(PhotoUploadUiState(topic = loadedTopic))
        rule.onNodeWithTag("upload.submit-button").assertIsNotEnabled().assertTextEquals(copy["upload.submit"])
    }

    @Test
    fun `TC-UPL-047 사진을 고르면 준비 상태와 무관하게 활성이다`() {
        var state by mutableStateOf(withPhoto { copy(preparation = Preparation.None) })
        rule.setContent { TestApp(copy) { UploadScreen(state, previewOf(), actions) } }
        listOf(Preparation.None, Preparation.Preparing, Preparation.Ready).forEach { preparation ->
            state = withPhoto { copy(preparation = preparation) }
            rule.onNodeWithTag("upload.submit-button").assertIsEnabled().assertTextEquals(copy["upload.submit"])
        }
        rule.onNodeWithTag("upload.submit-button").performClick()
        assertEquals(listOf("submit"), clicks)
    }

    @Test
    fun `TC-UPL-047 준비 중 표시는 준비 중에만 보인다`() {
        show(withPhoto { copy(preparation = Preparation.Preparing) }, previewOf())
        rule.onNodeWithTag("upload.preparing-indicator").assertIsDisplayed()
        rule.onNodeWithTag("upload.submit-button").assertIsEnabled()
    }

    @Test
    fun `TC-UPL-047 준비 완료에는 준비 중 표시가 없다`() {
        show(withPhoto { copy(preparation = Preparation.Ready) }, previewOf())
        rule.onNodeWithTag("upload.preparing-indicator").assertDoesNotExist()
        rule.onNodeWithTag("upload.submitting-indicator").assertDoesNotExist()
        rule.onNodeWithTag("upload.error-message").assertDoesNotExist()
    }

    @Test
    fun `TC-UPL-047 준비에 실패해도 오류 문구와 함께 전시하기를 다시 누를 수 있다`() {
        val failed = withPhoto {
            copy(
                preparation = Preparation.Failed(UploadCopyKeys.ERROR_PREPARE),
                error = UploadError(1, UploadCopyKeys.ERROR_PREPARE),
            )
        }
        show(failed, previewOf())
        rule.onNodeWithTag("upload.error-message").assertIsDisplayed().assertTextEquals(copy["upload.error.prepare"])
        rule.onNodeWithTag("upload.preparing-indicator").assertDoesNotExist()
        rule.onNodeWithTag("upload.submit-button").assertIsEnabled().performClick()
        assertEquals(listOf("submit"), clicks)
    }

    @Test
    fun `TC-UPL-047 제출 중에는 전시 중 문구와 진행 표시가 보이고 버튼과 제목 입력이 잠긴다`() {
        show(withPhoto { copy(submitting = true, preparation = Preparation.Ready) }, previewOf())
        rule.onNodeWithTag("upload.submit-button").assertIsNotEnabled().assertTextEquals(copy["upload.submitting"])
        rule.onNodeWithTag("upload.submitting-indicator").assertIsDisplayed()
        rule.onNodeWithTag("upload.title-input").assertIsNotEnabled()
    }

    @Test
    fun `TC-UPL-047 서버 메시지가 있는 오류는 서버 문구를 그대로 보인다`() {
        show(withPhoto { copy(error = UploadError(2, serverMessage = "서버가 준 문구")) }, previewOf())
        rule.onNodeWithTag("upload.error-message").assertTextEquals("서버가 준 문구")
    }

    @Test
    fun `TC-UPL-089 주제 안내 문구와 제목 플레이스홀더를 copy 문구로 보인다`() {
        show(PhotoUploadUiState(topic = loadedTopic))
        rule.onNodeWithTag("upload.topic-title").assertTextEquals(copy.format("upload.heading", "주제" to UPLOAD_TOPIC_TITLE))
        rule.onNodeWithTag("upload.guide-text").assertTextEquals(copy["upload.subheading"])
        rule.onNodeWithTag("upload.title-input").assertShowsAll(copy["upload.caption.placeholder"])
    }

    @Test
    fun `TC-UPL-089 가로 사진은 원본 비율 4 대 3으로 표시된다`() {
        show(withPhoto(), previewOf(ImageSize(4000, 3000)))
        val bounds = rule.onNodeWithTag("upload.photo-preview").assertIsDisplayed().getBoundsInRoot()
        assertTrue(kotlin.math.abs(bounds.width.value / bounds.height.value - 4f / 3f) < 0.02f, "ratio ${bounds.width} x ${bounds.height}")
    }

    @Test
    fun `TC-UPL-089 세로 사진은 원본 비율 3 대 4로 표시된다`() {
        show(withPhoto(), previewOf(ImageSize(3000, 4000)))
        val bounds = rule.onNodeWithTag("upload.photo-preview").assertIsDisplayed().getBoundsInRoot()
        assertTrue(kotlin.math.abs(bounds.width.value / bounds.height.value - 3f / 4f) < 0.02f, "ratio ${bounds.width} x ${bounds.height}")
    }

    @Test
    fun `TC-UPL-089 사진 미리보기를 탭하면 다시 편집을 요청하고 사진이 있으면 앨범 버튼은 없다`() {
        show(withPhoto(), previewOf())
        rule.onNodeWithTag("upload.album-button").assertDoesNotExist()
        rule.onNodeWithTag("upload.camera-button").assertDoesNotExist()
        rule.onNodeWithTag("upload.photo-preview").performClick()
        assertEquals(listOf("photo"), clicks)
    }

    @Test
    fun `TC-UPL-089 제목 입력에 포커스가 가고 입력이 전달된다`() {
        show(PhotoUploadUiState(topic = loadedTopic))
        rule.onNodeWithTag("upload.title-input").performClick().assertIsFocused()
        rule.onNodeWithTag("upload.title-input").performTextInput("가을")
        assertEquals("가을", titles.last())
    }

    @Test
    fun `TC-UPL-089 제목 글자 수 표시가 있고 입력창은 상태의 제목을 보인다`() {
        show(PhotoUploadUiState(topic = loadedTopic, title = "가을"))
        rule.onNodeWithTag("upload.title-counter").assertIsDisplayed()
        rule.onNodeWithTag("upload.title-input").assertShowsAll("가을")
    }
}
