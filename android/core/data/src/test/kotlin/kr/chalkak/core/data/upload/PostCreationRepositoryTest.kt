@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.upload

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkConfig
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** `POST /posts/uploads` + `POST /posts` HTTP contract against MockWebServer and the shared `upload/` fixtures. */
class PostCreationRepositoryTest {
    private val clock = FakeClock()
    private val uploads = api("/posts/uploads")
    private val posts = api("/posts")
    private val topicId = "11111111-1111-4111-8111-111111111101"
    private val uploadId = "55555555-5555-4555-8555-555555555501"

    private class Env(val h: NetHarness, val repo: DefaultPostCreationRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(config: NetworkConfig = NetworkConfig()): Env {
        val h = NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), config = config, clock = clock)
        return Env(h, DefaultPostCreationRepository(h.client))
    }

    private fun fx(path: String) = MockResponses.fromFixture("upload/$path")

    private fun <T> ApiResult<T>.value(): T = assertIs<ApiResult.Success<T>>(this).value

    // ---- POST /posts/uploads ------------------------------------------------------------------------

    @Test
    fun `TC-UPL-023 uploads is a bodiless POST with Bearer and decodes the five policy fields`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__issued.json"))
            val policy = e.repo.requestUpload().value()
            assertEquals(uploadId, policy.uploadId)
            assertTrue(policy.uploadUrl.endsWith("/__upload/$uploadId?X-Amz-Expires=300"), policy.uploadUrl)
            assertEquals(300L, policy.expiresInSeconds)
            assertEquals("image/webp", policy.contentType)
            assertEquals(5_242_880L, policy.maxBytes)
            val req = e.h.dispatcher.requests(uploads).single()
            assertEquals("POST", req.method)
            assertEquals(0L, req.bodySize)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-UPL-024 maxBytes is returned as sent, small and large`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__issued-large-max.json"), fx("posts-uploads__issued-small-max.json"))
            val large = e.repo.requestUpload().value().maxBytes
            val small = e.repo.requestUpload().value().maxBytes
            assertTrue(large > 5_242_880L, "large=$large")
            assertTrue(small < 5_242_880L, "small=$small")
        }
    }

    @Test
    fun `TC-UPL-025 a non webp contentType is passed through, the repository does not judge it`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__content-type-png.json"))
            assertEquals("image/png", e.repo.requestUpload().value().contentType)
        }
    }

    @Test
    fun `TC-UPL-026 a policy with a missing uploadUrl is an InvalidResponse failure`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__missing-fields.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.requestUpload().error())
        }
    }

    @Test
    fun `TC-UPL-026 a blank uploadId or uploadUrl is an InvalidResponse failure`() = runTest {
        env().use { e ->
            val blank = """{"uploadId":"","uploadUrl":"https://x.test/p","expiresInSeconds":300,"contentType":"image/webp","maxBytes":5242880}"""
            val blankUrl = """{"uploadId":"u","uploadUrl":" ","expiresInSeconds":300,"contentType":"image/webp","maxBytes":5242880}"""
            e.h.dispatcher.enqueue(uploads, MockResponses.json(200, blank), MockResponses.json(200, blankUrl))
            assertIs<ApiError.InvalidResponse>(e.repo.requestUpload().error())
            assertIs<ApiError.InvalidResponse>(e.repo.requestUpload().error())
        }
    }

    @Test
    fun `TC-UPL-027 uploads 403 is surfaced once`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__403-banned.json"), fx("posts-uploads__issued.json"))
            val banned = e.repo.requestUpload().httpError()
            assertEquals(403, banned.status)
            assertEquals(ErrorCode.FORBIDDEN, banned.errorCode)
            assertEquals(1, e.h.dispatcher.requests(uploads).size)
        }
    }

    @Test
    fun `TC-UPL-027 uploads 500 is retried twice with 500ms then 1000ms of virtual time then fails`() = runTest {
        env().use { e ->
            repeat(3) { e.h.dispatcher.enqueue(uploads, fx("posts-uploads__500-server-error.json")) }
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__issued.json"))
            assertEquals(500, e.repo.requestUpload().httpError().status)
            assertEquals(3, e.h.dispatcher.requests(uploads).size)
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-UPL-029 a 500 followed by a success recovers inside the retry budget`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__500-server-error.json"), fx("posts-uploads__issued.json"))
            assertEquals(uploadId, e.repo.requestUpload().value().uploadId)
            assertEquals(2, e.h.dispatcher.requests(uploads).size)
        }
    }

    @Test
    fun `TC-UPL-027 uploads 401 with a rejected refresh ends as REAUTHENTICATION_REQUIRED`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(uploads, fx("posts-uploads__401-unauthorized.json"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
            val error = e.repo.requestUpload().httpError()
            assertEquals(401, error.status)
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, error.errorCode)
        }
    }

    // ---- POST /posts --------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-059 create sends topicId photoUploadId and title with Bearer and returns the 201 post`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__201-pending.json"))
            val created = e.repo.create(topicId, uploadId, "봄 산책").value()
            assertEquals("22222222-2222-4222-8222-222222222201", created.postId)
            assertEquals(ModerationStatus.PENDING, created.status)
            val req = e.h.dispatcher.requests(posts).single()
            assertEquals("POST", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            val json = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
            assertEquals(setOf("topicId", "photoUploadId", "title"), json.keys)
            assertEquals(topicId, json.getValue("topicId").jsonPrimitive.content)
            assertEquals(uploadId, json.getValue("photoUploadId").jsonPrimitive.content)
            assertEquals("봄 산책", json.getValue("title").jsonPrimitive.content)
        }
    }

    @Test
    fun `TC-UPL-060 a VALIDATING 201 is accepted`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__201-validating.json"))
            assertEquals(ModerationStatus.VALIDATING, e.repo.create(topicId, uploadId, null).value().status)
        }
    }

    @Test
    fun `TC-UPL-059 a null title is left out of the request body`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__201-pending.json"))
            e.repo.create(topicId, uploadId, null).value()
            val body = Json.parseToJsonElement(e.h.dispatcher.requests(posts).single().body.readUtf8()).jsonObject
            assertEquals(setOf("topicId", "photoUploadId"), body.keys)
        }
    }

    @Test
    fun `TC-UPL-061 an unknown moderationStatus on a 201 is an InvalidResponse failure`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__201-unknown-status.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.create(topicId, uploadId, null).error())
        }
    }

    @Test
    fun `TC-UPL-061 APPROVED or a missing status on a 201 is not a valid creation result`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(
                posts,
                MockResponses.json(201, """{"postId":"p","moderationStatus":"APPROVED"}"""),
                MockResponses.json(201, """{"postId":"p"}"""),
            )
            assertIs<ApiError.InvalidResponse>(e.repo.create(topicId, uploadId, null).error())
            assertIs<ApiError.InvalidResponse>(e.repo.create(topicId, uploadId, null).error())
        }
    }

    @Test
    fun `TC-UPL-062 to 065 business errors keep status and errorCode and are sent once`() = runTest {
        val cases = listOf(
            "posts-create__400-already-posted.json" to 400,
            "posts-create__400-topic-not-open.json" to 400,
            "posts-create__400-upload-expired.json" to 400,
            "posts-create__400-upload-used.json" to 400,
            "posts-create__400-rejected-unsupported-format.json" to 400,
            "posts-create__400-rejected-too-large.json" to 400,
            "posts-create__400-title-too-long.json" to 400,
            "posts-create__404-upload-not-found.json" to 404,
            "posts-create__404-topic-not-found.json" to 404,
        )
        cases.forEach { (file, status) ->
            env().use { e ->
                e.h.dispatcher.enqueue(posts, fx(file), fx("posts-create__201-pending.json"))
                val error = e.repo.create(topicId, uploadId, null).httpError()
                assertEquals(status, error.status, file)
                assertEquals(ErrorCode.BUSINESS_ERROR, error.errorCode, file)
                assertTrue(!error.message.isNullOrBlank(), "$file keeps the server message")
                assertEquals(1, e.h.dispatcher.requests(posts).size, file)
            }
        }
    }

    @Test
    fun `TC-UPL-067 create 403 is surfaced as FORBIDDEN and not retried`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__403-banned.json"), fx("posts-create__201-pending.json"))
            val error = e.repo.create(topicId, uploadId, null).httpError()
            assertEquals(403, error.status)
            assertEquals(ErrorCode.FORBIDDEN, error.errorCode)
            assertEquals(1, e.h.dispatcher.requests(posts).size)
        }
    }

    @Test
    fun `TC-UPL-068 create 500 is never retried automatically, a post must not be created twice`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__500-server-error.json"), fx("posts-create__201-pending.json"))
            assertEquals(500, e.repo.create(topicId, uploadId, null).httpError().status)
            assertEquals(1, e.h.dispatcher.requests(posts).size)
            assertEquals(0L, testScheduler.currentTime, "no backoff delay was spent")
        }
    }

    @Test
    fun `TC-UPL-066 create 401 refreshes once and resends the same body with the new token`() = runTest {
        env().use { e ->
            e.h.dispatcher.handle(posts) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fx("posts-create__201-pending.json")
                else MockResponses.fromFixture("common/error__unauthorized-token-invalid.json")
            }
            e.h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__success.json"))
            assertEquals(ModerationStatus.PENDING, e.repo.create(topicId, uploadId, "t").value().status)
            val sent = e.h.dispatcher.requests(posts)
            assertEquals(2, sent.size)
            assertEquals(sent[0].body.readUtf8(), sent[1].body.readUtf8())
        }
    }

    @Test
    fun `TC-UPL-069 a response timeout on create is a Network TIMEOUT failure sent once`() = runTest {
        env(NetworkConfig(responseTimeoutMs = 300)).use { e ->
            e.h.dispatcher.enqueue(posts, fx("posts-create__timeout.json"), fx("posts-create__201-pending.json"))
            val error = assertIs<ApiError.Network>(e.repo.create(topicId, uploadId, null).error())
            assertEquals(NetworkKind.TIMEOUT, error.kind)
            assertEquals(1, e.h.dispatcher.requests(posts).size)
        }
    }

    @Test
    fun `TC-UPL-059 the request DTO leaves a null title out and the response DTO keeps the status as text`() {
        val json = ApiJson.instance
        assertNull(json.parseToJsonElement(json.encodeToString(CreatePostRequest.serializer(), CreatePostRequest("t", "u"))).jsonObject["title"])
        assertEquals("PENDING", json.decodeFromString(CreatePostResponse.serializer(), """{"postId":"p","moderationStatus":"PENDING"}""").moderationStatus)
    }
}
