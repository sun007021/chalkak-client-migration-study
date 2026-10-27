@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.settings

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
import kotlin.test.assertTrue

/** `POST /feedbacks` HTTP contract against MockWebServer + shared fixtures (FDBK C halves). */
class FeedbackRepositoryTest {
    private val clock = FakeClock()
    private val path = api("/feedbacks")

    private class Env(val h: NetHarness, val repo: DefaultFeedbackRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.User(TestSessions.user(clock))): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultFeedbackRepository(h.client))
    }

    private fun fixture(name: String) = MockResponses.fromFixture("feedback/feedbacks__$name.json")

    private fun sentBody(e: Env, index: Int = 0) =
        Json.parseToJsonElement(e.h.dispatcher.requests(path)[index].body.readUtf8()).jsonObject

    @Test
    fun `TC-FDBK-015 POST sends only content as JSON with Bearer and a JSON content type`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("created"))
            assertIs<ApiResult.Success<FeedbackReceipt>>(e.repo.send("좋아요"))
            val req = e.h.dispatcher.requests(path).single()
            assertEquals("POST", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            assertTrue(req.getHeader("Content-Type").orEmpty().startsWith("application/json"))
            val json = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
            assertEquals(setOf("content"), json.keys)
            assertEquals("좋아요", json.getValue("content").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-FDBK-016 201 is decoded into feedbackId and a UTC createdAt`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("created"))
            val receipt = assertIs<ApiResult.Success<FeedbackReceipt>>(e.repo.send("x")).value
            assertEquals("12121212-1212-4121-8121-121212121201", receipt.feedbackId)
            assertEquals(Instant.parse("2026-10-27T03:00:00Z"), receipt.createdAt)
        }
    }

    @Test
    fun `TC-FDBK-008 the repository sends the content exactly as the holder trimmed it`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("created"))
            val trimmed = "가".repeat(1000)
            e.repo.send(trimmed)
            assertEquals(trimmed, sentBody(e).getValue("content").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-FDBK-012 inner newlines and runs of spaces are kept verbatim`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("created"))
            val content = "첫 줄\n\n  둘째   줄\t끝"
            e.repo.send(content)
            assertEquals(content, sentBody(e).getValue("content").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-FDBK-021 400 BUSINESS_ERROR keeps its errorCode and the server message for display only`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("bad-request-blank"), fixture("bad-request-too-long"))
            val blank = e.repo.send("a").httpError()
            assertEquals(400, blank.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, blank.errorCode)
            assertEquals("피드백 내용이 필요합니다.", blank.message)
            val tooLong = e.repo.send("a").httpError()
            assertEquals("피드백 내용은 1000자 이하여야 합니다.", tooLong.message)
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-FDBK-022 401 refreshes once and resends the original request to a successful end`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(path) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fixture("created") else fixture("unauthorized")
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertIs<ApiResult.Success<FeedbackReceipt>>(e.repo.send("hello"))
            assertEquals(1, e.h.refreshRequests().size)
            val requests = e.h.dispatcher.requests(path)
            assertEquals(2, requests.size)
            assertEquals("hello", Json.parseToJsonElement(requests[1].body.readUtf8()).jsonObject.getValue("content").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-FDBK-023 401 whose refresh is rejected ends as REAUTHENTICATION_REQUIRED`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, unauthorized())
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val error = e.repo.send("hello").httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-FDBK-024 500 INTERNAL_ERROR is sent once without any retry or backoff`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("internal-error"), fixture("created"))
            val error = e.repo.send("hello").httpError()
            assertEquals(500, error.status)
            assertEquals(ErrorCode.INTERNAL_ERROR, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-FDBK-025 a dropped connection is a network error sent once`() = runTest {
        env().use { e ->
            repeat(3) { e.h.dispatcher.enqueue(path, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }
            assertIs<ApiError.Network>(e.repo.send("hello").error())
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-FDBK-027 503 with Retry-After and 429 are not retried`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(
                path,
                MockResponses.fromFixture("common/error__service-unavailable-503.json"),
                MockResponses.fromFixture("common/error__rate-limited-429.json"),
                fixture("created"),
            )
            assertEquals(503, e.repo.send("a").httpError().status)
            assertEquals(429, e.repo.send("a").httpError().status)
            assertEquals(2, e.h.dispatcher.requests(path).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-FDBK-026 sending the same content twice produces two POSTs (no client-side dedupe)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("created"), fixture("created"))
            e.repo.send("same")
            e.repo.send("same")
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
    }
}
