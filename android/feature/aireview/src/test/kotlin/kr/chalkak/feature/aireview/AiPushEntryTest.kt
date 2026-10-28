package kr.chalkak.feature.aireview

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/**
 * Push entry (`PostDetail(openAiFeedbackSheet = true)` from feature/notification): the sheet opens once, from the latest
 * GET of this entry (AIR U half of TC-AIR-058; REQ-AIR-046..049).
 */
class AiPushEntryTest {
    @Test
    fun `TC-AIR-058 COMPLETED opens the result sheet once after the GET, not before`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env(openSheetOnEntry = true) {
            scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate = gate))
        }
        e.enter()
        assertNull(e.sheet)
        gate.complete(Unit)
        e.settle()
        val sheet = assertIs<AiSheet.Result>(e.sheet)
        assertEquals(AiReviews.completed().result?.feedback?.summary, sheet.content.summary)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-058 FAILED opens the failure sheet (with the no-more reason when canRequestAgain is false)`() = runTest {
        val e = env(openSheetOnEntry = true) { scriptGet(ok(AiReviews.failed(canRequestAgain = false))) }
        e.enter()
        val sheet = assertIs<AiSheet.Failed>(e.sheet)
        assertEquals("ai.failed.no-more", sheet.reasonCopyKey)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-058 FAILED with canRequestAgain also opens the failure sheet (reason text is not specified)`() = runTest {
        val e = env(openSheetOnEntry = true) { scriptGet(ok(AiReviews.failed(canRequestAgain = true))) }
        e.enter()
        assertIs<AiSheet.Failed>(e.sheet)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-058 PROCESSING and NONE open no sheet`() = runTest {
        val running = env(openSheetOnEntry = true) { scriptGet(ok(AiReviews.processing())) }
        running.enter()
        assertNull(running.sheet)
        assertEquals(AiPill.Processing, running.pill)
        running.elapse(3_000)
        assertEquals(2, running.repo.getCount)
        assertNull(running.sheet)

        val none = env(openSheetOnEntry = true) { scriptGet(ok(AiReviews.none())) }
        none.enter()
        assertNull(none.sheet)
        assertEquals(AiPill.Request, none.pill)
    }

    @Test
    fun `TC-AIR-058 a sheet the user closed does not reopen on the same entry, even after coming back`() = runTest {
        val e = env(openSheetOnEntry = true) { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        assertIs<AiSheet.Result>(e.sheet)
        e.holder.onSheetDismissed()
        assertNull(e.sheet)
        e.leave()
        e.reenter()
        assertNull(e.sheet)
        assertEquals(2, e.repo.getCount)
        e.elapse(600_000)
        assertNull(e.sheet)
    }

    @Test
    fun `TC-AIR-058 an ordinary entry never opens a sheet by itself`() = runTest {
        val done = env { scriptGet(ok(AiReviews.completed())) }
        done.enter()
        assertNull(done.sheet)
        val failed = env { scriptGet(ok(AiReviews.failed(canRequestAgain = false))) }
        failed.enter()
        assertNull(failed.sheet)
    }
}
