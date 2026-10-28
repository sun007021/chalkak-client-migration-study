@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.upload

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ConfigError
import kr.chalkak.core.network.OkHttpFactory
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Presigned `PUT` of the WebP bytes: TC-UPL-054..057. */
class PostImageUploaderTest {
    private val clock = FakeClock()
    private val path = "/__upload/55555555-5555-4555-8555-555555555501"

    private fun fx(name: String) = MockResponses.fromFixture("upload/$name")

    @Test
    fun `TC-UPL-054 PUT sends the policy contentType, the untouched bytes and no Authorization`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue(path, fx("s3-put__200.json"))
            val webp = ByteArray(2048) { (it * 7 % 251).toByte() }
            val result = PresignedPostImageUploader(h.client, OkHttpFactory.uploadClient())
                .put(h.server.url("$path?X-Amz-Expires=300").toString(), "image/webp", webp)
            assertEquals(ApiResult.Success(Unit), result)
            val req = h.dispatcher.recorded.single()
            assertEquals("PUT", req.method)
            assertEquals("image/webp", req.getHeader("Content-Type"))
            assertNull(req.getHeader("Authorization"))
            assertContentEquals(webp, req.body.readByteArray())
        }
    }

    @Test
    fun `TC-UPL-054 the Content-Type is exactly the policy value, not a hard coded webp`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue(path, fx("s3-put__200.json"))
            PresignedPostImageUploader(h.client, OkHttpFactory.uploadClient())
                .put(h.server.url(path).toString(), "image/png", byteArrayOf(1))
            assertEquals("image/png", h.dispatcher.recorded.single().getHeader("Content-Type"))
        }
    }

    @Test
    fun `TC-UPL-055 PUT 403 is a Failure sent once`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue(path, fx("s3-put__403-signature-mismatch.json"), fx("s3-put__200.json"))
            val result = PresignedPostImageUploader(h.client, OkHttpFactory.uploadClient())
                .put(h.server.url(path).toString(), "image/webp", byteArrayOf(1))
            assertEquals(403, result.httpError().status)
            assertEquals(1, h.dispatcher.recorded.size)
        }
    }

    @Test
    fun `TC-UPL-055 PUT 500 is retried twice with 500ms then 1000ms of virtual time`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            repeat(3) { h.dispatcher.enqueue(path, fx("s3-put__500-server-error.json")) }
            h.dispatcher.enqueue(path, fx("s3-put__200.json"))
            val result = PresignedPostImageUploader(h.client, OkHttpFactory.uploadClient())
                .put(h.server.url(path).toString(), "image/webp", byteArrayOf(1))
            assertEquals(500, result.httpError().status)
            assertEquals(3, h.dispatcher.recorded.size)
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-UPL-056 a non loopback http upload URL is rejected before anything is sent`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            val result = PresignedPostImageUploader(h.client, OkHttpFactory.uploadClient())
                .put("http://upload.example.test/55555555-5555-4555-8555-555555555507?X-Amz-Expires=300", "image/webp", byteArrayOf(1))
            val config = assertIs<ApiError.Config>(result.error())
            assertEquals(ConfigError.INSECURE_HTTP, config.reason)
            assertTrue(h.dispatcher.recorded.isEmpty())
        }
    }
}
