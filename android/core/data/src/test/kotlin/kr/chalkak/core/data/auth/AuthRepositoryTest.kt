package kr.chalkak.core.data.auth

import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.Json
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.auth.testing.RecordingUserDataResetter
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.refreshSuccess
import kr.chalkak.core.network.testing.unauthorized
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthRepositoryTest {
    private val clock = FakeClock()
    private val login = api("/auth/social-login")
    private val logout = api("/auth/logout")
    private val me = api("/users/me")

    private class Env(val h: NetHarness, val repo: AuthRepository, val resetter: RecordingUserDataResetter) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun kotlinx.coroutines.test.TestScope.env(initial: StoredSession = StoredSession.None, clock: FakeClock): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        val resetter = RecordingUserDataResetter()
        return Env(h, DefaultAuthRepository(h.client, h.store, resetter, clock), resetter)
    }

    private fun kotlinx.coroutines.test.TestScope.loginEnv(vararg responses: MockResponse, initial: StoredSession = StoredSession.None) =
        env(initial, clock).also { it.h.dispatcher.enqueue(login, *responses) }

    private fun body(e: Env, path: String): JsonObject =
        Json.parseToJsonElement(e.h.dispatcher.requests(path).single().body.readUtf8()).jsonObject

    // ---- social login: request shape -------------------------------------------------------------

    @Test
    fun `TC-AUTH-005 body is provider KAKAO idToken rawNonce without authorizationCode and no Authorization header`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__login-success.json"), initial = StoredSession.User(TestSessions.user(clock))).use { e ->
            e.repo.socialLogin("id-token-1", "raw-nonce-1")
            val req = e.h.dispatcher.requests(login).single()
            assertEquals("POST", req.method)
            assertNull(req.getHeader("Authorization"))
            val json = body(e, login)
            assertEquals(setOf("provider", "idToken", "rawNonce"), json.keys)
            assertEquals("\"KAKAO\"", json.getValue("provider").toString())
            assertEquals("\"id-token-1\"", json.getValue("idToken").toString())
            assertEquals("\"raw-nonce-1\"", json.getValue("rawNonce").toString())
        }
    }

    @Test
    fun `TC-AUTH-010 request toString never prints idToken or rawNonce`() {
        val text = SocialLoginRequest("KAKAO", "secret-id-token", "secret-raw-nonce").toString()
        assertFalse("secret-id-token" in text || "secret-raw-nonce" in text, text)
    }

    // ---- social login: success paths -------------------------------------------------------------

    @Test
    fun `TC-AUTH-006 and TC-AUTH-007 LOGIN_SUCCESS is stored with expiry computed from response seconds`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__login-success.json")).use { e ->
            val outcome = assertIs<ApiResult.Success<SocialLoginOutcome>>(e.repo.socialLogin("i", "n")).value
            val session = assertIs<SocialLoginOutcome.LoggedIn>(outcome).session
            assertEquals("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session.userId)
            assertEquals("fixture-access-token-1", session.accessToken)
            assertEquals("fixture-refresh-token-1", session.refreshToken)
            assertEquals(clock.now().plusSeconds(900), session.accessExpiresAt)
            assertEquals(clock.now().plusSeconds(2_592_000), session.refreshExpiresAt)
            assertEquals(listOf(session), e.h.store.writes.toList())
        }
    }

    @Test
    fun `TC-AUTH-007 expiry follows the response values not constants`() = runTest {
        val custom = MockResponses.json(200, """{"status":"LOGIN_SUCCESS","userId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","accessToken":"a","expiresIn":60,"refreshToken":"r","refreshTokenExpiresIn":120}""")
        loginEnv(custom).use { e ->
            val s = assertIs<SocialLoginOutcome.LoggedIn>(assertIs<ApiResult.Success<SocialLoginOutcome>>(e.repo.socialLogin("i", "n")).value).session
            assertEquals(clock.now().plusSeconds(60), s.accessExpiresAt)
            assertEquals(clock.now().plusSeconds(120), s.refreshExpiresAt)
        }
    }

    @Test
    fun `TC-AUTH-058 LOGIN_SUCCESS resets data of the previous account exactly once`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__login-success.json")).use { e ->
            e.repo.socialLogin("i", "n")
            assertEquals(1, e.resetter.count)
        }
    }

    @Test
    fun `TC-AUTH-057 login of a banned account is a plain LOGIN_SUCCESS`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__login-success.json")).use { e ->
            assertIs<SocialLoginOutcome.LoggedIn>(assertIs<ApiResult.Success<SocialLoginOutcome>>(e.repo.socialLogin("i", "n")).value)
        }
    }

    @Test
    fun `TC-AUTH-009 and TC-AUTH-010 SIGN_UP_REQUIRED stores nothing and is not an error`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__sign-up-required.json")).use { e ->
            val outcome = assertIs<ApiResult.Success<SocialLoginOutcome>>(e.repo.socialLogin("i", "n")).value
            assertEquals(SocialLoginOutcome.SignUpRequired, outcome)
            assertTrue(e.h.store.writes.isEmpty())
            assertEquals(0, e.resetter.count)
        }
    }

    // ---- social login: invalid / error responses ---------------------------------------------------

    @Test
    fun `TC-AUTH-011 unknown status is InvalidResponse and nothing is stored`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__unknown-status.json")).use { e ->
            assertIs<ApiError.InvalidResponse>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertTrue(e.h.store.writes.isEmpty())
        }
    }

    @Test
    fun `TC-AUTH-012 LOGIN_SUCCESS without a token is InvalidResponse and nothing is stored`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__login-success-missing-token.json")).use { e ->
            assertIs<ApiError.InvalidResponse>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertTrue(e.h.store.writes.isEmpty())
            assertEquals(0, e.resetter.count)
        }
    }

    @Test
    fun `TC-AUTH-020 401 UNAUTHORIZED does not refresh nor clear and is sent once`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__unauthorized.json"), initial = StoredSession.User(TestSessions.user(clock))).use { e ->
            val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertEquals(401, err.status)
            assertEquals(ErrorCode.UNAUTHORIZED, err.errorCode)
            assertTrue(e.h.refreshRequests().isEmpty())
            assertEquals(0, e.h.store.clearCount.get())
            assertEquals(1, e.h.dispatcher.requests(login).size)
        }
    }

    @Test
    fun `TC-AUTH-021 and TC-AUTH-022 403 keeps the server message`() = runTest {
        for ((fixture, text) in listOf(
            "auth/social-login__forbidden-banned.json" to "차단된 소셜 계정입니다.",
            "auth/social-login__forbidden-withdrawn-banned.json" to "탈퇴한 차단 소셜 계정입니다.",
        )) {
            loginEnv(MockResponses.fromFixture(fixture)).use { e ->
                val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
                assertEquals(403, err.status)
                assertEquals(text, err.message)
                assertEquals(1, e.h.dispatcher.requests(login).size)
            }
        }
    }

    @Test
    fun `TC-AUTH-023 400 BUSINESS_ERROR surfaces as Http 400`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__bad-request-authcode.json")).use { e ->
            val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertEquals(400, err.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, err.errorCode)
        }
    }

    @Test
    fun `TC-AUTH-024 500 is returned and the request is sent exactly once`() = runTest {
        loginEnv(MockResponses.fromFixture("auth/social-login__internal-error.json"), MockResponses.fromFixture("auth/social-login__login-success.json")).use { e ->
            val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertEquals(500, err.status)
            assertEquals(1, e.h.dispatcher.requests(login).size)
            assertTrue(e.h.store.writes.isEmpty())
        }
    }

    @Test
    fun `TC-AUTH-025 disconnect becomes a Network error with a single request`() = runTest {
        loginEnv(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST), MockResponses.fromFixture("auth/social-login__login-success.json")).use { e ->
            assertIs<ApiError.Network>(assertIs<ApiResult.Failure>(e.repo.socialLogin("i", "n")).error)
            assertEquals(1, e.h.dispatcher.requests(login).size)
        }
    }

    @Test
    fun `TC-AUTH-026 502 HTML gateway page does not crash and is never a success`() = runTest {
        loginEnv(MockResponses.fromFixture("common/error__bad-gateway-html.json")).use { e ->
            val result = e.repo.socialLogin("i", "n")
            assertIs<ApiResult.Failure>(result)
            assertEquals(1, e.h.dispatcher.requests(login).size)
            assertTrue(e.h.store.writes.isEmpty())
        }
    }

    @Test
    fun `TC-AUTH-031 cancelling a login in flight saves no session`() = runTest {
        val delayed = MockResponses.fromFixture("auth/social-login__login-success.json").setBodyDelay(300, TimeUnit.MILLISECONDS)
        loginEnv(delayed).use { e ->
            val job = launch { e.repo.socialLogin("i", "n") }
            e.h.server.takeRequest(5, TimeUnit.SECONDS)
            job.cancel()
            job.join()
            Thread.sleep(500)
            assertTrue(e.h.store.writes.isEmpty())
            assertEquals(0, e.resetter.count)
        }
    }

    // ---- logout ----------------------------------------------------------------------------------

    private fun kotlinx.coroutines.test.TestScope.sessionEnv(vararg responses: MockResponse, path: String = logout): Env {
        val e = env(StoredSession.User(TestSessions.user(clock)), clock)
        e.h.dispatcher.enqueue(path, *responses)
        return e
    }

    @Test
    fun `TC-AUTH-035 and TC-AUTH-037 local data is cleared first then POST logout with only refreshToken and no Authorization`() = runTest {
        val log = EventLog()
        val e = sessionEnv(MockResponses.fromFixture("auth/logout__no-content.json"))
        val resetter = RecordingUserDataResetter(log)
        val repo = DefaultAuthRepository(e.h.client, e.h.store, resetter, clock)
        e.h.dispatcher.handle(logout) { req ->
            log.add("http.logout:cleared=${e.h.store.clearCount.get()}:reset=${resetter.count}")
            MockResponses.fromFixture("auth/logout__no-content.json")
        }
        e.use {
            repo.logout()
            assertEquals(listOf("reset", "http.logout:cleared=1:reset=1"), log.entries.toList())
            val req = e.h.dispatcher.requests(logout).single()
            assertNull(req.getHeader("Authorization"))
            val json = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
            assertEquals(setOf("refreshToken"), json.keys)
            assertEquals("\"fixture-refresh-token-1\"", json.getValue("refreshToken").toString())
            assertEquals(StoredSession.None, e.h.store.current)
        }
    }

    @Test
    fun `TC-AUTH-036 logout failures are ignored and tokens are already gone`() = runTest {
        for (response in listOf(
            MockResponses.fromFixture("auth/logout__internal-error.json"),
            unauthorized(),
            MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST),
        )) {
            sessionEnv(response).use { e ->
                e.repo.logout()
                assertEquals(StoredSession.None, e.h.store.current)
                assertEquals(1, e.resetter.count)
                assertTrue(e.h.refreshRequests().isEmpty())
                assertEquals(1, e.h.dispatcher.requests(logout).size)
            }
        }
    }

    @Test
    fun `TC-AUTH-038 logout without a refresh token calls no server and still cleans locally`() = runTest {
        env(StoredSession.Guest, clock).use { e ->
            e.repo.logout()
            assertTrue(e.h.dispatcher.recorded.isEmpty())
            assertEquals(1, e.resetter.count)
            assertEquals(StoredSession.None, e.h.store.current)
        }
    }

    @Test
    fun `TC-AUTH-039 logout sends no request except POST auth logout`() = runTest {
        sessionEnv(MockResponses.fromFixture("auth/logout__no-content.json")).use { e ->
            e.repo.logout()
            assertEquals(listOf(logout), e.h.dispatcher.recorded.map { it.requestUrl!!.encodedPath })
        }
    }

    // ---- withdraw --------------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-043 and TC-AUTH-046 DELETE users me has no body and 204 clears session and caches`() = runTest {
        sessionEnv(MockResponses.fromFixture("auth/users-me__delete-no-content.json"), path = me).use { e ->
            assertIs<ApiResult.Success<Unit>>(e.repo.withdraw())
            val req = e.h.dispatcher.requests(me).single()
            assertEquals("DELETE", req.method)
            assertEquals("Bearer fixture-access-token-1", req.getHeader("Authorization"))
            assertEquals(0L, req.bodySize)
            assertEquals(StoredSession.None, e.h.store.current)
            assertEquals(1, e.resetter.count)
        }
    }

    @Test
    fun `TC-AUTH-043 a throwing local cleanup after 204 does not turn the withdrawal into a failure or an exception`() = runTest {
        sessionEnv(MockResponses.fromFixture("auth/users-me__delete-no-content.json"), path = me).use { e ->
            val throwing = DefaultAuthRepository(e.h.client, ThrowingClearStore(e.h.store), ThrowingResetter, clock)
            assertIs<ApiResult.Success<Unit>>(throwing.withdraw())
        }
    }

    @Test
    fun `TC-AUTH-036 a throwing local cleanup does not stop logout from sending the request`() = runTest {
        sessionEnv(MockResponses.fromFixture("auth/logout__internal-error.json")).use { e ->
            DefaultAuthRepository(e.h.client, ThrowingClearStore(e.h.store), ThrowingResetter, clock).logout()
            assertEquals(1, e.h.dispatcher.requests(logout).size)
        }
    }

    private class ThrowingClearStore(private val delegate: kr.chalkak.core.network.SessionStore) : kr.chalkak.core.network.SessionStore by delegate {
        override suspend fun clear() = throw IllegalStateException("keystore unavailable")
    }

    private object ThrowingResetter : UserDataResetter {
        override suspend fun resetAll() = throw IllegalStateException("cache reset failed")
    }

    @Test
    fun `TC-AUTH-044 500 and network errors keep the session`() = runTest {
        for (response in listOf(
            MockResponses.fromFixture("auth/users-me__delete-internal-error.json"),
            MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST),
        )) {
            sessionEnv(response, response, response, response, path = me).use { e ->
                assertIs<ApiResult.Failure>(e.repo.withdraw())
                assertIs<StoredSession.User>(e.h.store.current)
                assertEquals(0, e.resetter.count)
            }
        }
    }

    @Test
    fun `TC-AUTH-045 401 refreshes once then resends and 204 completes the withdrawal`() = runTest {
        val e = sessionEnv(path = me)
        e.use {
            e.h.dispatcher.handle(me) { req ->
                if (req.getHeader("Authorization") == BEARER_2) MockResponses.fromFixture("auth/users-me__delete-no-content.json")
                else MockResponses.fromFixture("auth/users-me__delete-unauthorized.json")
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertIs<ApiResult.Success<Unit>>(e.repo.withdraw())
            assertEquals(2, e.h.dispatcher.requests(me).size)
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(StoredSession.None, e.h.store.current)
        }
    }

    @Test
    fun `TC-AUTH-045 401 that stays 401 after refresh keeps the session`() = runTest {
        val e = sessionEnv(path = me)
        e.use {
            e.h.dispatcher.handle(me) { MockResponses.fromFixture("auth/users-me__delete-unauthorized.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.withdraw()).error)
            assertEquals(ErrorCode.UNAUTHORIZED, err.errorCode)
            assertEquals(2, e.h.dispatcher.requests(me).size)
            assertIs<StoredSession.User>(e.h.store.current)
            assertEquals(0, e.resetter.count)
        }
    }

    @Test
    fun `TC-AUTH-049 cancelling the withdraw request before the 204 arrives keeps the session`() = runTest {
        val delayed = MockResponses.fromFixture("auth/users-me__delete-no-content.json").setHeadersDelay(300, TimeUnit.MILLISECONDS)
        sessionEnv(delayed, path = me).use { e ->
            val job = launch { e.repo.withdraw() }
            e.h.server.takeRequest(5, TimeUnit.SECONDS)
            job.cancel()
            job.join()
            assertIs<StoredSession.User>(e.h.store.current)
        }
    }

    @Test
    fun `TC-AUTH-051 and TC-AUTH-056 refresh answering REAUTHENTICATION_REQUIRED clears the session and emits GoToLogin`() = runTest {
        val e = sessionEnv(path = me)
        e.use {
            e.h.dispatcher.handle(me) { MockResponses.fromFixture("auth/users-me__delete-unauthorized.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val err = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(e.repo.withdraw()).error)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, err.errorCode)
            assertEquals(StoredSession.None, e.h.store.current)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    // ---- static guards ---------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-047 no production code calls Kakao unlink`() {
        val androidDir = File(requireNotNull(System.getProperty("android.dir")))
        val offenders = androidDir.walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path }
            .filter { Regex("""\bunlink\b""", RegexOption.IGNORE_CASE).containsMatchIn(it.readText()) }
            .map { it.path }.toList()
        assertTrue(offenders.isEmpty(), "unlink found in $offenders")
    }

    @Test
    fun `TC-AUTH-053 only the secure storage port persists tokens`() {
        val androidDir = File(requireNotNull(System.getProperty("android.dir")))
        val offenders = androidDir.walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path && "/app/" !in it.path }
            .filter { Regex("""SharedPreferences|DataStore|java\.io\.File|File\(""").containsMatchIn(it.readText()) }
            .map { it.path }.toList()
        assertTrue(offenders.isEmpty(), "plain storage found in $offenders")
    }
}
