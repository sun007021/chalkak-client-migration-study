package kr.chalkak.feature.aireview

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.aireview.AiCriterion
import kr.chalkak.core.data.aireview.AiFeedback
import kr.chalkak.core.data.aireview.testing.AiReviews
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Result sheet content, criteria dialog and failure sheet (AIR JVM halves of 010, 049-054; REQ-AIR-037..041). */
class AiResultSheetTest {
    private fun ui(review: kr.chalkak.core.data.aireview.AiReview = AiReviews.completed()) =
        AiResultUi.from(requireNotNull(review.result))

    @Test
    fun `TC-AIR-049 the sheet holds summary, one-decimal score, criteria and the three sections in order`() {
        val content = ui()
        assertEquals("빛을 따라 시선이 흐르는 안정적인 구도", content.summary)
        assertEquals("7.5", content.scoreText)
        assertEquals(listOf(AiCriterionRow("구도", "7.5")), content.criteria)
        assertEquals(
            listOf("ai.result.strength", "ai.result.weakness", "ai.result.suggestion"),
            content.sections.map { it.titleCopyKey },
        )
        assertEquals(listOf("좋았던 점", "아쉬운 점", "다음엔 이렇게"), content.sections.map { Copy[it.titleCopyKey] })
        assertEquals(
            listOf(AiReviews.FEEDBACK.strength, AiReviews.FEEDBACK.weakness, AiReviews.FEEDBACK.suggestion),
            content.sections.map { it.body },
        )
    }

    @Test
    fun `TC-AIR-049 scores are shown with one decimal as the server sent them`() {
        assertEquals("7.5", AiScoreFormat.format(7.5))
        assertEquals("10.0", AiScoreFormat.format(10.0))
        assertEquals("0.0", AiScoreFormat.format(0.0))
        assertEquals("8.0", AiScoreFormat.format(8.0))
        assertEquals("6.3", AiScoreFormat.format(6.3))
    }

    @Test
    fun `TC-AIR-049 the decimal separator does not follow the device locale`() {
        withDevice(languageTag = "de-DE") {
            assertEquals("7.5", AiScoreFormat.format(7.5))
            assertEquals("7.5", ui().scoreText)
        }
    }

    @Test
    fun `TC-AIR-049 the overall score is shown as sent, never recomputed from the criteria`() {
        val content = ui(
            AiReviews.completed(
                score = 4.0,
                criteria = listOf(AiCriterion("A", "구도", 9.0), AiCriterion("B", "색감", 9.0)),
            ),
        )
        assertEquals("4.0", content.scoreText)
        assertEquals(listOf("9.0", "9.0"), content.criteria.map { it.scoreText })
    }

    @Test
    fun `TC-AIR-010 criteria are listed in server order whatever their number`() {
        val none = ui(AiReviews.completed(criteria = emptyList()))
        assertEquals(emptyList(), none.criteria)
        val three = ui(
            AiReviews.completed(
                criteria = listOf(AiCriterion("C", "구도", 7.5), AiCriterion("L", "빛", 6.0), AiCriterion("T", "주제", 10.0)),
            ),
        )
        assertEquals(listOf("구도" to "7.5", "빛" to "6.0", "주제" to "10.0"), three.criteria.map { it.label to it.scoreText })
    }

    @Test
    fun `TC-AIR-010 limit-length texts are passed through whole`() {
        val feedback = AiFeedback("가".repeat(60), "나".repeat(150), "다".repeat(150), "라".repeat(150))
        val content = ui(AiReviews.completed(feedback = feedback))
        assertEquals(60, content.summary.length)
        assertEquals(listOf(150, 150, 150), content.sections.map { it.body.length })
    }

    @Test
    fun `TC-AIR-050 the accessibility text says the score out of ten`() {
        val content = ui()
        val label = Copy[content.scoreA11yCopyKey].replace("{X}", content.scoreText)
        assertEquals("전체 점수 10점 만점에 7.5점", label)
    }

    @Test
    fun `TC-AIR-051 the badge shows only when distinctivePerspective is true`() {
        assertTrue(ui(AiReviews.completed(distinctive = true)).showPerspectiveBadge)
        assertFalse(ui(AiReviews.completed(distinctive = false)).showPerspectiveBadge)
        assertEquals("작가님의 해석이 돋보이는 작품이에요", Copy["ai.result.perspective-badge"])
    }

    @Test
    fun `TC-AIR-052 the criteria dialog opens over the result sheet and closes without closing it`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        e.holder.onPillClicked()
        assertIs<AiSheet.Result>(e.sheet)
        assertFalse(e.state.criteriaDialogOpen)
        e.holder.onCriteriaHelpClicked()
        assertTrue(e.state.criteriaDialogOpen)
        assertEquals("찰칵AI는 어떤 기준으로 점수를 내나요?", Copy["ai.result.criteria-dialog-title"])
        e.holder.onCriteriaHelpDismissed()
        assertFalse(e.state.criteriaDialogOpen)
        assertIs<AiSheet.Result>(e.sheet)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-052 closing the sheet closes the dialog and the dialog cannot open without a result sheet`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        e.holder.onCriteriaHelpClicked()
        assertFalse(e.state.criteriaDialogOpen)
        e.holder.onPillClicked()
        e.holder.onCriteriaHelpClicked()
        e.holder.onSheetDismissed()
        assertNull(e.sheet)
        assertFalse(e.state.criteriaDialogOpen)
    }

    @Test
    fun `TC-AIR-053 the failure sheet says it could not be generated and has one confirm button`() = runTest {
        val e = env { scriptGet(ok(AiReviews.failed(canRequestAgain = false))) }
        e.enter()
        e.holder.onPillClicked()
        val sheet = assertIs<AiSheet.Failed>(e.sheet)
        assertEquals("AI 피드백을 생성하지 못했어요", Copy[sheet.titleCopyKey])
        assertEquals("확인", Copy[sheet.confirmCopyKey])
        e.holder.onSheetDismissed()
        assertNull(e.sheet)
        assertEquals(AiPill.Failed, e.pill)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-054 no AI copy string says AI 리뷰 (server messages are shown as sent, outside this table)`() {
        val table = Json.parseToJsonElement(File(Fixtures.sharedDir, "copy/ko.json").readText(Charsets.UTF_8)).jsonObject
        val aiKeys = table.keys.filter { it.startsWith("ai.") }
        assertTrue(aiKeys.isNotEmpty())
        aiKeys.forEach { key ->
            assertFalse(table.getValue(key).jsonPrimitive.content.contains("AI 리뷰"), key)
        }
    }

    @Test
    fun `TC-AIR-054 every copy key the pill and sheets expose exists in ko_json`() {
        val keys = AiPill.entries.mapNotNull { it.copyKey } +
            AiSheet.Start(false).let { listOf(it.titleCopyKey, it.confirmCopyKey) + it.lineCopyKeys } +
            AiSheet.Start(true).titleCopyKey +
            AiSheet.Failed(null).let { listOf(it.titleCopyKey, it.confirmCopyKey) }
        keys.forEach { assertTrue(Copy[it].isNotEmpty(), it) }
    }
}
