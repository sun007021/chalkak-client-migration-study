package kr.chalkak.feature.record

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.display.FeedEntry
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Selected-day panel, opening feed / exhibition, deletion, requested date, image saving. */
class RecordActionsTest {

    // ---- panel: APPROVED vs PENDING ----------------------------------------------------------------

    @Test
    fun `TC-REC-034 an APPROVED photo has both actions and no badge`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        val panel = r.s.panel!!
        assertEquals(POST_OCT_20, panel.post.postId)
        assertEquals(true, panel.actionsVisible)
        assertEquals(false, panel.pendingBadge)
        assertEquals("피드에서 보기", Copy["record.action.feed"])
        assertEquals("전시 보러가기", Copy["record.action.display"])
    }

    @Test
    fun `TC-REC-034 view in feed opens my post with the thumbnail as the seed`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        r.holder.onOpenFeed()
        advanceUntilIdle()
        val expected = FeedEntry.FromRecord(
            postId = POST_OCT_20,
            thumbnailUrl = "https://cdn.example.test/posts/$POST_OCT_20/thumbnail.webp",
        )
        assertEquals(listOf<RecordEffect>(RecordEffect.OpenFeed(expected)), r.nonToastEffects)
    }

    @Test
    fun `TC-REC-034 to the exhibition opens that photo's topic date`() = runTest {
        val r = rig()
        show(r)
        r.holder.onOpenDisplay() // default selection = 10-31
        advanceUntilIdle()
        assertEquals(listOf<RecordEffect>(RecordEffect.OpenDisplay(D_OCT_31)), r.nonToastEffects)
    }

    @Test
    fun `TC-REC-034 coming back from the feed keeps month and day and asks the server again`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.holder.onDateSelected(D_SEP_17)
        r.holder.onOpenFeed()
        advanceUntilIdle()
        val calls = r.repo.calendarCallsFor(SEP)

        r.holder.onScreenGone()
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(SEP, r.s.month)
        assertEquals(D_SEP_17, r.s.selectedDate)
        assertEquals(calls + 1, r.repo.calendarCallsFor(SEP))
    }

    @Test
    fun `TC-REC-035 a PENDING photo shows the badge and no actions and the actions do nothing`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_27)
        val panel = r.s.panel!!
        assertEquals(true, panel.pendingBadge)
        assertEquals(false, panel.actionsVisible)
        assertEquals("사진 반영 중", Copy["record.pending.badge"])

        r.holder.onOpenFeed()
        r.holder.onOpenDisplay()
        advanceUntilIdle()
        assertTrue(r.nonToastEffects.isEmpty())
        assertEquals(1, r.repo.calendarCalls.size, "no further request, in particular no detail call")
    }

    @Test
    fun `TC-REC-035 the badge toggles the tooltip and its accessibility label`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_27)
        assertEquals(false, r.s.panel!!.hintOpen)
        assertEquals("자세한 안내 보기", Copy[r.s.panel!!.hintLabelCopyKey!!])

        r.holder.onPendingBadgeTapped()
        assertEquals(true, r.s.panel!!.hintOpen)
        assertEquals("자세한 안내 닫기", Copy[r.s.panel!!.hintLabelCopyKey!!])
        assertEquals("사진을 반영하고 있어요.\n표시되기까지 조금 시간이 걸릴 수도 있어요!", Copy["record.pending.tooltip"])

        r.holder.onPendingBadgeTapped()
        assertEquals(false, r.s.panel!!.hintOpen)
    }

    @Test
    fun `TC-REC-035 an APPROVED photo has no badge to tap`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        r.holder.onPendingBadgeTapped()
        assertEquals(false, r.s.panel!!.hintOpen)
        assertNull(r.s.panel!!.hintLabelCopyKey)
    }

    // ---- deletion (REQ-REC-027..029) ---------------------------------------------------------------

    @Test
    fun `TC-REC-024 a deleted photo's cell empties at once and the selection moves to the newest remaining day`() = runTest {
        val r = rig()
        show(r)
        assertEquals(D_OCT_31, r.s.selectedDate)

        r.changes.markRemoved(POST_OCT_31)
        advanceUntilIdle()
        assertNull(r.post(D_OCT_31))
        assertEquals(D_OCT_27, r.s.selectedDate)
    }

    @Test
    fun `TC-REC-024 a late revalidation that still contains the deleted post does not bring it back`() = runTest {
        val r = rig()
        show(r)
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }
        r.holder.onShown()
        runCurrent()

        r.changes.markRemoved(POST_OCT_31)
        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10.json")))
        advanceUntilIdle()
        assertNull(r.post(D_OCT_31))
        assertEquals(2, r.posts.size)
    }

    @Test
    fun `TC-REC-024 a cached month revisited later does not show the deleted photo`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.changes.markRemoved(POST_OCT_20)
        r.holder.onNextMonth()
        advanceUntilIdle()
        assertNull(r.post(D_OCT_20))
        assertEquals(2, r.posts.size)
    }

    @Test
    fun `TC-REC-024 deleting the last photo of the month leaves no selection and the month stays selectable`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.changes.markRemoved(POST_SEP_17)
        r.changes.markRemoved(POST_SEP_30)
        advanceUntilIdle()
        assertNull(r.s.selectedDate)
        assertNull(r.s.panel)
        assertTrue(SEP in r.s.availableMonths, "the list is trimmed by the next server answer, not by the client")

        // Deleting everything in the current month keeps it selectable too.
        r.holder.onNextMonth()
        advanceUntilIdle()
        listOf(POST_OCT_20, POST_OCT_27, POST_OCT_31).forEach(r.changes::markRemoved)
        advanceUntilIdle()
        assertTrue(OCT in r.s.availableMonths)
        assertTrue(r.posts.isEmpty())
    }

    @Test
    fun `TC-REC-024 a server answer without the deleted post is the same as filtering it`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) }
        show(r)
        r.changes.markRemoved(POST_OCT_27)
        advanceUntilIdle()
        assertEquals(2, r.posts.size)
        assertEquals(D_OCT_31, r.s.selectedDate)
    }

    // ---- requested date from home (REQ-REC-032) ----------------------------------------------------

    @Test
    fun `TC-REC-025 opened with a previous-month date selects that month and day, not the newest photo`() = runTest {
        val r = rig()
        show(r, requestedDate = D_SEP_17)
        assertEquals(SEP, r.s.month)
        assertEquals(D_SEP_17, r.s.selectedDate)
        assertEquals(POST_SEP_17, r.s.panel?.post?.postId)

        r.holder.onForeground()
        advanceUntilIdle()
        assertEquals(D_SEP_17, r.s.selectedDate, "kept by the revalidation")
    }

    @Test
    fun `TC-REC-025 a month seen before shows the requested day from the cache before the answer arrives`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.holder.onNextMonth()
        advanceUntilIdle()
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }

        r.holder.onShown(requestedDate = D_SEP_17)
        runCurrent()
        assertEquals(SEP, r.s.month)
        assertEquals(D_SEP_17, r.s.panel?.post?.topicDate)
        assertEquals(RecordPhase.Content, r.s.phase)
    }

    @Test
    fun `TC-REC-025 a request for the month that is already loading is not sent twice`() = runTest {
        val r = rig()
        show(r)
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }
        r.holder.onPreviousMonth()
        runCurrent()
        assertEquals(1, r.repo.calendarCallsFor(SEP))

        r.holder.onShown(requestedDate = D_SEP_17)
        runCurrent()
        assertEquals(1, r.repo.calendarCallsFor(SEP))

        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-09.json")))
        advanceUntilIdle()
        assertEquals(D_SEP_17, r.s.selectedDate)
    }

    /**
     * Catalog: "다른 날짜의 사진을 대신 열지 않는다"; spec REQ-REC-032: "기본 선택(REQ-REC-031)을 따른다". Both agree that the
     * requested (deleted) day itself is not selected; what is selected instead is left open (see the report).
     */
    @Test
    fun `TC-REC-026 a requested day whose photo was deleted is not selected`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) }
        show(r, requestedDate = D_OCT_27)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertNotEquals(D_OCT_27, r.s.selectedDate)
        assertNull(r.post(D_OCT_27))
    }

    @Test
    fun `TC-REC-026 after a failed first load the retry still selects the requested day`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__500-server-error.json") }
        show(r, requestedDate = D_OCT_20)
        assertEquals(RecordPhase.Error, r.s.phase)

        r.repo.calendarHandler = { ok(RecordFixtureModels.calendarFor(it)) }
        r.holder.onRetry()
        advanceUntilIdle()
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(D_OCT_20, r.s.selectedDate)
    }

    // ---- save as image (REQ-REC-037..039) ----------------------------------------------------------

    @Test
    fun `TC-REC-038 saving renders the shown month and stores chalkak-calendar-2026-10 png with one success toast`() = runTest {
        val r = rig()
        show(r)
        r.holder.onSaveImage()
        advanceUntilIdle()

        assertEquals(listOf(OCT), r.renderer.calls.toList())
        val (name, bytes) = r.saver.calls.single()
        assertEquals("chalkak-calendar-2026-10.png", name)
        assertContentEquals(r.renderer.bytes, bytes)
        assertEquals(listOf("달력을 이미지로 저장했어요"), r.toastTexts)
        assertEquals(false, r.s.saving)
    }

    @Test
    fun `TC-REC-038 the file name follows the month being shown`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.holder.onSaveImage()
        advanceUntilIdle()
        assertEquals("chalkak-calendar-2026-09.png", r.saver.calls.single().first)
    }

    @Test
    fun `TC-REC-039 a denied permission and a failed write each show their own toast and the holder keeps working`() = runTest {
        val r = rig()
        show(r)
        r.saver.handler = { SaveOutcome.PermissionDenied }
        r.holder.onSaveImage()
        advanceUntilIdle()
        r.saver.handler = { SaveOutcome.Failed }
        r.holder.onSaveImage()
        advanceUntilIdle()
        assertEquals(listOf("이미지 저장 권한이 필요해요", "이미지 저장에 실패했어요"), r.toastTexts)
        assertEquals(false, r.s.saving)
        assertEquals(RecordPhase.Content, r.s.phase)
    }

    @Test
    fun `TC-REC-039 a saver that throws is a failure toast and not a crash`() = runTest {
        val r = rig()
        show(r)
        r.saver.handler = { throw IllegalStateException("disk") }
        r.holder.onSaveImage()
        advanceUntilIdle()
        assertEquals(listOf("이미지 저장에 실패했어요"), r.toastTexts)
        assertEquals(false, r.s.saving)
    }

    @Test
    fun `TC-REC-040 tapping save repeatedly while one save runs saves once`() = runTest {
        val r = rig()
        show(r)
        val gate = Gate<SaveOutcome>()
        r.saver.handler = { gate.await() }
        r.holder.onSaveImage()
        runCurrent()
        assertEquals(true, r.s.saving)
        r.holder.onSaveImage()
        r.holder.onSaveImage()
        runCurrent()
        assertEquals(1, r.saver.calls.size)

        gate.complete(SaveOutcome.Saved)
        advanceUntilIdle()
        assertEquals(1, r.saver.calls.size)
        assertEquals(1, r.toasts.size)
        assertEquals(false, r.s.saving)
    }

    @Test
    fun `TC-REC-039 a save that finishes after the screen was left shows no toast even if the adapter ignores cancellation`() = runTest {
        val r = rig()
        show(r)
        val gate = Gate<SaveOutcome>()
        r.saver.handler = { withContext(NonCancellable) { gate.await() } }
        r.holder.onSaveImage()
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(SaveOutcome.Saved)
        advanceUntilIdle()
        assertEquals(emptyList(), r.toasts)
        assertEquals(false, r.s.saving)
    }

    @Test
    fun `TC-REC-040 the end of a cancelled save does not clear the saving flag of the next save`() = runTest {
        val r = rig()
        show(r)
        val first = Gate<SaveOutcome>()
        val second = Gate<SaveOutcome>()
        r.saver.handler = { withContext(NonCancellable) { first.await() } }
        r.holder.onSaveImage()
        runCurrent()
        r.holder.onScreenGone()
        r.holder.onShown()
        advanceUntilIdle()
        r.saver.handler = { second.await() }
        r.holder.onSaveImage()
        runCurrent()
        first.complete(SaveOutcome.Saved)
        runCurrent()
        assertEquals(true, r.s.saving)
        assertEquals(emptyList(), r.toasts)

        second.complete(SaveOutcome.Saved)
        advanceUntilIdle()
        assertEquals(false, r.s.saving)
        assertEquals(1, r.toasts.size)
    }
}
