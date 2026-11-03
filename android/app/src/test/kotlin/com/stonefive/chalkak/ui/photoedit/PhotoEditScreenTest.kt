package com.stonefive.chalkak.ui.photoedit

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.hasTestTagPrefix
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.feature.upload.edit.CropAspectRatio
import kr.chalkak.feature.upload.edit.EditTab
import kr.chalkak.feature.upload.edit.PhotoEditUiState
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.image.ImageSize
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class PhotoEditScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val events = mutableListOf<String>()
    private val actions = object : PhotoEditActions {
        override fun onTabSelected(tab: EditTab) { events += "tab:$tab" }
        override fun onRatioSelected(ratio: CropAspectRatio) { events += "ratio:$ratio" }
        override fun onRotate() { events += "rotate" }
        override fun onCropReset() { events += "crop-reset" }
        override fun onFilterSelected(filter: PhotoFilter) { events += "filter:$filter" }
        override fun onDone() { events += "done" }
        override fun onCancel() { events += "cancel" }
    }

    private fun ready(change: PhotoEditUiState.() -> PhotoEditUiState = { this }) =
        PhotoEditUiState(ready = true, displayedSize = ImageSize(4000, 3000)).change()

    private fun show(state: PhotoEditUiState) =
        rule.setContent { TestApp(copy) { PhotoEditScreen(state, preview = { Box(it) }, actions = actions) } }

    private fun tagsWithPrefix(prefix: String): List<String> =
        rule.onAllNodes(hasTestTagPrefix(prefix)).fetchSemanticsNodes().map { it.config[SemanticsProperties.TestTag] }

    @Test
    fun `TC-EDIT-002 편집 화면은 취소 완료 탭 자르기 도구를 copy 문구와 식별자로 보인다`() {
        show(ready())
        rule.onNodeWithTag("photo-edit.root").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.cancel-button").assertIsEnabled().assertTextEquals(copy["edit.top.cancel"])
        rule.onNodeWithTag("photo-edit.done-button").assertIsEnabled().assertTextEquals(copy["edit.top.done"])
        rule.onNodeWithTag("photo-edit.tab-crop").assertTextEquals(copy["edit.tab.crop"])
        rule.onNodeWithTag("photo-edit.tab-adjust").assertTextEquals(copy["edit.tab.adjust"])
        rule.onNodeWithTag("photo-edit.tab-filter").assertTextEquals(copy["edit.tab.filter"])
        rule.onNodeWithTag("photo-edit.preview-image").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.crop-area").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.rotate-button").assertTextEquals(copy["edit.crop.rotate"])
        rule.onNodeWithTag("photo-edit.reset-button").assertTextEquals(copy["edit.crop.reset"])
    }

    @Test
    fun `TC-EDIT-002 처음에는 자르기 탭이 선택되어 있고 조정과 필터 도구는 없다`() {
        show(ready())
        rule.onNodeWithTag("photo-edit.tab-crop").assertIsSelected()
        rule.onNodeWithTag("photo-edit.tab-adjust").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.tab-filter").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.adjust-exposure-slider").assertDoesNotExist()
        rule.onNodeWithTag("photo-edit.filter-original").assertDoesNotExist()
    }

    @Test
    fun `TC-EDIT-002 버튼 탭이 편집 이벤트로 전달된다`() {
        show(ready())
        rule.onNodeWithTag("photo-edit.rotate-button").performClick()
        rule.onNodeWithTag("photo-edit.reset-button").performClick()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        rule.onNodeWithTag("photo-edit.tab-filter").performClick()
        rule.onNodeWithTag("photo-edit.done-button").performClick()
        rule.onNodeWithTag("photo-edit.cancel-button").performClick()
        assertEquals(listOf("rotate", "crop-reset", "tab:ADJUST", "tab:FILTER", "done", "cancel"), events)
    }

    @Test
    fun `TC-EDIT-002 준비되기 전에는 완료를 누를 수 없다`() {
        show(PhotoEditUiState(ready = false))
        rule.onNodeWithTag("photo-edit.root").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.done-button").assertIsNotEnabled()
        rule.onNodeWithTag("photo-edit.cancel-button").assertIsEnabled()
    }

    @Test
    fun `TC-EDIT-008 렌더링 중에는 진행 표시가 보이고 완료 버튼이 잠긴다`() {
        show(ready { copy(busy = true) })
        rule.onNodeWithTag("photo-edit.rendering-indicator").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.done-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-EDIT-008 렌더링 중이 아니면 진행 표시가 없다`() {
        show(ready())
        rule.onNodeWithTag("photo-edit.done-button").assertIsEnabled()
        rule.onNodeWithTag("photo-edit.rendering-indicator").assertDoesNotExist()
        rule.onNodeWithTag("photo-edit.error-dialog").assertDoesNotExist()
    }

    @Test
    fun `TC-EDIT-013 자르기 비율은 원본 자유 1대1 4대5 5대4 3대4 4대3 9대16 16대9 순서이다`() {
        show(ready())
        val expected = listOf(
            "original" to "edit.ratio.original", "free" to "edit.ratio.free", "1-1" to "edit.ratio.1-1",
            "4-5" to "edit.ratio.4-5", "5-4" to "edit.ratio.5-4", "3-4" to "edit.ratio.3-4",
            "4-3" to "edit.ratio.4-3", "9-16" to "edit.ratio.9-16", "16-9" to "edit.ratio.16-9",
        )
        assertEquals(expected.map { "photo-edit.ratio-${it.first}" }, tagsWithPrefix("photo-edit.ratio-"))
        expected.forEach { (suffix, key) -> rule.onNodeWithTag("photo-edit.ratio-$suffix").assertTextEquals(copy[key]) }
    }

    @Test
    fun `TC-EDIT-013 고정 비율은 세로 가로 짝을 모두 제공한다`() {
        show(ready())
        listOf("4-5" to "5-4", "3-4" to "4-3", "9-16" to "16-9").forEach { (portrait, landscape) ->
            rule.onNodeWithTag("photo-edit.ratio-$portrait").assertIsDisplayed()
            rule.onNodeWithTag("photo-edit.ratio-$landscape").assertIsDisplayed()
        }
    }

    @Test
    fun `TC-EDIT-013 처음에는 자유가 선택되어 있고 다른 비율을 누르면 이벤트가 전달된다`() {
        show(ready())
        rule.onNodeWithTag("photo-edit.ratio-free").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-original").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.ratio-4-5").performClick()
        assertEquals(listOf("ratio:R4_5"), events)
    }

    @Test
    fun `TC-EDIT-013 상태의 비율이 선택 표시로 나타난다`() {
        show(ready { copy(aspect = CropAspectRatio.R16_9, fixedAspect = 16.0 / 9.0) })
        rule.onNodeWithTag("photo-edit.ratio-16-9").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-free").assertIsNotSelected()
    }

    @Test
    fun `TC-EDIT-039 필터는 원본 흑백 따뜻하게 차갑게 빈티지 선명하게 6종이 이 순서이다`() {
        show(ready { copy(tab = EditTab.FILTER) })
        val expected = listOf(
            "original" to "edit.filter.original", "mono" to "edit.filter.mono", "warm" to "edit.filter.warm",
            "cool" to "edit.filter.cool", "vintage" to "edit.filter.vintage", "vivid" to "edit.filter.vivid",
        )
        assertEquals(expected.map { "photo-edit.filter-${it.first}" }, tagsWithPrefix("photo-edit.filter-"))
        expected.forEach { (suffix, key) -> rule.onNodeWithTag("photo-edit.filter-$suffix").assertTextEquals(copy[key]) }
        rule.onNodeWithTag("photo-edit.tab-filter").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-free").assertDoesNotExist()
    }

    @Test
    fun `TC-EDIT-039 선택된 필터가 선택 표시로 나타나고 탭하면 이벤트가 전달된다`() {
        show(ready { copy(tab = EditTab.FILTER, filter = PhotoFilter.VINTAGE) })
        rule.onNodeWithTag("photo-edit.filter-vintage").assertIsSelected()
        rule.onNodeWithTag("photo-edit.filter-original").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.filter-vivid").performClick()
        assertEquals(listOf("filter:VIVID"), events)
    }
}
