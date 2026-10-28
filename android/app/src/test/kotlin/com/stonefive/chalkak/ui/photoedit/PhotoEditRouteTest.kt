package com.stonefive.chalkak.ui.photoedit

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FakeEditSource
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.RecordingEditPainter
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.albumPhoto
import com.stonefive.chalkak.testing.assertProgress
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.editHolder
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.setProgress
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.feature.upload.edit.AdjustItem
import kr.chalkak.feature.upload.edit.AutoAdjustments
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditStateHolder
import kr.chalkak.feature.upload.edit.PhotoFilter
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class PhotoEditRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val scope = HolderScope()
    private val source = FakeEditSource(
        auto = AutoAdjustments(exposure = 0.30, contrast = -0.20, highlights = -0.10, shadows = 0.15, blackPoint = 0.05, saturation = 0.10),
    )
    private val painter = RecordingEditPainter()
    private val done = mutableListOf<PhotoEdit>()
    private var cancels = 0
    private lateinit var holder: PhotoEditStateHolder

    @Before
    fun setUp() {
        holder = editHolder(scope, source)
    }

    @After
    fun tearDown() = scope.close()

    private fun show() {
        rule.setContent {
            TestApp(copy) {
                PhotoEditRoute(holder, albumPhoto(), painter, onDone = { done += it }, onCancel = { cancels++ })
            }
        }
        rule.waitForIdle()
    }

    private val sliderItems = listOf(
        AdjustItem.EXPOSURE to "exposure", AdjustItem.CONTRAST to "contrast", AdjustItem.HIGHLIGHTS to "highlights",
        AdjustItem.SHADOWS to "shadows", AdjustItem.BLACK_POINT to "black-point", AdjustItem.SATURATION to "saturation",
        AdjustItem.WARMTH to "warmth",
    )

    private fun slider(name: String) = rule.onNodeWithTag("photo-edit.adjust-$name-slider")

    @Test
    fun `TC-EDIT-002 탭을 옮기면 선택 표시가 바뀌고 해당 도구만 보인다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-crop").assertIsSelected()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        rule.onNodeWithTag("photo-edit.tab-adjust").assertIsSelected()
        rule.onNodeWithTag("photo-edit.tab-crop").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.rotate-button").assertDoesNotExist()
        slider("exposure").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.tab-filter").performClick()
        rule.onNodeWithTag("photo-edit.tab-filter").assertIsSelected()
        rule.onNodeWithTag("photo-edit.filter-original").assertIsDisplayed()
        slider("exposure").assertDoesNotExist()
    }

    @Test
    fun `TC-EDIT-002 취소를 누르면 렌더링 없이 취소 콜백만 불린다`() {
        show()
        rule.onNodeWithTag("photo-edit.cancel-button").performClick()
        rule.waitForIdle()
        assertEquals(1, cancels)
        assertTrue(done.isEmpty())
        assertTrue(source.renders.isEmpty())
    }

    @Test
    fun `TC-EDIT-008 렌더링에 실패하면 편집기를 닫지 않고 오류 알림을 보인다`() {
        source.failRenders = 1
        show()
        rule.onNodeWithTag("photo-edit.done-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.error-dialog").assertIsDisplayed().assertShowsAll(copy["edit.error.render"])
        rule.onNodeWithTag("photo-edit.root").assertIsDisplayed()
        assertTrue(done.isEmpty())
        assertEquals(0, cancels)
        rule.onNodeWithTag("photo-edit.rendering-indicator").assertDoesNotExist()
    }

    @Test
    fun `TC-EDIT-008 알림을 확인한 뒤 완료를 다시 누르면 재시도해 편집값을 돌려준다`() {
        source.failRenders = 1
        show()
        rule.onNodeWithTag("photo-edit.done-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.error-dialog-confirm-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.error-dialog").assertDoesNotExist()
        assertNull(holder.state.value.toast)
        rule.onNodeWithTag("photo-edit.done-button").assertIsEnabled().performClick()
        rule.waitForIdle()
        assertEquals(2, source.renders.size)
        assertEquals(1, done.size)
        assertEquals(PhotoEdit.IDENTITY, done.single())
    }

    @Test
    fun `TC-EDIT-008 렌더링 중에는 진행 표시가 보이고 완료 버튼이 잠기며 끝나면 사라진다`() {
        val gate = CompletableDeferred<Unit>()
        source.renderGate = gate
        show()
        rule.onNodeWithTag("photo-edit.done-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.rendering-indicator").assertIsDisplayed()
        rule.onNodeWithTag("photo-edit.done-button").assertIsNotEnabled()
        gate.complete(Unit)
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.rendering-indicator").assertDoesNotExist()
        assertEquals(1, done.size)
    }

    @Test
    fun `TC-EDIT-013 비율을 고르면 그 비율이 선택 표시되고 이전 선택은 풀린다`() {
        show()
        rule.onNodeWithTag("photo-edit.ratio-free").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-4-5").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.ratio-4-5").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-free").assertIsNotSelected()
        rule.onNodeWithTag("photo-edit.ratio-original").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.ratio-original").assertIsSelected()
        rule.onNodeWithTag("photo-edit.ratio-4-5").assertIsNotSelected()
    }

    @Test
    fun `TC-EDIT-023 조정 탭에는 일곱 항목과 자동 항목이 있고 처음 값은 0이며 자동은 꺼져 있다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        sliderItems.forEach { (item, name) ->
            slider(name).assertIsDisplayed().assertProgress(0f, -100f..100f)
            assertLabelShown(item)
        }
        assertLabelShown(AdjustItem.AUTO)
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").assertIsOff()
        rule.onNodeWithTag("photo-edit.adjust-auto-strength-slider").assertProgress(0f, 0f..1f)
        rule.onNodeWithTag("photo-edit.reset-button").assertTextEquals(copy["edit.adjust.reset"])
    }

    @Test
    fun `TC-EDIT-023 자동을 켜면 분석값 곱하기 강도가 표시값 곱하기 100으로 슬라이더에 나타난다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").assertIsOn()
        rule.onNodeWithTag("photo-edit.adjust-auto-strength-slider").assertProgress(1f, 0f..1f)
        slider("exposure").assertProgress(30f, -100f..100f)
        slider("contrast").assertProgress(-20f, -100f..100f)
        slider("highlights").assertProgress(-10f, -100f..100f)
        slider("shadows").assertProgress(15f, -100f..100f)
        slider("black-point").assertProgress(5f, -100f..100f)
        slider("saturation").assertProgress(10f, -100f..100f)
        slider("warmth").assertProgress(0f, -100f..100f) // never set automatically
    }

    @Test
    fun `TC-EDIT-023 슬라이더를 움직이면 편집값이 -1에서 1 사이 실수로 바뀌고 직접 만진 값은 자동을 꺼도 남는다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").performClick()
        slider("exposure").setProgress(50f)
        rule.waitForIdle()
        assertTrue(abs(holder.state.value.adjustments.effective(AdjustItem.EXPOSURE) - 0.5) < 1e-9)
        slider("exposure").assertProgress(50f, -100f..100f)
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").performClick() // auto off
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").assertIsOff()
        slider("exposure").assertProgress(50f, -100f..100f)
        slider("contrast").assertProgress(0f, -100f..100f)
    }

    @Test
    fun `TC-EDIT-023 슬라이더 범위를 넘는 값은 -100에서 100으로 제한된다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        slider("warmth").setProgress(100f)
        rule.waitForIdle()
        assertEquals(1.0, holder.state.value.adjustments.effective(AdjustItem.WARMTH))
        slider("warmth").setProgress(-100f)
        rule.waitForIdle()
        assertEquals(-1.0, holder.state.value.adjustments.effective(AdjustItem.WARMTH))
        slider("warmth").assertProgress(-100f, -100f..100f)
    }

    @Test
    fun `TC-EDIT-023 조정 초기화는 자동을 끄고 직접 만진 값을 모두 0으로 돌린다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-adjust").performClick()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").performClick()
        slider("saturation").setProgress(-40f)
        rule.onNodeWithTag("photo-edit.reset-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.adjust-auto-toggle").assertIsOff()
        sliderItems.forEach { (_, name) -> slider(name).assertProgress(0f, -100f..100f) }
    }

    @Test
    fun `TC-EDIT-039 필터를 고르면 선택 표시가 바뀌고 미리보기가 그 필터의 편집값으로 다시 그려진다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-filter").performClick()
        rule.onNodeWithTag("photo-edit.filter-original").assertIsSelected()
        assertEquals(PhotoFilter.ORIGINAL, painter.lastEdit?.filter)
        rule.onNodeWithTag("photo-edit.filter-vivid").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("photo-edit.filter-vivid").assertIsSelected()
        rule.onNodeWithTag("photo-edit.filter-original").assertIsNotSelected()
        assertEquals(PhotoFilter.VIVID, painter.lastEdit?.filter)
        assertEquals(PhotoFilter.VIVID, holder.state.value.filter)
    }

    @Test
    fun `TC-EDIT-039 필터를 고르고 완료하면 그 필터가 편집값으로 확정된다`() {
        show()
        rule.onNodeWithTag("photo-edit.tab-filter").performClick()
        rule.onNodeWithTag("photo-edit.filter-mono").performClick()
        rule.onNodeWithTag("photo-edit.done-button").performClick()
        rule.waitForIdle()
        assertEquals(PhotoFilter.MONO, done.single().filter)
    }

    private fun assertLabelShown(item: AdjustItem) =
        assertTrue(rule.onAllNodesWithText(copy[item.copyKey]).fetchSemanticsNodes().isNotEmpty(), "label of $item")
}
