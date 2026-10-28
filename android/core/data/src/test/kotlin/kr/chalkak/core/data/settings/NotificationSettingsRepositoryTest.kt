@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.settings

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** `GET`/`PATCH /notification-settings` HTTP contract against MockWebServer + shared fixtures (SET C halves). */
class NotificationSettingsRepositoryTest {
    private val clock = FakeClock()
    private val path = api("/notification-settings")

    private class Env(val h: NetHarness, val repo: DefaultNotificationSettingsRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.User(TestSessions.user(clock))): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultNotificationSettingsRepository(h.client))
    }

    private fun fixture(name: String) = MockResponses.fromFixture("settings/notification-settings__$name.json")

    private fun body(e: Env): JsonObject = Json.parseToJsonElement(e.h.dispatcher.requests(path).single().body.readUtf8()).jsonObject

    @Test
    fun `TC-SET-014 GET reads the three fields and keeps a switched-off AI setting`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("get-ai-off"))
            val settings = assertIs<ApiResult.Success<NotificationSettings>>(e.repo.load()).value
            assertEquals(NotificationSettings(topic = true, moderation = true, aiReview = false), settings)
            val req = e.h.dispatcher.requests(path).single()
            assertEquals("GET", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-SET-015 GET with a missing field is an invalid response`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("get-field-missing"))
            assertIs<ApiError.InvalidResponse>(e.repo.load().error())
        }
    }

    @Test
    fun `TC-SET-015 GET with a null field is an invalid response`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("get-null-field"))
            assertIs<ApiError.InvalidResponse>(e.repo.load().error())
        }
    }

    @Test
    fun `TC-SET-019 PATCH for the topic switch sends only topicPushEnabled`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-no-content"))
            assertEquals(ApiResult.Success(Unit), e.repo.update(PushSetting.Topic, false))
            val json = body(e)
            assertEquals(setOf("topicPushEnabled"), json.keys)
            assertEquals(false, json.getValue("topicPushEnabled").jsonPrimitive.boolean)
            val req = e.h.dispatcher.requests(path).single()
            assertEquals("PATCH", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            assertTrue(req.getHeader("Content-Type").orEmpty().startsWith("application/json"))
        }
    }

    @Test
    fun `TC-SET-020 PATCH for the moderation switch sends only moderationPushEnabled`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-no-content"))
            e.repo.update(PushSetting.Moderation, true)
            val json = body(e)
            assertEquals(setOf("moderationPushEnabled"), json.keys)
            assertEquals(true, json.getValue("moderationPushEnabled").jsonPrimitive.boolean)
        }
    }

    @Test
    fun `TC-SET-021 PATCH for the AI switch sends only aiReviewPushEnabled`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-no-content"))
            e.repo.update(PushSetting.AiReview, false)
            assertEquals(setOf("aiReviewPushEnabled"), body(e).keys)
        }
    }

    @Test
    fun `TC-SET-022 PATCH 204 without a body is a success and no body is decoded`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-no-content"))
            assertEquals(ApiResult.Success(Unit), e.repo.update(PushSetting.Topic, true))
        }
    }

    @Test
    fun `TC-SET-034 GET 401 refreshes once and resends with the new token`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(path) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fixture("get-all-true") else fixture("get-unauthorized")
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val settings = assertIs<ApiResult.Success<NotificationSettings>>(e.repo.load()).value
            assertEquals(NotificationSettings(true, true, true), settings)
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-SET-034 PATCH 401 whose refresh is rejected ends as REAUTHENTICATION_REQUIRED`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-unauthorized"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val error = e.repo.update(PushSetting.Topic, false).httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-SET-034 PATCH 401 refreshes once and resends the same single-key body`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(path) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fixture("patch-no-content") else unauthorized()
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(ApiResult.Success(Unit), e.repo.update(PushSetting.Moderation, false))
            val requests = e.h.dispatcher.requests(path)
            assertEquals(2, requests.size)
            assertEquals(setOf("moderationPushEnabled"), Json.parseToJsonElement(requests[1].body.readUtf8()).jsonObject.keys)
        }
    }

    @Test
    fun `TC-SET-035 PATCH 500 is retried twice with 500ms then 1000ms of virtual time and then fails`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-internal-error"), fixture("patch-internal-error"), fixture("patch-internal-error"), fixture("patch-no-content"))
            val error = e.repo.update(PushSetting.AiReview, false).httpError()
            assertEquals(500, error.status)
            assertEquals(3, e.h.dispatcher.requests(path).size)
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-SET-035 PATCH recovers when the second attempt succeeds`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-internal-error"), fixture("patch-no-content"))
            assertEquals(ApiResult.Success(Unit), e.repo.update(PushSetting.Topic, true))
            assertEquals(2, e.h.dispatcher.requests(path).size)
            assertEquals(500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-SET-036 a 400 for an empty PATCH keeps its status and message (client never builds one)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-bad-request-empty"))
            val error = e.repo.update(PushSetting.Topic, true).httpError()
            assertEquals(400, error.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-SET-036 every PATCH body has exactly one key whichever switch changed`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(path, fixture("patch-no-content"), fixture("patch-no-content"), fixture("patch-no-content"))
            PushSetting.entries.forEach { e.repo.update(it, true) }
            val keys = e.h.dispatcher.requests(path).map { Json.parseToJsonElement(it.body.readUtf8()).jsonObject.keys }
            assertEquals(PushSetting.entries.map { setOf(it.field) }, keys)
        }
    }
}
