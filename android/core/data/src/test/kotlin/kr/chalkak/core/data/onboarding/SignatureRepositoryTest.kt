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
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.OkHttpFactory
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
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Settings signature HTTP contract (GET / change uploads / PUT) against MockWebServer + shared fixtures. */
class SignatureRepositoryTest {
    private val clock = FakeClock()
    private val me = api("/users/me/signature")
    private val uploads = api("/users/me/signature/uploads")
    private val uploadPath = "/__upload/55555555-5555-4555-8555-555555555521"

    private class Env(val h: NetHarness, val repo: DefaultSignatureRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.User(TestSessions.user(clock))): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultSignatureRepository(h.client))
    }

    private fun Env.uploadsSuccess(): MockResponse {
        val origin = h.server.url("/").toString().trimEnd('/')
        return MockResponses.json(200, Fixtures.read("signature/users-me-signature-uploads__success.json").replace("http://localhost:4010", origin))
    }

    private fun fixture(path: String) = MockResponses.fromFixture(path)

    // ---- GET --------------------------------------------------------------------------------

    @Test
    fun `TC-SIGN-026 GET uses the thumbnail and falls back to the original when the thumbnail is null`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__get-success.json"), fixture("signature/users-me-signature__get-thumbnail-null.json"))
            val full = assertIs<ApiResult.Success<SignatureImages>>(e.repo.current()).value
            assertTrue(full.displayUrl.endsWith("/thumbnail.png"), full.displayUrl)
            val noThumb = assertIs<ApiResult.Success<SignatureImages>>(e.repo.current()).value
            assertNull(noThumb.thumbnailUrl)
            assertTrue(noThumb.displayUrl.endsWith("/original.png"), noThumb.displayUrl)
            val req = e.h.dispatcher.requests(me).first()
            assertEquals("GET", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-SIGN-040 GET 400 SIGNATURE_REGISTRATION_REQUIRED is surfaced with its errorCode`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__get-registration-required.json"))
            val error = e.repo.current().httpError()
            assertEquals(400, error.status)
            assertEquals(ErrorCode.SIGNATURE_REGISTRATION_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-SIGN-039 GET works for a banned member (plain 200 without special handling)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__get-success.json"))
            assertIs<ApiResult.Success<SignatureImages>>(e.repo.current())
        }
    }

    // ---- change step 1: uploads -------------------------------------------------------------

    @Test
    fun `TC-SIGN-019 and TC-SIGN-020 uploads is a bodiless POST with Bearer and decodes without contentType or maxBytes`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, e.uploadsSuccess())
            val upload = assertIs<ApiResult.Success<SignatureUpload>>(e.repo.requestUpload()).value
            assertEquals("55555555-5555-4555-8555-555555555521", upload.uploadId)
            assertTrue(upload.uploadUrl.endsWith("$uploadPath?X-Amz-Expires=300"), upload.uploadUrl)
            val req = e.h.dispatcher.requests(uploads).single()
            assertEquals("POST", req.method)
            assertEquals(0L, req.bodySize)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-SIGN-020 upload DTO reads uploadId uploadUrl and expiresInSeconds only`() {
        val dto = ApiJson.instance.decodeFromString(SignatureUploadResponse.serializer(), Fixtures.read("signature/users-me-signature-uploads__success.json"))
        assertEquals(300L, dto.expiresInSeconds)
        assertEquals("55555555-5555-4555-8555-555555555521", dto.uploadId)
    }

    @Test
    fun `TC-SIGN-030 uploads 403 FORBIDDEN is surfaced without retry`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fixture("signature/users-me-signature-uploads__forbidden-banned.json"), e.uploadsSuccess())
            val error = e.repo.requestUpload().httpError()
            assertEquals(403, error.status)
            assertEquals(ErrorCode.FORBIDDEN, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(uploads).size)
        }
    }

    @Test
    fun `TC-SIGN-035 uploads 500 is retried twice with 500ms then 1000ms of virtual time then fails`() = runTest {
        env().use { e ->
            val server500 = { fixture("signature/users-me-signature__put-internal-error.json") }
            e.h.dispatcher.enqueue(uploads, server500(), server500(), server500(), e.uploadsSuccess())
            val result = e.repo.requestUpload()
            assertEquals(500, result.httpError().status)
            assertEquals(3, e.h.dispatcher.requests(uploads).size)
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    // ---- change step 2: presigned PUT -------------------------------------------------------

    @Test
    fun `TC-SIGN-021 PUT sends image png without Authorization and with the PNG bytes`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploadPath, fixture("signature/presigned-put__ok.json"))
            val png = ByteArray(1500) { (it % 199).toByte() }
            val result = PresignedSignatureUploader(e.h.client, OkHttpFactory.uploadClient())
                .put(e.h.server.url("$uploadPath?X-Amz-Expires=300").toString(), png)
            assertEquals(ApiResult.Success(Unit), result)
            val req = e.h.dispatcher.recorded.single()
            assertEquals("image/png", req.getHeader("Content-Type"))
            assertNull(req.getHeader("Authorization"))
            assertContentEquals(png, req.body.readByteArray())
        }
    }

    @Test
    fun `TC-SIGN-023 PUT 403 is a Failure the holder can stop on`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploadPath, fixture("signature/presigned-put__forbidden.json"))
            val result = PresignedSignatureUploader(e.h.client, OkHttpFactory.uploadClient())
                .put(e.h.server.url("$uploadPath?X-Amz-Expires=300").toString(), byteArrayOf(1))
            assertEquals(403, result.httpError().status)
        }
    }

    // ---- change step 3: PUT /users/me/signature ---------------------------------------------

    @Test
    fun `TC-SIGN-022 confirm body is signatureOriginalUploadId only and the response URL is discarded`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__put-success.json"))
            val result = e.repo.confirm("55555555-5555-4555-8555-555555555521")
            assertEquals(ApiResult.Success(Unit), result)
            val req = e.h.dispatcher.requests(me).single()
            assertEquals("PUT", req.method)
            val json: JsonObject = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
            assertEquals(setOf("signatureOriginalUploadId"), json.keys)
            assertEquals("55555555-5555-4555-8555-555555555521", json.getValue("signatureOriginalUploadId").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-SIGN-027 confirm result carries no image URL so the old URL cannot be mistaken for the new signature`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__put-success.json"))
            assertEquals(ApiResult.Success(Unit), e.repo.confirm("u"))
        }
    }

    @Test
    fun `TC-SIGN-028 confirm 400 SIGNATURE_REUPLOAD_REQUIRED keeps its errorCode`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__put-reupload-required.json"))
            val error = e.repo.confirm("u").httpError()
            assertEquals(400, error.status)
            assertEquals(ErrorCode.SIGNATURE_REUPLOAD_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-SIGN-031 confirm 403 FORBIDDEN is surfaced and sent once`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__put-forbidden-banned.json"), fixture("signature/users-me-signature__put-success.json"))
            val error = e.repo.confirm("u").httpError()
            assertEquals(403, error.status)
            assertEquals(ErrorCode.FORBIDDEN, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(me).size)
        }
    }

    @Test
    fun `TC-SIGN-029 and TC-SIGN-032 confirm 400 and 404 BUSINESS_ERROR keep their status`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(me, fixture("signature/users-me-signature__put-invalid-signature.json"), fixture("signature/users-me-signature__put-upload-not-found.json"))
            val invalid = e.repo.confirm("u").httpError()
            assertEquals(400, invalid.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, invalid.errorCode)
            val notFound = e.repo.confirm("u").httpError()
            assertEquals(404, notFound.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, notFound.errorCode)
        }
    }

    @Test
    fun `TC-SIGN-033 confirm 401 refreshes once and resends the original request with the new token`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(me) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fixture("signature/users-me-signature__put-success.json") else unauthorized()
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(ApiResult.Success(Unit), e.repo.confirm("u"))
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(2, e.h.dispatcher.requests(me).size)
        }
    }

    @Test
    fun `TC-SIGN-033 uploads 401 whose refresh is rejected ends as REAUTHENTICATION_REQUIRED`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, unauthorized())
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val error = e.repo.requestUpload().httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, error.errorCode)
        }
    }

    @Test
    fun `TC-SIGN-034 network failure on confirm is reported as a network error`() = runTest {
        env().use { e ->
            repeat(3) { e.h.dispatcher.enqueue(me, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }
            assertIs<ApiError.Network>(e.repo.confirm("u").error())
        }
    }
}
