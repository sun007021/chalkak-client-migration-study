package kr.chalkak.feature.aireview

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.aireview.AiReviewStatus
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.aireview.testing.aiHttpFailure
import kr.chalkak.core.data.aireview.testing.aiInvalidResponse
import kr.chalkak.core.data.aireview.testing.aiNetworkFailure
import kr.chalkak.core.network.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Entry, pill states and who may see AI feedback at all (AIR U halves: 011-019, 040, 045; REQ-AIR-001..017). */
class AiPillStateTest {
    private val processing = AiReviews.processing()

    @Test
    fun `TC-AIR-011 entering sends one GET and never a POST`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        assertEquals(1, e.repo.getCount)
        assertEquals(0, e.repo.postCount)
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-011 while the first GET is open the pill is a disabled Checking and nothing is sent twice`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env { scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.none()), gate = gate)) }
        e.enter()
        assertEquals(AiPill.Checking, e.pill)
        assertEquals("ai.pill.checking", e.pill.copyKey)
        assertEquals("AI 상태 확인중", Copy[e.pill.copyKey!!])
        assertEquals(false, e.pill.enabled)
        e.holder.onPillClicked()
        e.settle()
        assertEquals(AiPill.Checking, e.pill)
        assertNull(e.sheet)
        gate.complete(Unit)
        e.settle()
        assertEquals(AiPill.Request, e.pill)
    }

    @Test
    fun `TC-AIR-012 NONE today shows the request pill and never polls`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        assertEquals(AiPill.Request, e.pill)
        assertEquals("AI 피드백 받기", Copy[e.pill.copyKey!!])
        assertTrue(e.pill.enabled)
        e.elapse(900_000)
        assertEquals(1, e.repo.getCount)
        assertNull(e.state.noticeCopyKey)
    }

    @Test
    fun `TC-AIR-013 PROCESSING shows a disabled analysing pill and polls`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        assertEquals(AiPill.Processing, e.pill)
        assertEquals("AI 분석중", Copy[e.pill.copyKey!!])
        assertEquals(false, e.pill.enabled)
        e.holder.onPillClicked()
        e.settle()
        assertNull(e.sheet)
        e.elapse(3_000)
        assertEquals(2, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-014 COMPLETED shows only the view pill, opens the result sheet and neither polls nor re-requests`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        assertEquals(AiPill.View, e.pill)
        assertEquals("AI 피드백 보기", Copy[e.pill.copyKey!!])
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
        e.holder.onPillClicked()
        e.settle()
        val sheet = assertIs<AiSheet.Result>(e.sheet)
        assertEquals(AiReviews.completed().result?.feedback?.summary, sheet.content.summary)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-015 FAILED with canRequestAgain shows the retry pill and opens the re-request start sheet`() = runTest {
        val e = env { scriptGet(ok(AiReviews.failed(canRequestAgain = true))) }
        e.enter()
        assertEquals(AiPill.Retry, e.pill)
        assertEquals("AI 피드백 재요청", Copy[e.pill.copyKey!!])
        e.holder.onPillClicked()
        e.settle()
        val sheet = assertIs<AiSheet.Start>(e.sheet)
        assertTrue(sheet.retry)
        assertEquals("ai.start.title-retry", sheet.titleCopyKey)
        assertEquals("AI 피드백을 재요청할까요?", Copy[sheet.titleCopyKey])
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-015 FAILED without canRequestAgain shows the failed pill and a sheet that says no more requests`() = runTest {
        val e = env { scriptGet(ok(AiReviews.failed(canRequestAgain = false))) }
        e.enter()
        assertEquals(AiPill.Failed, e.pill)
        assertEquals("AI 피드백 실패", Copy[e.pill.copyKey!!])
        e.holder.onPillClicked()
        e.settle()
        val sheet = assertIs<AiSheet.Failed>(e.sheet)
        assertEquals("ai.failed.no-more", sheet.reasonCopyKey)
        assertEquals("이 사진은 더 이상 AI 피드백을 요청할 수 없어요.", Copy[sheet.reasonCopyKey!!])
        e.elapse(600_000)
        assertEquals(0, e.repo.postCount)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-015 the client never counts requests - the pill follows canRequestAgain only`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.failed(canRequestAgain = true)), ok(AiReviews.failed(canRequestAgain = false)))
        }
        e.enter()
        assertEquals(AiPill.Retry, e.pill)
        e.leave()
        e.reenter()
        assertEquals(AiPill.Failed, e.pill)
    }

    @Test
    fun `TC-AIR-016 a past topic never offers a new request or re-request`() = runTest {
        val failed = env { scriptGet(ok(AiReviews.failed(canRequestAgain = true))) }
        failed.enter(topicDate = YESTERDAY)
        assertEquals(AiPill.Failed, failed.pill)
        failed.holder.onPillClicked()
        failed.settle()
        val sheet = assertIs<AiSheet.Failed>(failed.sheet)
        assertEquals("ai.failed.past", sheet.reasonCopyKey)
        assertEquals("AI 피드백은 오늘 올린 사진만 재요청할 수 있어요.", Copy[sheet.reasonCopyKey!!])
        failed.holder.onStartConfirmed()
        failed.settle()
        assertEquals(0, failed.repo.postCount)
    }

    @Test
    fun `TC-AIR-016 a past topic hides NONE but still shows PROCESSING and COMPLETED`() = runTest {
        val none = env { scriptGet(ok(AiReviews.none())) }
        none.enter(topicDate = YESTERDAY)
        assertEquals(AiPill.Hidden, none.pill)
        none.holder.onPillClicked()
        none.settle()
        assertNull(none.sheet)
        assertEquals(0, none.repo.postCount)

        val running = env { scriptGet(ok(processing)) }
        running.enter(topicDate = YESTERDAY)
        assertEquals(AiPill.Processing, running.pill)
        running.elapse(3_000)
        assertEquals(2, running.repo.getCount)

        val done = env { scriptGet(ok(AiReviews.completed())) }
        done.enter(topicDate = YESTERDAY)
        assertEquals(AiPill.View, done.pill)
    }

    @Test
    fun `TC-AIR-017 without a target (someone else's post or detail not loaded) nothing is sent and no pill shows`() = runTest {
        val e = env()
        e.holder.setTarget(null)
        e.holder.onScreenShown()
        e.settle()
        e.elapse(600_000)
        assertEquals(AiPill.Hidden, e.pill)
        assertEquals(0, e.repo.calls.size)
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(0, e.repo.calls.size)
    }

    @Test
    fun `TC-AIR-017 a guest gets no pill and no AI request even with a target`() = runTest {
        val e = env(userId = null)
        e.enter()
        e.elapse(600_000)
        assertEquals(AiPill.Hidden, e.pill)
        assertEquals(0, e.repo.calls.size)
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(0, e.repo.calls.size)
    }

    @Test
    fun `TC-AIR-017 a GET 404 hides the pill without a message and stops asking`() = runTest {
        val e = env { scriptGet(aiHttpFailure(404, ErrorCode.BUSINESS_ERROR, "게시물을 찾을 수 없습니다.")) }
        e.enter()
        assertEquals(AiPill.Hidden, e.pill)
        assertNull(e.state.toast)
        e.elapse(900_000)
        assertEquals(1, e.repo.getCount)
        assertNull(e.state.toast)
    }

    @Test
    fun `TC-AIR-017 a banned member still reads status and result with GET`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        assertEquals(AiPill.View, e.pill)
        assertEquals(AiReviewStatus.COMPLETED, e.state.review?.status)
    }

