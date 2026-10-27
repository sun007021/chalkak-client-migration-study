package kr.chalkak.core.network

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.testing.FakeRefreshApi
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.USER_B
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.guardPath
import kr.chalkak.core.network.testing.httpError
import kr.chalkak.core.network.testing.okJson
import kr.chalkak.core.network.testing.refreshSuccess
import kr.chalkak.core.network.testing.unauthorized
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ApiClientAuthTest {
    private val clock = FakeClock()
    private val user = TestSessions.user(clock)
    private val unread = "/notifications/unread-status"
    private fun get(path: String) = ApiRequest(HttpMethod.GET, path)

    // ---- header rules -------------------------------------------------------------------------

    @Test
    fun `TC-NET-013 guest request that gets 401 neither refreshes nor clears and sends no Authorization`() = runTest {
        NetHarness(backgroundScope, StoredSession.Guest, clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            val result = h.client.execute(get(unread))
            assertEquals(401, result.httpError().status)
            assertNull(h.dispatcher.requests(api(unread)).single().getHeader("Authorization"))
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(0, h.store.clearCount.get())
            assertEquals(StoredSession.Guest, h.store.current)
        }
    }

    @Test
    fun `TC-NET-013 no stored session behaves like a guest`() = runTest {
        NetHarness(backgroundScope, StoredSession.None, clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.client.execute(get(unread))
            assertTrue(h.refreshRequests().isEmpty())
            assertNull(h.dispatcher.requests(api(unread)).single().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-NET-014 expired access token sends no Authorization then 401 leads to refresh and retry`() = runTest {
        val expired = TestSessions.expiredAccess(clock)
        NetHarness(backgroundScope, StoredSession.User(expired), clock = clock).use { h ->
            h.guardPath(unread)
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertIs<ApiResult.Success<*>>(h.client.execute(get(unread)))
            val reqs = h.dispatcher.requests(api(unread))
            assertNull(reqs[0].getHeader("Authorization"))
            assertEquals(BEARER_2, reqs[1].getHeader("Authorization"))
            assertEquals(1, h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-NET-014 access token is judged against the injected clock`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), okJson(), okJson())
            h.client.execute(get(unread))
            clock.advance(java.time.Duration.ofMinutes(16))
            h.client.execute(get(unread))
            val reqs = h.dispatcher.requests(api(unread))
            assertEquals(BEARER_1, reqs[0].getHeader("Authorization"))
            assertNull(reqs[1].getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-NET-030 public GET carries the token when valid and refreshes on 401`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.guardPath("/topics")
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertIs<ApiResult.Success<*>>(h.client.execute(get("/topics")))
            val reqs = h.dispatcher.requests(api("/topics"))
            assertEquals(BEARER_1, reqs[0].getHeader("Authorization"))
            assertEquals(BEARER_2, reqs[1].getHeader("Authorization"))
            assertEquals(1, h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-NET-030 public GET as guest has no Authorization header`() = runTest {
        NetHarness(backgroundScope, StoredSession.Guest, clock = clock).use { h ->
            h.dispatcher.enqueue(api("/posts"), okJson(), okJson())
            h.dispatcher.enqueue(api("/topics"), okJson())
            h.client.execute(ApiRequest(HttpMethod.GET, "/posts", listOf("topicDate" to "2026-10-27")))
            h.client.execute(get("/topics"))
            assertTrue(h.dispatcher.recorded.all { it.getHeader("Authorization") == null })
        }
    }

    @Test
    fun `TC-NET-030 public GET after the session was cleared by a failed re-auth has no Authorization header`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.client.execute(get(unread))
            h.dispatcher.enqueue(api("/topics"), okJson())
            h.client.execute(get("/topics"))
            assertNull(h.dispatcher.requests(api("/topics")).single().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-NET-031 GET banners never carries Authorization and a 401 does not refresh`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api("/banners"), unauthorized())
            val result = h.client.execute(get("/banners"))
            assertEquals(401, result.httpError().status)
            assertNull(h.dispatcher.requests(api("/banners")).single().getHeader("Authorization"))
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(0, h.store.clearCount.get())
        }
    }

    @Test
    fun `TC-NET-051 loopback http mock server still receives the token (rule is about non-loopback http)`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), okJson())
            h.client.execute(get(unread))
            assertEquals(BEARER_1, h.dispatcher.requests(api(unread)).single().getHeader("Authorization"))
        }
    }

    // ---- 401 handling -------------------------------------------------------------------------

    @Test
    fun `TC-NET-012 401 with a token refreshes once and resends the original request exactly once`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.guardPath(unread, """{"hasUnread":true}""")
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val result = assertIs<ApiResult.Success<RawResponse>>(h.client.execute(get(unread)))
            assertEquals("""{"hasUnread":true}""", result.value.body)
            assertEquals(2, h.dispatcher.requests(api(unread)).size)
            assertEquals(1, h.refreshRequests().size)
            assertEquals("fixture-refresh-token-2", h.store.storedUser?.refreshToken)
        }
    }

    @Test
    fun `TC-NET-022 the new tokens are saved before the original request is resent`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            val savedBeforeResend = AtomicBoolean(false)
            h.dispatcher.handle(api(unread)) { req ->
                if (req.getHeader("Authorization") == BEARER_2) {
                    savedBeforeResend.set(h.store.storedUser?.refreshToken == "fixture-refresh-token-2")
                    okJson()
                } else unauthorized()
            }
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            h.client.execute(get(unread))
            assertTrue(savedBeforeResend.get())
        }
    }

    @Test
    fun `TC-NET-015 many concurrent 401s share one refresh and each original request is resent once with the new token`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            val paths = List(6) { "/notifications/n$it" }
            paths.forEach { h.guardPath(it) }
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val results = paths.map { p -> async { h.client.execute(get(p)) } }.awaitAll()
            results.forEach { assertIs<ApiResult.Success<*>>(it) }
            assertEquals(1, h.refreshRequests().size)
            paths.forEach { p ->
                val reqs = h.dispatcher.requests(api(p))
                assertEquals(BEARER_2, reqs.last().getHeader("Authorization"), p)
                assertTrue(reqs.size <= 2, p)
            }
            assertEquals(0, h.store.clearCount.get())
        }
    }

    @Test
    fun `TC-NET-016 a request whose 401 arrives after another request already refreshed retries without a second refresh`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            val aFinished = CountDownLatch(1)
            h.dispatcher.handle(api("/notifications/a")) { req ->
                if (req.getHeader("Authorization") == BEARER_2) okJson().also { aFinished.countDown() } else unauthorized()
            }
            h.dispatcher.handle(api("/notifications/b")) { req ->
                if (req.getHeader("Authorization") == BEARER_2) okJson()
                else {
                    aFinished.await(10, TimeUnit.SECONDS) // B's 401 is delivered only after A fully completed
                    unauthorized()
                }
            }
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val a = async { h.client.execute(get("/notifications/a")) }
            val b = async { h.client.execute(get("/notifications/b")) }
            assertIs<ApiResult.Success<*>>(a.await())
            assertIs<ApiResult.Success<*>>(b.await())
            assertEquals(1, h.refreshRequests().size, "old refresh token must not be sent twice")
            assertEquals(0, h.store.clearCount.get())
            assertTrue(h.events.events.isEmpty())
            assertEquals(BEARER_2, h.dispatcher.requests(api("/notifications/b")).last().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-NET-017 a 401 on the resent request is returned without a third attempt and keeps the session`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized(), unauthorized(), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val result = h.client.execute(get(unread))
            assertEquals(401, result.httpError().status)
            assertEquals(ErrorCode.UNAUTHORIZED, result.httpError().errorCode)
            assertEquals(2, h.dispatcher.requests(api(unread)).size)
            assertEquals(1, h.refreshRequests().size)
            assertEquals(0, h.store.clearCount.get())
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-018 resent request answering REAUTHENTICATION_REQUIRED clears the session and emits go-to-login`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(
                api(unread),
                unauthorized(),
                MockResponses.fromFixture("auth/refresh__reauthentication-required.json"),
            )
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val result = h.client.execute(get(unread))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, result.httpError().errorCode)
            assertEquals(StoredSession.None, h.store.current)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), h.events.events.toList())
            assertEquals(1, h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-NET-020 a normal api answering REAUTHENTICATION_REQUIRED clears the session without calling refresh`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val result = h.client.execute(get(unread))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, result.httpError().errorCode)
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(StoredSession.None, h.store.current)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), h.events.events.toList())
            assertEquals(1, h.dispatcher.requests(api(unread)).size)
        }
    }

    @Test
    fun `TC-NET-021 refresh answering REAUTHENTICATION_REQUIRED clears the session and the original is not resent`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val result = h.client.execute(get(unread))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, result.httpError().errorCode)
            assertEquals(StoredSession.None, h.store.current)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), h.events.events.toList())
            assertEquals(1, h.dispatcher.requests(api(unread)).size)
        }
    }

    @Test
    fun `TC-NET-023 refresh timeout fails only that request keeps the session and is not retried`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), config = NetworkConfig(responseTimeoutMs = 300), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
            val result = h.client.execute(get(unread))
            assertEquals(ApiError.Network(NetworkKind.TIMEOUT), result.error())
            assertEquals(1, h.refreshRequests().size)
            assertEquals(StoredSession.User(user), h.store.current)
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-024 refresh 5xx fails only that request and keeps the session`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__internal-error.json"), refreshSuccess())
            val result = h.client.execute(get(unread))
            assertEquals(500, result.httpError().status)
            assertEquals(1, h.refreshRequests().size, "refresh is never auto-retried")
            assertEquals(StoredSession.User(user), h.store.current)
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-025 refresh response without a token field does not overwrite the session`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__missing-token-field.json"))
            assertIs<ApiError.InvalidResponse>(h.client.execute(get(unread)).error())
            assertTrue(h.store.writes.isEmpty())
            assertEquals(0, h.store.clearCount.get())
        }
    }

    @Test
    fun `TC-NET-026 refresh 400 fails the request and does not log out`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("common/error__business-400.json"))
            assertEquals(400, h.client.execute(get(unread)).httpError().status)
            assertEquals(0, h.store.clearCount.get())
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-027 logout while a refresh is in flight does not save the result nor resend the request`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val fake = FakeRefreshApi().also { it.gate = gate }
        NetHarness(backgroundScope, StoredSession.User(user), refreshApi = fake, clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized(), okJson())
            val call = async { h.client.execute(get(unread)) }
            fake.started.receive()
            h.store.clear()
            gate.complete(Unit)
            assertEquals(ErrorCode.UNAUTHORIZED, call.await().httpError().errorCode)
            assertTrue(h.store.writes.isEmpty())
            assertEquals(StoredSession.None, h.store.current)
            assertEquals(1, h.dispatcher.requests(api(unread)).size)
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-057 account switch during a 401 refresh leaves account B untouched`() = runTest {
        val b = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.handle(api(unread)) {
                h.store.current = StoredSession.User(b) // account switch happens while A's request is on the wire
                unauthorized()
            }
            val result = h.client.execute(get(unread))
            assertEquals(401, result.httpError().status)
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(StoredSession.User(b), h.store.current)
            assertTrue(h.store.writes.isEmpty())
            assertEquals(0, h.store.clearCount.get())
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `TC-NET-028 cancelling the screen that started the refresh keeps the refresh alive for another request`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val fake = FakeRefreshApi().also { it.gate = gate }
        NetHarness(backgroundScope, StoredSession.User(user), refreshApi = fake, clock = clock).use { h ->
            h.guardPath("/notifications/a")
            h.guardPath("/notifications/b")
            val a = launch { h.client.execute(get("/notifications/a")) }
            fake.started.receive()
            val b = async { h.client.execute(get("/notifications/b")) }
            a.cancel()
            gate.complete(Unit)
            assertIs<ApiResult.Success<*>>(b.await())
            assertTrue(a.isCancelled)
            assertEquals(1, fake.calls.size)
            assertEquals("fixture-refresh-token-2", h.store.storedUser?.refreshToken)
        }
    }

    @Test
    fun `TC-NET-029 a later refresh uses the rotated refresh token never the used one`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.guardPath("/notifications/a")
            h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess(), refreshSuccess())
            h.client.execute(get("/notifications/a"))
            // access token expires again; server rejects the old one
            h.dispatcher.handle(api("/notifications/c")) { req ->
                if (req.getHeader("Authorization") == "Bearer fixture-access-token-2") unauthorized() else okJson()
            }
            h.client.execute(get("/notifications/c"))
            val bodies = h.refreshRequests().map { it.body.readUtf8() }
            assertEquals(2, bodies.size)
            assertTrue(bodies[0].contains("fixture-refresh-token-1"))
            assertTrue(bodies[1].contains("fixture-refresh-token-2"))
        }
    }

    @Test
    fun `TC-NET-032 403 FORBIDDEN is returned as is with one request and no refresh or session change`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api("/posts/x/likes"), MockResponses.fromFixture("common/error__forbidden-banned.json"), okJson())
            val result = h.client.execute(ApiRequest(HttpMethod.PUT, "/posts/x/likes"))
            assertEquals(ErrorCode.FORBIDDEN, result.httpError().errorCode)
            assertEquals(1, h.dispatcher.requests(api("/posts/x/likes")).size)
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(StoredSession.User(user), h.store.current)
        }
    }

    @Test
    fun `lesson-c only a 401 REAUTHENTICATION_REQUIRED clears the session (same code on 403 does not)`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), MockResponses.json(403, """{"errorCode":"REAUTHENTICATION_REQUIRED","message":"x"}"""))
            val result = h.client.execute(get(unread))
            assertEquals(403, result.httpError().status)
            assertTrue(h.refreshRequests().isEmpty())
            assertEquals(StoredSession.User(user), h.store.current)
            assertTrue(h.events.events.isEmpty())
        }
    }

    @Test
    fun `lesson-b a throwing secure store is treated as no session the request is sent as guest and the entry cleared`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.store.failNextReads(1)
            h.dispatcher.enqueue(api(unread), unauthorized())
            val result = h.client.execute(get(unread))
            assertEquals(401, result.httpError().status)
            assertNull(h.dispatcher.requests(api(unread)).single().getHeader("Authorization"))
            assertEquals(1, h.store.clearCount.get())
            assertTrue(h.refreshRequests().isEmpty())
        }
    }

    @Test
    fun `lesson-c a transient refresh failure never emits go-to-login`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.enqueue(api(unread), unauthorized(), unauthorized())
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__internal-error.json"))
            h.client.execute(get(unread))
            assertTrue(h.events.events.isEmpty())
            assertEquals(StoredSession.User(user), h.store.current)
        }
    }
}
