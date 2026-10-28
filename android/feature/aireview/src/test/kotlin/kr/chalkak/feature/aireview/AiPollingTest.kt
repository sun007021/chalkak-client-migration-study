package kr.chalkak.feature.aireview

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.aireview.AiReviewStatus
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.aireview.testing.aiHttpFailure
import kr.chalkak.core.data.aireview.testing.aiNetworkFailure
import kr.chalkak.core.network.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Polling rules of D-03 over virtual time (AIR U halves: 032-039, 041-044, 046; REQ-AIR-025..032). */
class AiPollingTest {
    private val processing = AiReviews.processing()

    @Test
    fun `TC-AIR-033 GET goes out at 3, 6, 9 seconds while PROCESSING lasts`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.elapse(30_000)
        assertEquals(listOf(0L) + (1..10).map { it * 3_000L }, e.repo.getTimes())
    }

    @Test
    fun `TC-AIR-033 a slow answer never runs two GETs at once`() = runTest {
        val e = env {
            scriptGet(ok(processing))
            scriptGet(FakeAiReviewRepository.Step(ok(processing), delayMs = 7_000))
        }
        e.enter()
        e.elapse(120_000)
        assertEquals(1, e.repo.maxConcurrentGets)
        assertTrue(e.repo.getCount >= 3)
    }

    @Test
    fun `TC-AIR-034 the window starts when polling starts - an old requestedAt changes nothing`() = runTest {
        val oldRequestedAt = java.time.Instant.parse("2026-10-26T03:00:00Z")
        val e = env { scriptGet(ok(AiReviews.processing(requestedAt = oldRequestedAt))) }
        e.enter()
        e.elapse(150_000)
        assertEquals(AiPill.Processing, e.pill)
        assertNull(e.state.noticeCopyKey)
        assertEquals(1 + 50, e.repo.getCount)
        e.elapse(150_000)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
    }

    @Test
    fun `TC-AIR-035 299_999 seconds still polls, 300_000 stops with the notice and PROCESSING stays`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.elapse(299_999)
        assertNull(e.state.noticeCopyKey)
        assertEquals(1 + 99, e.repo.getCount)
        e.elapse(1)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        assertEquals("처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요.", kr.chalkak.core.common.testing.Copy[e.state.noticeCopyKey!!])
        assertEquals(AiPill.Processing, e.pill)
        assertEquals(1 + 99, e.repo.getCount)
        assertEquals(3_000L * 99, e.repo.getTimes().last())
        e.elapse(900_000)
        assertEquals(1 + 99, e.repo.getCount)
        assertEquals(0, e.repo.postCount)
        assertEquals(AiPill.Processing, e.pill)
    }

    @Test
    fun `TC-AIR-036 coming back after the window starts with a GET and a fresh 300 second window, without POST`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.elapse(300_000)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        val countBefore = e.repo.getCount
        e.leave()
        e.reenter()
        assertEquals(countBefore + 1, e.repo.getCount)
        assertNull(e.state.noticeCopyKey)
        val restartedAt = e.now
        e.elapse(299_999)
        assertNull(e.state.noticeCopyKey)
        e.elapse(1)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        assertEquals(restartedAt + 300_000, e.now)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-038 COMPLETED ends polling and shows the result pill`() = runTest {
        val e = env { scriptGet(ok(processing), ok(processing), ok(AiReviews.completed())) }
        e.enter()
        e.elapse(6_000)
        assertEquals(AiPill.View, e.pill)
        assertEquals(3, e.repo.getCount)
        e.elapse(600_000)
        assertEquals(3, e.repo.getCount)
        assertNull(e.state.sheet)
    }

    @Test
    fun `TC-AIR-038 FAILED ends polling and shows the failed state`() = runTest {
        val e = env { scriptGet(ok(processing), ok(AiReviews.failed(canRequestAgain = true))) }
        e.enter()
        e.elapse(3_000)
        assertEquals(AiPill.Retry, e.pill)
        e.elapse(600_000)
        assertEquals(2, e.repo.getCount)
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-038 while the server keeps PROCESSING (its own retries) the screen does not change`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        val before = e.state
        e.elapse(30_000)
        assertEquals(before, e.state)
    }

    @Test
    fun `TC-AIR-039 poll errors keep polling, show one message and the result still arrives`() = runTest {
        val e = env {
            scriptGet(
                ok(processing),
                aiHttpFailure(500, ErrorCode.INTERNAL_ERROR),
                aiNetworkFailure(),
                aiHttpFailure(503, ErrorCode.INTERNAL_ERROR),
                ok(AiReviews.completed()),
            )
        }
        val states = collectAll(e.holder.state)
        e.enter()
        e.elapse(12_000)
        assertEquals(AiPill.View, e.pill)
        assertEquals(5, e.repo.getCount)
        val toastIds = states.mapNotNull { it.toast?.id }.distinct()
        assertEquals(1, toastIds.size, "the failure message is shown once")
    }

    @Test
    fun `TC-AIR-039 the pill stays on analysing while polls fail`() = runTest {
        val e = env { scriptGet(ok(processing), aiNetworkFailure()) }
        e.enter()
        e.elapse(60_000)
        assertEquals(AiPill.Processing, e.pill)
        assertEquals("ai.error.network", e.state.toast?.copyKey)
        assertEquals(21, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-039 hiding the screen clears the poll message`() = runTest {
        val e = env { scriptGet(ok(processing), aiNetworkFailure()) }
        e.enter()
        e.elapse(3_000)
        assertNotNull(e.state.toast)
        e.leave()
        assertNull(e.state.toast)
    }

    @Test
    fun `TC-AIR-041 a poll GET 404 makes the pill disappear without a message and stops asking`() = runTest {
        val e = env { scriptGet(ok(processing), aiHttpFailure(404, ErrorCode.BUSINESS_ERROR, "게시물을 찾을 수 없습니다.")) }
        e.enter()
        e.elapse(3_000)
        assertEquals(AiPill.Hidden, e.pill)
        assertNull(e.state.toast)
        e.elapse(900_000)
        assertEquals(2, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-029 a poll GET 401 stops polling and hands over to login`() = runTest {
        val e = env { scriptGet(ok(processing), aiHttpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED)) }
        val effects = collectAll(e.holder.effects)
        e.enter()
        e.elapse(3_000)
        assertEquals(listOf<AiReviewEffect>(AiReviewEffect.LoginRequired), effects.toList())
        e.elapse(900_000)
        assertEquals(2, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-042 leaving stops polling and a poll answer that arrives later changes nothing`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(ok(processing))
            scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate = gate))
        }
        e.enter()
        e.elapse(3_000)
        assertEquals(2, e.repo.getCount)
        e.leave()
        gate.complete(Unit)
        e.settle()
        e.elapse(900_000)
        assertEquals(2, e.repo.getCount)
        assertEquals(AiReviewStatus.PROCESSING, e.state.review?.status)
        assertTrue(e.pill != AiPill.View)
    }

    @Test
    fun `TC-AIR-042 a POST answer that arrives after leaving is dropped and coming back starts with a GET`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(ok(AiReviews.none()), ok(AiReviews.completed()))
            scriptPost(FakeAiReviewRepository.Step(ok(processing), gate = gate))
        }
        e.enter()
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        e.leave()
        gate.complete(Unit)
        e.settle()
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount, "a hidden screen does not poll")
        assertEquals(AiReviewStatus.NONE, e.state.review?.status)
        e.reenter()
        assertEquals(2, e.repo.getCount)
        assertEquals(AiPill.View, e.pill)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-042 coming back from hidden starts a new 300 second window with a GET first`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.elapse(100_000)
        e.leave()
        e.elapse(500_000)
        val before = e.repo.getCount
        e.reenter()
        assertEquals(before + 1, e.repo.getCount)
        val back = e.now
        e.elapse(300_000)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        assertEquals(back + 300_000, e.now)
    }

    @Test
    fun `TC-AIR-043 an older poll answer that arrives after a newer GET does not overwrite the completed result`() = runTest {
        val late = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(FakeAiReviewRepository.Step(ok(processing), gate = late))
            scriptGet(ok(AiReviews.completed()))
        }
        e.enter()
        e.reenter()
        assertEquals(AiPill.View, e.pill)
        late.complete(Unit)
        e.settle()
        assertEquals(AiPill.View, e.pill)
        assertEquals(AiReviewStatus.COMPLETED, e.state.review?.status)
        e.elapse(600_000)
        assertEquals(2, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-044 a late answer for post A does not touch post B`() = runTest {
        val gateA = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate = gateA))
            scriptGet(ok(AiReviews.failed(canRequestAgain = false)))
        }
        e.enter(POST)
        e.holder.setTarget(e.target(OTHER_POST))
        e.settle()
        assertEquals(AiPill.Failed, e.pill)
        gateA.complete(Unit)
        e.settle()
        assertEquals(AiPill.Failed, e.pill)
        assertEquals(AiReviewStatus.FAILED, e.state.review?.status)
        assertEquals(1, e.repo.gets(POST).size)
        assertEquals(1, e.repo.gets(OTHER_POST).size)
    }

    @Test
    fun `TC-AIR-044 after logout and login as someone else the old account's answer is discarded`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env { scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate = gate)) }
        e.enter()
        e.holder.onUserChanged()
        e.settle()
        assertNull(e.state.review)
        gate.complete(Unit)
        e.settle()
        assertNull(e.state.review)
        assertEquals(AiPill.Hidden, e.pill)
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-044 after a user change the new account starts from a clean state with its own target`() = runTest {
        val e = env { scriptGet(ok(AiReviews.completed()), ok(AiReviews.none())) }
        e.enter()
        e.holder.onUserChanged()
        e.settle()
        e.enter()
        assertEquals(AiPill.Request, e.pill)
        assertNull(e.sheet)
    }

    @Test
    fun `TC-AIR-046 polling carries on through a connection loss and the window keeps running`() = runTest {
        val e = env {
            scriptGet(ok(processing), aiNetworkFailure(), aiNetworkFailure(), aiNetworkFailure(), ok(AiReviews.completed()))
        }
        e.enter()
        e.elapse(12_000)
        assertEquals(AiPill.View, e.pill)
        assertEquals(5, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-046 offline time counts against the window`() = runTest {
        val e = env { scriptGet(ok(processing), aiNetworkFailure()) }
        e.enter()
        e.elapse(299_999)
        assertNull(e.state.noticeCopyKey)
        e.elapse(1)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        assertEquals(AiPill.Processing, e.pill)
    }

    @Test
    fun `TC-AIR-013 polling does not start for a hidden screen`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.leave()
        val count = e.repo.getCount
        e.elapse(600_000)
        assertEquals(count, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-038 polling stops for good once the host is cleared`() = runTest {
        val e = env { scriptGet(ok(processing)) }
        e.enter()
        e.holder.onCleared()
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
    }
}
