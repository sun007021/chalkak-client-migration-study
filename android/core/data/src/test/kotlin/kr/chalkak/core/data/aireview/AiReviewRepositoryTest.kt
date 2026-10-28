@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.aireview

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import kr.chalkak.core.network.testing.refreshSuccess
import kr.chalkak.core.network.testing.unauthorized
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** `GET|POST /posts/{id}/ai-review` HTTP contract against MockWebServer + shared fixtures (AIR C halves). */
class AiReviewRepositoryTest {
    private val clock = FakeClock()
    private val postId = "22222222-2222-4222-8222-222222222201"
    private val path = api("/posts/$postId/ai-review")

    private class Env(val h: NetHarness, val repo: DefaultAiReviewRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(): Env {
        val h = NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock)
        return Env(h, DefaultAiReviewRepository(h.client))
    }

    private fun get(name: String) = MockResponses.fromFixture("ai-review/ai-review-get__$name.json")
    private fun post(name: String) = MockResponses.fromFixture("ai-review/ai-review-post__$name.json")

    private fun ApiResult<AiReview>.review(): AiReview = assertIs<ApiResult.Success<AiReview>>(this).value

    @Test
    fun `TC-AIR-001 GET and POST use the same path with Authorization and POST has no body`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("none"), post("202-processing"))
            e.repo.get(postId).review()
            e.repo.request(postId).review()
            val (getReq, postReq) = e.h.dispatcher.requests(path)
            assertEquals("GET", getReq.method)
            assertEquals("POST", postReq.method)
            assertEquals(BEARER_1, getReq.getHeader("Authorization"))
            assertEquals(BEARER_1, postReq.getHeader("Authorization"))
            assertEquals(0L, getReq.bodySize)
            assertEquals(0L, postReq.bodySize)
            assertNull(postReq.getHeader("Content-Type"))
        }
    }

    @Test
    fun `TC-AIR-001 a POST whose connection drops is sent once and never replayed`() = runTest {
        env().use { e ->
            repeat(3) { e.h.dispatcher.enqueue(path, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }
            assertIs<ApiError.Network>(e.repo.request(postId).error())
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-AIR-002 NONE has canRequestAgain false and no times or result`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("none"))
            val review = e.repo.get(postId).review()
            assertEquals(AiReviewStatus.NONE, review.status)
            assertEquals(false, review.canRequestAgain)
            assertNull(review.requestedAt)
            assertNull(review.completedAt)
            assertNull(review.result)
        }
    }

    @Test
    fun `TC-AIR-003 COMPLETED is read completely with and without fractional seconds`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("completed"), get("completed-fractional-seconds"))
            val plain = e.repo.get(postId).review()
            assertEquals(AiReviewStatus.COMPLETED, plain.status)
            assertEquals(Instant.parse("2026-10-27T02:58:00Z"), plain.requestedAt)
            assertEquals(Instant.parse("2026-10-27T02:58:21Z"), plain.completedAt)
            val result = assertNotNullResult(plain)
            assertEquals(7.5, result.overallScore)
            assertEquals(listOf(AiCriterion("COMPOSITION", "구도", 7.5)), result.criteria)
            assertTrue(result.distinctivePerspective)
            assertEquals("빛을 따라 시선이 흐르는 안정적인 구도", result.feedback.summary)
            assertEquals("빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.", result.feedback.strength)
            assertEquals("수평선이 살짝 기울어 안정감이 조금 떨어집니다.", result.feedback.weakness)
            assertEquals("카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.", result.feedback.suggestion)

            val fractional = e.repo.get(postId).review()
            assertEquals(Instant.parse("2026-10-27T02:58:00.123Z"), fractional.requestedAt)
            assertEquals(Instant.parse("2026-10-27T02:58:21.123Z"), fractional.completedAt)
        }
    }

    private fun assertNotNullResult(review: AiReview): AiReviewResult = review.result ?: error("result missing")

    @Test
    fun `TC-AIR-004 COMPLETED without a result is an invalid response`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("completed-no-result"))
            assertIs<ApiError.InvalidResponse>(e.repo.get(postId).error())
        }
    }

    @Test
    fun `TC-AIR-004 COMPLETED with an empty feedback item is also invalid (REQ-AIR-045)`() {
        fun response(feedback: AiFeedbackResponse) = AiReviewResponse(
            status = "COMPLETED",
            result = AiReviewResultResponse(7.5, listOf(AiCriterionResponse("COMPOSITION", "구도", 7.5)), true, feedback),
        )
        val ok = AiFeedbackResponse("요약", "좋았던 점", "아쉬운 점", "다음엔")
        assertIs<ApiResult.Success<AiReview>>(AiReviewMapper.toDomain(response(ok)))
        listOf(
            ok.copy(summary = ""),
            ok.copy(strength = ""),
            ok.copy(weakness = ""),
            ok.copy(suggestion = ""),
        ).forEach { assertIs<ApiError.InvalidResponse>(AiReviewMapper.toDomain(response(it)).error()) }
    }

    @Test
    fun `TC-AIR-005 scores of -0_1, 10_1 and NaN are invalid while 0_0 and 10_0 are valid`() = runTest {
        fun response(score: Double, criterionScore: Double = 5.0) = AiReviewResponse(
            status = "COMPLETED",
            result = AiReviewResultResponse(
                score,
                listOf(AiCriterionResponse("COMPOSITION", "구도", criterionScore)),
                false,
                AiFeedbackResponse("요약", "좋았던 점", "아쉬운 점", "다음엔"),
            ),
        )
        listOf(-0.1, 10.1, Double.NaN).forEach { bad ->
            assertIs<ApiError.InvalidResponse>(AiReviewMapper.toDomain(response(bad)).error(), "overall $bad")
            assertIs<ApiError.InvalidResponse>(AiReviewMapper.toDomain(response(5.0, bad)).error(), "criterion $bad")
        }
        listOf(0.0, 10.0).forEach { good ->
            assertIs<ApiResult.Success<AiReview>>(AiReviewMapper.toDomain(response(good)), "overall $good")
            assertIs<ApiResult.Success<AiReview>>(AiReviewMapper.toDomain(response(5.0, good)), "criterion $good")
        }
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("score-out-of-range"), get("completed-score-0"), get("completed-score-10"))
            assertIs<ApiError.InvalidResponse>(e.repo.get(postId).error())
            assertEquals(0.0, assertNotNullResult(e.repo.get(postId).review()).overallScore)
            assertEquals(10.0, assertNotNullResult(e.repo.get(postId).review()).overallScore)
        }
    }

    @Test
    fun `TC-AIR-006 FAILED keeps the server canRequestAgain and a missing field means false`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("failed-can-retry"), get("failed-cannot-retry"), get("missing-can-request-again"))
            val retry = e.repo.get(postId).review()
            assertEquals(AiReviewStatus.FAILED, retry.status)
            assertNull(retry.result)
            assertTrue(retry.canRequestAgain)
            assertEquals(false, e.repo.get(postId).review().canRequestAgain)
            val missing = e.repo.get(postId).review()
            assertEquals(AiReviewStatus.FAILED, missing.status)
            assertEquals(false, missing.canRequestAgain)
        }
    }

    @Test
    fun `TC-AIR-007 an unknown status is an invalid response and so is a result on a non-COMPLETED status`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("unknown-status"))
            assertIs<ApiError.InvalidResponse>(e.repo.get(postId).error())
        }
        val result = AiReviewResultResponse(7.5, emptyList(), false, AiFeedbackResponse("요약", "좋", "아쉬", "다음"))
        listOf("PROCESSING", "NONE", "FAILED").forEach { status ->
            assertIs<ApiError.InvalidResponse>(AiReviewMapper.toDomain(AiReviewResponse(status, result = result)).error(), status)
        }
    }

    @Test
    fun `TC-AIR-008 POST 202 PROCESSING and 200 COMPLETED are both read by status`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, post("202-processing"), post("200-completed"))
            val accepted = e.repo.request(postId).review()
            assertEquals(AiReviewStatus.PROCESSING, accepted.status)
            assertEquals(false, accepted.canRequestAgain)
            val done = e.repo.request(postId).review()
            assertEquals(AiReviewStatus.COMPLETED, done.status)
            assertEquals(7.5, assertNotNullResult(done).overallScore)
        }
    }

    @Test
    fun `TC-AIR-009 400 and 403 keep the HTTP status and the server message and are not retried`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, post("400-limit-reached"), post("403-banned"), post("202-processing"))
            val limit = e.repo.request(postId).httpError()
            assertEquals(400, limit.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, limit.errorCode)
            assertEquals("더 이상 AI 리뷰를 다시 요청할 수 없습니다.", limit.message)
            val banned = e.repo.request(postId).httpError()
            assertEquals(403, banned.status)
            assertEquals(ErrorCode.FORBIDDEN, banned.errorCode)
            assertEquals("차단된 회원입니다.", banned.message)
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-AIR-029 a 401 refreshes once and resends the original POST`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(path) { req ->
                if (req.getHeader("Authorization") == BEARER_2) post("202-processing") else unauthorized()
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(AiReviewStatus.PROCESSING, e.repo.request(postId).review().status)
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-AIR-029 a GET 401 whose refresh is rejected ends as REAUTHENTICATION_REQUIRED`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, unauthorized())
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val error = e.repo.get(postId).httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-AIR-031 POST 500 is sent once without retry or backoff`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, post("500-server-error"), post("202-processing"))
            assertEquals(500, e.repo.request(postId).httpError().status)
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-AIR-030 a POST that gets no answer is sent once`() = runTest {
        env().use { e ->
            repeat(3) { e.h.dispatcher.enqueue(path, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }
            assertIs<ApiError.Network>(e.repo.request(postId).error())
            assertEquals(1, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-AIR-039 a GET 500 is retried with backoff and then reads the completed result`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("500-server-error"), get("completed"))
            assertEquals(AiReviewStatus.COMPLETED, e.repo.get(postId).review().status)
            assertEquals(2, e.h.dispatcher.requests(path).size)
            assertEquals(500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-AIR-047 a GET 503 with Retry-After 1 waits one second of virtual time before the retry`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("503-retry-after"), get("processing"))
            assertEquals(AiReviewStatus.PROCESSING, e.repo.get(postId).review().status)
            assertEquals(2, e.h.dispatcher.requests(path).size)
            assertEquals(1_000L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-AIR-017 a GET 404 is a plain HTTP failure the holder can hide on`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, get("404-not-found"))
            val error = e.repo.get(postId).httpError()
            assertEquals(404, error.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
        }
    }
}
