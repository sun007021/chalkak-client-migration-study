@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.notification

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.refreshSuccess
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** `PUT /push-devices/current` over MockWebServer + `shared/fixtures/push`. */
class PushDeviceRepositoryTest {
    private val clock = FakeClock()
    private val member get() = StoredSession.User(TestSessions.user(clock))
    private val path = api("/push-devices/current")

    private class Env(val h: NetHarness, val repo: PushDeviceRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = member): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultPushDeviceRepository(h.client))
    }

    private fun fx(file: String) = MockResponses.fromFixture("push/$file")

    private fun Env.enqueue(vararg responses: MockResponse) = h.dispatcher.enqueue(path, *responses)

    private fun ApiResult<*>.http(): ApiError.Http = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(this).error)

    @Test
    fun `TC-PUSH-012 registration is PUT with a body of fcmToken only and 204 is Success`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__no-content.json"))
            assertEquals(ApiResult.Success(Unit), e.repo.register("fcm-token-1"))
            val req = e.h.dispatcher.requests(path).single()
            assertEquals("PUT", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            val body = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
            assertEquals(setOf("fcmToken"), body.keys)
            assertEquals("fcm-token-1", body.getValue("fcmToken").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-PUSH-033 a suspended member registers like anyone else (204)`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__no-content.json"))
            assertEquals(ApiResult.Success(Unit), e.repo.register("fcm-token-1"))
        }
    }

    @Test
    fun `TC-PUSH-031 the server 400 for an empty token is read as Http 400 BUSINESS_ERROR`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__bad-request-empty-token.json"))
            val http = e.repo.register("x").http()
            assertEquals(400, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-PUSH-027 a 401 UNAUTHORIZED refreshes once and registers again with the new token`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(path) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fx("push-devices-current__no-content.json") else fx("push-devices-current__unauthorized.json")
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(ApiResult.Success(Unit), e.repo.register("fcm-token-1"))
            assertEquals(listOf(BEARER_1, BEARER_2), e.h.dispatcher.requests(path).map { it.getHeader("Authorization") })
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    // D-17 (decisions win): REAUTHENTICATION_REQUIRED never triggers a refresh call; the session is cleared and the login screen opens.
    // The catalog text of TC-PUSH-028 ("refresh를 시도하고 성공하면 재등록") and REQ-PUSH-011 disagree with D-17 / TC-NET-018.
    @Test
    fun `TC-PUSH-028 a 401 REAUTHENTICATION_REQUIRED clears the session, asks for login and does not refresh or resend (D-17)`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__reauthentication-required.json"))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, e.repo.register("fcm-token-1").http().errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(0, e.h.refreshRequests().size)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
            assertEquals(StoredSession.None, e.h.store.current)
        }
    }

    @Test
    fun `TC-PUSH-034 a withdrawn member whose refresh is rejected is sent to the login screen`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__unauthorized.json"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, e.repo.register("fcm-token-1").http().errorCode)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
        }
    }

    @Test
    fun `TC-PUSH-029 a rejected registration (400) leaves the session and shows nothing`() = runTest {
        env().use { e ->
            e.enqueue(fx("push-devices-current__bad-request-empty-token.json"))
            e.repo.register("fcm-token-1")
            assertEquals(member, e.h.store.current)
            assertTrue(e.h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-PUSH-030 a 500 is retried after 500 ms and 1000 ms of virtual time and then reported`() = runTest {
        env().use { e ->
            repeat(3) { e.enqueue(fx("push-devices-current__internal-error.json")) }
            assertEquals(500, e.repo.register("fcm-token-1").http().status)
            assertEquals(3, e.h.dispatcher.requests(path).size)
            assertEquals(1_500L, testScheduler.currentTime)
            assertEquals(member, e.h.store.current)
        }
    }

    @Test
    fun `TC-PUSH-030 a network error then success registers on the second attempt`() = runTest {
        env().use { e ->
            e.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST), fx("push-devices-current__no-content.json"))
            assertEquals(ApiResult.Success(Unit), e.repo.register("fcm-token-1"))
            assertEquals(2, e.h.dispatcher.requests(path).size)
            assertEquals(500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-PUSH-030 a connection that never answers ends as a Network failure, not a crash`() = runTest {
        env().use { e ->
            repeat(3) { e.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }
            assertIs<ApiError.Network>(assertIs<ApiResult.Failure>(e.repo.register("fcm-token-1")).error)
            assertEquals(3, e.h.dispatcher.requests(path).size)
        }
    }
}