    @Test
    fun `TC-AIR-018 home mode keeps a completed result of the same post without a new GET`() = runTest {
        val e = env(refreshCompletedOnShow = false) { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        e.leave()
        e.reenter()
        assertEquals(1, e.repo.getCount)
        assertEquals(AiPill.View, e.pill)
        assertEquals(AiReviewStatus.COMPLETED, e.state.review?.status)
    }

    @Test
    fun `TC-AIR-018 home mode resumes polling for a processing post and keeps showing it`() = runTest {
        val e = env(refreshCompletedOnShow = false) { scriptGet(ok(processing)) }
        e.enter()
        e.leave()
        e.reenter()
        assertEquals(2, e.repo.getCount)
        assertEquals(AiPill.Processing, e.pill)
        e.elapse(3_000)
        assertEquals(3, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-018 home mode drops the previous completed result when the post changes and fetches the new one`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env(refreshCompletedOnShow = false) {
            scriptGet(ok(AiReviews.completed()))
            scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.none()), gate = gate))
        }
        e.enter(POST)
        assertEquals(AiPill.View, e.pill)
        e.holder.setTarget(e.target(OTHER_POST))
        e.settle()
        assertNull(e.state.review)
        assertEquals(AiPill.Checking, e.pill)
        assertEquals(1, e.repo.gets(OTHER_POST).size)
        gate.complete(Unit)
        e.settle()
        assertEquals(AiPill.Request, e.pill)
    }

    @Test
    fun `TC-AIR-019 detail mode re-reads a completed result on every re-entry and never POSTs`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed())) }
        e.enter()
        e.leave()
        e.reenter()
        assertEquals(2, e.repo.getCount)
        assertEquals(0, e.repo.postCount)
        assertEquals(AiPill.View, e.pill)
    }

    @Test
    fun `TC-AIR-019 setting the same target again does not send another GET`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        e.holder.setTarget(e.target())
        e.settle()
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-019 nothing is sent until the screen is shown`() = runTest {
        val e = env()
        e.holder.setTarget(e.target())
        e.settle()
        e.elapse(10_000)
        assertEquals(0, e.repo.calls.size)
        e.holder.onScreenShown()
        e.settle()
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-040 a failed first GET shows the recheck pill with the failure text and a tap sends the GET again`() = runTest {
        val e = env { scriptGet(aiNetworkFailure(), ok(AiReviews.none())) }
        e.enter()
        assertEquals(AiPill.Recheck, e.pill)
        assertEquals("AI 상태 다시 확인", Copy[e.pill.copyKey!!])
        assertTrue(e.pill.enabled)
        assertEquals("ai.error.network", e.state.toast?.copyKey)
        assertEquals("네트워크 연결을 확인해 주세요.", Copy[e.state.toast?.copyKey!!])
        e.holder.onPillClicked()
        assertEquals(AiPill.Checking, e.pill)
        e.settle()
        assertEquals(2, e.repo.getCount)
        assertEquals(AiPill.Request, e.pill)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-040 a 5xx on the first GET says the information could not be loaded`() = runTest {
        val e = env { scriptGet(aiHttpFailure(500, ErrorCode.INTERNAL_ERROR, "서버 오류")) }
        e.enter()
        assertEquals(AiPill.Recheck, e.pill)
        assertEquals("ai.error.load", e.state.toast?.copyKey)
        assertEquals("AI 피드백 정보를 불러오지 못했어요.", Copy[e.state.toast?.copyKey!!])
        assertNull(e.state.toast?.serverMessage)
    }

    @Test
    fun `TC-AIR-004 an invalid response on the first GET is shown as not loadable and polling never starts`() = runTest {
        val e = env { scriptGet(aiInvalidResponse()) }
        e.enter()
        assertEquals(AiPill.Recheck, e.pill)
        assertEquals("ai.error.load", e.state.toast?.copyKey)
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-004 an invalid response keeps the last known state`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed()), aiInvalidResponse()) }
        e.enter()
        e.leave()
        e.reenter()
        assertEquals(AiPill.View, e.pill)
        assertEquals(AiReviewStatus.COMPLETED, e.state.review?.status)
        assertEquals("ai.error.load", e.state.toast?.copyKey)
    }

    @Test
    fun `TC-AIR-040 a toast can be acknowledged and then disappears`() = runTest {
        val e = env { scriptGet(aiNetworkFailure()) }
        e.enter()
        val id = e.state.toast?.id ?: error("toast expected")
        e.holder.onToastShown(id)
        assertNull(e.state.toast)
    }

    @Test
    fun `TC-AIR-045 the request button is judged at tap time - 23-59-59 shows it and midnight hides it`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.clock.set(KST_2359_59)
        e.enter()
        assertEquals(AiPill.Request, e.pill)
        e.clock.set(KST_MIDNIGHT)
        e.holder.onPillClicked()
        e.settle()
        assertNull(e.sheet)
        assertEquals(AiPill.Hidden, e.pill)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-045 an open start sheet cannot POST after midnight`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.clock.set(KST_2359_59)
        e.enter()
        e.holder.onPillClicked()
        assertIs<AiSheet.Start>(e.sheet)
        e.clock.set(KST_MIDNIGHT)
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(0, e.repo.postCount)
        assertNull(e.sheet)
        assertEquals(AiPill.Hidden, e.pill)
    }

    @Test
    fun `TC-AIR-045 a retry after midnight is not sent either`() = runTest {
        val e = env { scriptGet(ok(AiReviews.failed(canRequestAgain = true))) }
        e.clock.set(KST_2359_59)
        e.enter()
        assertEquals(AiPill.Retry, e.pill)
        e.holder.onPillClicked()
        e.clock.set(KST_MIDNIGHT)
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-045 a review already in progress keeps being read after midnight`() = runTest {
        val e = env { scriptGet(ok(processing), ok(processing), ok(AiReviews.completed())) }
        e.clock.set(KST_2359_59)
        e.enter()
        e.clock.set(KST_MIDNIGHT)
        e.elapse(6_000)
        assertEquals(3, e.repo.getCount)
        assertEquals(AiPill.View, e.pill)
    }

    /** Orders of the host's two forwards: target known first, or the screen shown first. Immediate dispatcher = the app's. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun TestScope.immediateHolder(repo: FakeAiReviewRepository) = AiReviewStateHolder(
        scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler) + SupervisorJob()),
        repository = repo,
        user = FakeUser(USER_A_ID),
        calendar = KstCalendar(FakeClock()),
        windowClock = MonotonicClock { testScheduler.currentTime * 1_000_000L },
    )

    @Test
    fun `TC-AIR-011 target then show sends exactly one GET on an immediate dispatcher`() = runTest {
        val repo = FakeAiReviewRepository().apply { scriptGet(ok(AiReviews.none())) }
        val holder = immediateHolder(repo)
        holder.setTarget(AiReviewTarget(POST, TODAY))
        holder.onScreenShown()
        assertEquals(1, repo.getCount)
        assertEquals(0, repo.postCount)
        holder.onCleared()
    }

    @Test
    fun `TC-AIR-011 show then target sends exactly one GET on an immediate dispatcher`() = runTest {
        val repo = FakeAiReviewRepository().apply { scriptGet(ok(AiReviews.none())) }
        val holder = immediateHolder(repo)
        holder.onScreenShown()
        holder.setTarget(AiReviewTarget(POST, TODAY))
        assertEquals(1, repo.getCount)
        holder.onCleared()
    }

    @Test
    fun `TC-AIR-011 visible screen with a target change and a repeated show sends exactly one GET per target`() = runTest {
        val repo = FakeAiReviewRepository().apply { scriptGet(ok(AiReviews.none())) }
        val holder = immediateHolder(repo)
        holder.onScreenShown()
        holder.setTarget(AiReviewTarget(POST, TODAY))
        holder.onScreenShown()
        assertEquals(1, repo.getCount)
        holder.setTarget(AiReviewTarget(OTHER_POST, TODAY))
        holder.onScreenShown()
        assertEquals(1, repo.gets(OTHER_POST).size)
        assertEquals(2, repo.getCount)
        holder.onCleared()
    }
}
