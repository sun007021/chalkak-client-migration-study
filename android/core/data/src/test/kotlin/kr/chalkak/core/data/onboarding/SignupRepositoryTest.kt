@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.onboarding

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.auth.testing.RecordingUserDataResetter
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.OkHttpFactory
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Signup HTTP contract (steps 1-3) against MockWebServer + shared fixtures. */
class SignupRepositoryTest {
    private val clock = FakeClock()
    private val uploads = api("/auth/social-signup/signature/uploads")
    private val signup = api("/auth/social-signup")
    private val uploadPath = "/__upload/55555555-5555-4555-8555-555555555512"

    private class Env(val h: NetHarness, val repo: DefaultSignupRepository, val resetter: RecordingUserDataResetter) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.None): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        val resetter = RecordingUserDataResetter()
        return Env(h, DefaultSignupRepository(h.client, h.store, resetter, clock), resetter)
    }

    /** The fixture's `uploadUrl` points at the mock-server port 4010; aim it at the harness server. */
    private fun Env.uploadsSuccess(): MockResponse {
        val origin = h.server.url("/").toString().trimEnd('/')
        return MockResponses.json(200, Fixtures.read("onboarding/signup-uploads__success.json").replace("http://localhost:4010", origin))
    }

    private fun body(e: Env, path: String): JsonObject =
        Json.parseToJsonElement(e.h.dispatcher.requests(path).single().body.readUtf8()).jsonObject

    // ---- step 1: uploads --------------------------------------------------------------------

    @Test
    fun `TC-ONB-020 uploads body is provider KAKAO idToken rawNonce only and no Authorization header`() = runTest {
        env(StoredSession.User(TestSessions.user(clock))).use { e ->
            e.h.dispatcher.enqueue(uploads, e.uploadsSuccess())
            e.repo.requestUpload("id-token-1", "raw-nonce-1")
            val req = e.h.dispatcher.requests(uploads).single()
            assertEquals("POST", req.method)
            assertNull(req.getHeader("Authorization"))
            val json = body(e, uploads)
            assertEquals(setOf("provider", "idToken", "rawNonce"), json.keys)
            assertEquals("KAKAO", json.getValue("provider").jsonPrimitive.content)
            assertEquals("id-token-1", json.getValue("idToken").jsonPrimitive.content)
            assertEquals("raw-nonce-1", json.getValue("rawNonce").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-ONB-020 request toString never prints idToken or rawNonce`() {
        val text = SignupUploadsRequest("KAKAO", "secret-id-token", "secret-raw-nonce").toString()
        assertFalse("secret-id-token" in text || "secret-raw-nonce" in text, text)
    }

    @Test
    fun `TC-ONB-021 uploads response is decoded into uploadId uploadUrl and signupToken`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, e.uploadsSuccess())
            val upload = assertIs<ApiResult.Success<SignupUpload>>(e.repo.requestUpload("i", "n")).value
            assertEquals("55555555-5555-4555-8555-555555555512", upload.uploadId)
            assertTrue(upload.uploadUrl.endsWith("$uploadPath?X-Amz-Expires=300"), upload.uploadUrl)
            assertEquals("fixture-signup-token-1", upload.signupToken)
        }
    }

    @Test
    fun `TC-ONB-021 uploads response keeps expiresInSeconds 300 in the DTO`() {
        val dto = kr.chalkak.core.network.ApiJson.instance.decodeFromString(
            SignupUploadsResponse.serializer(),
            Fixtures.read("onboarding/signup-uploads__success.json"),
        )
        assertEquals(300L, dto.expiresInSeconds)
    }

    @Test
    fun `TC-ONB-042 uploads 500 is sent exactly once (no automatic POST retry)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, MockResponses.fromFixture("common/error__internal-500.json"), e.uploadsSuccess())
            val result = e.repo.requestUpload("i", "n")
            assertEquals(500, result.httpError().status)
            assertEquals(1, e.h.dispatcher.requests(uploads).size)
        }
    }

    @Test
    fun `TC-ONB-031 uploads 400 BUSINESS_ERROR is surfaced as Http 400 for the holder to branch on`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, MockResponses.fromFixture("onboarding/signup-uploads__already-registered.json"))
            val error = e.repo.requestUpload("i", "n").httpError()
            assertEquals(400, error.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, error.errorCode)
        }
    }

    @Test
    fun `TC-ONB-032 uploads 403 FORBIDDEN keeps the server message`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, MockResponses.fromFixture("onboarding/signup-uploads__forbidden-banned.json"))
            val error = e.repo.requestUpload("i", "n").httpError()
            assertEquals(403, error.status)
            assertEquals(ErrorCode.FORBIDDEN, error.errorCode)
            assertEquals("차단된 소셜 계정입니다.", error.message)
        }
    }

    @Test
    fun `TC-ONB-033 uploads 401 UNAUTHORIZED is surfaced as is without a refresh attempt`() = runTest {
        env(StoredSession.User(TestSessions.user(clock))).use { e ->
            e.h.dispatcher.enqueue(uploads, MockResponses.fromFixture("onboarding/signup-uploads__unauthorized.json"))
            val error = e.repo.requestUpload("i", "n").httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.UNAUTHORIZED, error.errorCode)
            assertTrue(e.h.refreshRequests().isEmpty())
        }
    }

    // ---- step 2: presigned PUT --------------------------------------------------------------

    @Test
    fun `TC-ONB-022 PUT sends image png without Authorization and with the full PNG body`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue(uploadPath, MockResponses.fromFixture("onboarding/presigned-put__ok.json"))
            val png = ByteArray(2048) { (it % 251).toByte() }
            val uploader = PresignedSignatureUploader(h.client, OkHttpFactory.uploadClient())
            val result = uploader.put(h.server.url("$uploadPath?X-Amz-Expires=300").toString(), png)
            assertEquals(ApiResult.Success(Unit), result)
            val req = h.dispatcher.recorded.single()
            assertEquals("PUT", req.method)
            assertEquals("image/png", req.getHeader("Content-Type"))
            assertNull(req.getHeader("Authorization"))
            assertContentEquals(png, req.body.readByteArray())
        }
    }

    @Test
    fun `TC-ONB-040 PUT 403 (expired or signature mismatch) is a Failure`() = runTest {
        NetHarness(backgroundScope, StoredSession.None, clock = clock).use { h ->
            val uploader = PresignedSignatureUploader(h.client, OkHttpFactory.uploadClient())
            for (fixture in listOf("onboarding/presigned-put__expired.json", "onboarding/presigned-put__content-type-mismatch.json")) {
                h.dispatcher.enqueue(uploadPath, MockResponses.fromFixture(fixture))
                val result = uploader.put(h.server.url("$uploadPath?X-Amz-Expires=300").toString(), byteArrayOf(1, 2, 3))
                assertEquals(403, result.httpError().status, fixture)
            }
        }
    }

    @Test
    fun `TC-ONB-040 PUT connection failure is reported as a network error`() = runTest {
        NetHarness(backgroundScope, StoredSession.None, clock = clock).use { h ->
            h.dispatcher.enqueue(uploadPath, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            h.dispatcher.enqueue(uploadPath, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            h.dispatcher.enqueue(uploadPath, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            val uploader = PresignedSignatureUploader(h.client, OkHttpFactory.uploadClient())
            val result = uploader.put(h.server.url("$uploadPath?X-Amz-Expires=300").toString(), byteArrayOf(1))
            assertIs<ApiError.Network>(result.error())
        }
    }

    // ---- step 3: confirm --------------------------------------------------------------------

    @Test
    fun `TC-ONB-023 confirm body is signupToken only and carries no Authorization`() = runTest {
        env(StoredSession.User(TestSessions.user(clock))).use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("onboarding/signup__success.json"))
            e.repo.confirm("fixture-signup-token-1")
            val req = e.h.dispatcher.requests(signup).single()
            assertEquals("POST", req.method)
            assertNull(req.getHeader("Authorization"))
            val json = body(e, signup)
            assertEquals(setOf("signupToken"), json.keys)
            assertEquals("fixture-signup-token-1", json.getValue("signupToken").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-ONB-024 confirm 200 stores the session with expiry computed from the response seconds`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("onboarding/signup__success.json"))
            val session = assertIs<ApiResult.Success<kr.chalkak.core.network.Session>>(e.repo.confirm("t")).value
            assertEquals("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session.userId)
            assertEquals("fixture-access-token-1", session.accessToken)
            assertEquals("fixture-refresh-token-1", session.refreshToken)
            assertEquals(clock.now().plusSeconds(900), session.accessExpiresAt)
            assertEquals(clock.now().plusSeconds(2_592_000), session.refreshExpiresAt)
            assertEquals(listOf(session), e.h.store.writes.toList())
            assertEquals(1, e.resetter.count)
        }
    }

    @Test
    fun `TC-ONB-025 confirm 200 triggers no social-login request`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("onboarding/signup__success.json"))
            e.repo.confirm("t")
            assertEquals(listOf(signup), e.h.dispatcher.recorded.map { it.requestUrl?.encodedPath })
        }
    }

    @Test
    fun `TC-ONB-038 confirm 200 for an already registered account is handled like a normal success`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("onboarding/signup__success.json"), MockResponses.fromFixture("onboarding/signup__success.json"))
            assertIs<ApiResult.Success<*>>(e.repo.confirm("t"))
            assertIs<ApiResult.Success<*>>(e.repo.confirm("t"))
            assertEquals(2, e.h.store.writes.size)
        }
    }

    @Test
    fun `TC-ONB-026 confirm 400 SIGNATURE_PROCESSING_PENDING is one request and persists nothing`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("onboarding/signup__signature-processing-pending.json"), MockResponses.fromFixture("onboarding/signup__success.json"))
            val error = e.repo.confirm("t").httpError()
            assertEquals(400, error.status)
            assertEquals(ErrorCode.SIGNATURE_PROCESSING_PENDING, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(signup).size)
            assertTrue(e.h.store.writes.isEmpty())
            assertEquals(0, e.resetter.count)
        }
    }

    @Test
    fun `TC-ONB-042 confirm 500 is sent exactly once and persists nothing`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponses.fromFixture("common/error__internal-500.json"), MockResponses.fromFixture("onboarding/signup__success.json"))
            assertEquals(500, e.repo.confirm("t").httpError().status)
            assertEquals(1, e.h.dispatcher.requests(signup).size)
            assertTrue(e.h.store.writes.isEmpty())
        }
    }

    @Test
    fun `TC-ONB-030 and TC-ONB-034 to TC-ONB-037 confirm error responses keep status and errorCode`() = runTest {
        val cases = listOf(
            Triple("onboarding/signup__unauthorized.json", 401, ErrorCode.UNAUTHORIZED),
            Triple("onboarding/signup__already-used-token.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("onboarding/signup__invalid-signature.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("onboarding/signup__upload-not-found.json", 404, ErrorCode.BUSINESS_ERROR),
            Triple("onboarding/signup__forbidden-banned.json", 403, ErrorCode.FORBIDDEN),
            Triple("onboarding/signup__already-registered-withdrawn.json", 400, ErrorCode.BUSINESS_ERROR),
        )
        env().use { e ->
            for ((fixture, status, code) in cases) {
                e.h.dispatcher.enqueue(signup, MockResponses.fromFixture(fixture))
                val error = e.repo.confirm("t").httpError()
                assertEquals(status, error.status, fixture)
                assertEquals(code, error.errorCode, fixture)
            }
            assertTrue(e.h.store.writes.isEmpty())
        }
    }

    @Test
    fun `TC-ONB-041 confirm network failure is reported as a network error and sent once`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(signup, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            assertIs<ApiError.Network>(e.repo.confirm("t").error())
            assertEquals(1, e.h.dispatcher.requests(signup).size)
        }
    }
}
