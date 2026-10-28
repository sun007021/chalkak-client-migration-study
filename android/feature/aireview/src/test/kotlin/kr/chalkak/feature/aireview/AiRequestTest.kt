package kr.chalkak.feature.aireview

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewRepository
import kr.chalkak.core.data.aireview.AiReviewStatus
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kr.chalkak.core.network.ApiResult
import kotlinx.coroutines.test.runCurrent
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

/** Start sheet, POST and everything that can come back from it (AIR U halves: 020, 022-031; REQ-AIR-018..024, 033..036). */
class AiRequestTest {
    private val processing = AiReviews.processing()

    @Test
    fun `TC-AIR-020 the start sheet shows title, three notes and the confirm button`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        e.holder.onPillClicked()
        val sheet = assertIs<AiSheet.Start>(e.sheet)
        assertEquals(false, sheet.retry)
        assertEquals("AI 피드백을 시작할까요?", Copy[sheet.titleCopyKey])
        assertEquals(
            listOf(
                "결과가 나오기까지 몇 분 정도 소요될 수 있어요",
                "앱을 나가도 분석은 계속되니 걱정마세요",
                "분석이 끝나면 알림으로 알려드릴게요",
            ),
            sheet.lineCopyKeys.map { Copy[it] },
        )
        assertEquals("분석 시작하기", Copy[sheet.confirmCopyKey])
    }

    @Test
    fun `TC-AIR-020 closing the start sheet sends no POST and confirming sends exactly one`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        e.holder.onPillClicked()
        e.holder.onSheetDismissed()
        e.settle()
        assertNull(e.sheet)
        assertEquals(AiPill.Request, e.pill)
        e.elapse(600_000)
        assertEquals(0, e.repo.postCount)

        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(1, e.repo.postCount)
        assertNull(e.sheet)
    }

    @Test
    fun `TC-AIR-020 confirming without a sheet open sends nothing`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(0, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-022 POST 202 PROCESSING shows analysing, with a Requesting pill while the answer is open`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(FakeAiReviewRepository.Step(ok(processing), gate = gate))
        }
        e.enter()
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        assertEquals(AiPill.Requesting, e.pill)
        assertEquals("AI 요청중", Copy[e.pill.copyKey!!])
        assertEquals(false, e.pill.enabled)
        e.settle()
        assertEquals(AiPill.Requesting, e.pill)
        gate.complete(Unit)
        e.settle()
        assertEquals(AiPill.Processing, e.pill)
        assertEquals(1, e.repo.postCount)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-032 after POST 202 there is no GET at 2_9 seconds and one at 3_0 seconds`() = runTest {
        val e = env { scriptGet(ok(AiReviews.none())) }
        e.enter()
        e.requestNow()
        assertEquals(1, e.repo.getCount)
        e.elapse(2_900)
        assertEquals(1, e.repo.getCount)
        e.elapse(100)
        assertEquals(2, e.repo.getCount)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-023 repeated taps and confirms while the POST is open send one POST and none afterwards`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(FakeAiReviewRepository.Step(ok(processing), gate = gate))
        }
        e.enter()
        e.holder.onPillClicked()
        repeat(3) { e.holder.onStartConfirmed() }
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        assertEquals(1, e.repo.postCount)
        gate.complete(Unit)
        e.settle()
        repeat(2) { e.holder.onStartConfirmed() }
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-024 POST 200 COMPLETED shows the result pill, does not poll and does not open the sheet`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(ok(AiReviews.completed()))
        }
        e.enter()
        e.requestNow()
        assertEquals(AiPill.View, e.pill)
        assertNull(e.sheet)
        e.elapse(600_000)
        assertEquals(1, e.repo.getCount)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-024 POST 200 FAILED switches to the failed state and opens nothing`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(ok(AiReviews.failed(canRequestAgain = true)))
        }
        e.enter()
        e.requestNow()
        assertEquals(AiPill.Retry, e.pill)
        assertNull(e.sheet)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-025 a re-request opens a 300 second window from the POST, whatever the old requestedAt`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.failed(canRequestAgain = true)))
            scriptPost(ok(processing))
            scriptGet(ok(processing))
        }
        e.enter()
        e.elapse(100_000)
        e.requestNow()
        assertEquals(AiPill.Processing, e.pill)
        val postAt = e.now
        e.elapse(299_999)
        assertNull(e.state.noticeCopyKey)
        e.elapse(1)
        assertEquals("ai.poll.timeout", e.state.noticeCopyKey)
        assertEquals(postAt + 300_000, e.now)
        assertEquals(AiPill.Processing, e.pill)
        assertEquals(1, e.repo.postCount)
        assertTrue(e.repo.getTimes().drop(1).all { it - postAt in 1..299_999 })
    }

    @Test
    fun `TC-AIR-026 POST 400 shows the server message as is, keeps the step and sends nothing again`() = runTest {
        listOf("더 이상 AI 리뷰를 다시 요청할 수 없습니다.", "지금은 AI 리뷰를 요청할 수 없습니다.").forEach { message ->
            val e = env {
                scriptGet(ok(AiReviews.failed(canRequestAgain = true)))
                scriptPost(aiHttpFailure(400, ErrorCode.BUSINESS_ERROR, message))
            }
            e.enter()
            e.requestNow()
            assertEquals(message, e.state.toast?.serverMessage)
            assertNull(e.state.toast?.copyKey)
            assertEquals(AiPill.Retry, e.pill)
            e.elapse(600_000)
            assertEquals(1, e.repo.postCount)
        }
    }

    @Test
    fun `TC-AIR-026 the message is shown even when the wording differs (display only)`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiHttpFailure(400, ErrorCode.BUSINESS_ERROR, "전혀 다른 문장"))
        }
        e.enter()
        e.requestNow()
        assertEquals("전혀 다른 문장", e.state.toast?.serverMessage)
        assertEquals(AiPill.Request, e.pill)
    }

    @Test
    fun `TC-AIR-027 POST 403 shows the restricted-member text and sends no second request`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiHttpFailure(403, ErrorCode.FORBIDDEN, "차단된 회원입니다."))
        }
        e.enter()
        e.requestNow()
        assertEquals("ai.error.banned", e.state.toast?.copyKey)
        assertEquals("이용이 제한되어 AI 피드백을 요청할 수 없어요.", Copy[e.state.toast?.copyKey!!])
        assertEquals(AiPill.Request, e.pill)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-028 POST 404 hides the pill, says the post cannot be checked and stops asking`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiHttpFailure(404, ErrorCode.BUSINESS_ERROR, "게시물을 찾을 수 없습니다."))
        }
        e.enter()
        e.requestNow()
        assertEquals(AiPill.Hidden, e.pill)
        assertEquals("ai.error.not-found", e.state.toast?.copyKey)
        assertEquals("AI 피드백을 확인할 수 없는 게시물이에요.", Copy[e.state.toast?.copyKey!!])
        val before = e.repo.calls.size
        e.elapse(900_000)
        assertEquals(before, e.repo.calls.size)
    }

    @Test
    fun `TC-AIR-029 POST 401 that ends in REAUTHENTICATION_REQUIRED sends the user to login without another request`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiHttpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        }
        val effects = collectAll(e.holder.effects)
        e.enter()
        e.requestNow()
        assertEquals(listOf<AiReviewEffect>(AiReviewEffect.LoginRequired), effects.toList())
        assertEquals("ai.error.login", e.state.toast?.copyKey)
        assertEquals("다시 로그인해 주세요.", Copy[e.state.toast?.copyKey!!])
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-030 a lost POST answer shows the network text, syncs with one GET and never POSTs again`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()), ok(processing))
            scriptPost(aiNetworkFailure())
        }
        e.enter()
        e.requestNow()
        assertEquals("ai.error.network", e.state.toast?.copyKey)
        assertEquals(2, e.repo.getCount)
        assertEquals(AiPill.Processing, e.pill)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-030 when the GET sync says NONE the user may request again by hand but nothing is sent by itself`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiNetworkFailure())
        }
        e.enter()
        e.requestNow()
        assertEquals(AiPill.Request, e.pill)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-031 POST 500 shows the load text, is not retried and the state is synced with GET`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiHttpFailure(500, ErrorCode.INTERNAL_ERROR, "서버 오류"))
        }
        e.enter()
        e.requestNow()
        assertEquals("ai.error.load", e.state.toast?.copyKey)
        assertEquals(AiPill.Request, e.pill)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-031 an invalid POST answer is treated like a 5xx`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(aiInvalidResponse())
        }
        e.enter()
        e.requestNow()
        assertEquals("ai.error.load", e.state.toast?.copyKey)
        e.elapse(600_000)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-031 a defensive POST 409 syncs with GET without a message`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()), ok(processing))
            scriptPost(aiHttpFailure(409, ErrorCode.BUSINESS_ERROR, "이미 처리 중"))
        }
        e.enter()
        e.requestNow()
        assertNull(e.state.toast)
        assertEquals(2, e.repo.getCount)
        assertEquals(AiPill.Processing, e.pill)
        assertEquals(1, e.repo.postCount)
    }

    @Test
    fun `TC-AIR-009 closing the host while a POST is open shows no network error and changes nothing`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val e = env {
            scriptGet(ok(AiReviews.none()))
            scriptPost(FakeAiReviewRepository.Step(aiNetworkFailure(), gate = gate))
        }
        e.enter()
        e.holder.onPillClicked()
        e.holder.onStartConfirmed()
        e.settle()
        e.holder.onCleared()
        val before = e.state
        gate.complete(Unit)
        e.settle()
        e.elapse(600_000)
        assertNull(e.state.toast)
        assertEquals(before.pill, e.state.pill)
        assertEquals(1, e.repo.postCount)
        assertEquals(1, e.repo.getCount)
    }

    @Test
    fun `TC-AIR-009 a repository that throws ends in the normal not-loadable state, not a crash`() = runTest {
        val throwing = object : AiReviewRepository {
            override suspend fun get(postId: String): ApiResult<AiReview> = throw IllegalStateException("boom")
            override suspend fun request(postId: String): ApiResult<AiReview> = throw IllegalStateException("boom")
        }
        val holder = AiReviewStateHolder(
            scope = holderScope(),
            repository = throwing,
            user = FakeUser(USER_A_ID),
            calendar = KstCalendar(FakeClock()),
            windowClock = MonotonicClock { testScheduler.currentTime * 1_000_000L },
        )
        holder.setTarget(AiReviewTarget(POST, TODAY))
        holder.onScreenShown()
        runCurrent()
        assertEquals(AiPill.Recheck, holder.state.value.pill)
        assertEquals("ai.error.load", holder.state.value.toast?.copyKey)
    }

    @Test
    fun `TC-AIR-024 POST COMPLETED status is read from the body, a PROCESSING answer starts polling`() = runTest {
        val e = env {
            scriptGet(ok(AiReviews.none()), ok(AiReviews.completed()))
            scriptPost(ok(processing))
        }
        e.enter()
        e.requestNow()
        assertEquals(AiReviewStatus.PROCESSING, e.state.review?.status)
        e.elapse(3_000)
        assertEquals(AiPill.View, e.pill)
    }
}
