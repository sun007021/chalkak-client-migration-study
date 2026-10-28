package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.data.upload.CreatedPost
import kr.chalkak.core.data.upload.testing.UploadFixtures
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ConfigError
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.upload.edit.PhotoEdit
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** TC-UPL-048..078, 083 and 086: "전시하기" - lease check, PUT, POST, error mapping, recovery. */
class SubmitFlowTest {
    private fun UploadRig.todayAnswers(vararg answers: ApiResult<TodayPost>) {
        val queue = ArrayDeque(answers.toList())
        home.todayHandler = { queue.removeFirstOrNull() ?: answers.last() }
    }

    private fun today(path: String): ApiResult<TodayPost> = ApiResult.Success(HomeFixtureModels.today(path))

    private val successes: (UploadRig) -> List<UploadEffect.ShowSuccess> = { it.effects.filterIsInstance<UploadEffect.ShowSuccess>() }

    // ---- ordering and waiting ----------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-048 submitting while the photo is still preparing waits, shows the submitting label, then goes on by itself`() = runTest {
        val rig = uploadRig()
        val gate = CompletableDeferred<Unit>()
        rig.creation.onUpload = { gate.await() }
        rig.show()
        rig.pickAndConfirm()
        rig.holder.onSubmitClicked()
        rig.t.runCurrent()
        assertEquals(true, rig.s.submitting)
        assertEquals(UploadCopyKeys.SUBMITTING, rig.s.submitLabelKey)
        assertTrue(rig.uploader.calls.isEmpty())
        assertTrue(rig.creation.createCalls.isEmpty())
        gate.complete(Unit)
        rig.idle()
        assertEquals(1, rig.uploader.calls.size)
        assertEquals(1, rig.creation.createCalls.size)
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-048 the order is PUT first and POST second`() = runTest {
        val rig = uploadRig()
        val order = mutableListOf<String>()
        rig.uploader.onPut = { order += "put" }
        rig.creation.onCreate = { order += "post" }
        rig.ready()
        rig.submit()
        assertEquals(listOf("put", "post"), order)
    }

    // ---- URL lease ---------------------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-049 a policy 294_999 seconds old is still used`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.advanceSeconds(294.999)
        rig.submit()
        assertEquals(1, rig.creation.uploadCalls.size)
        assertEquals("https://upload.example.test/put/1", rig.uploader.calls.single().uploadUrl)
        assertEquals("upload-1", rig.creation.createCalls.single().uploadId)
    }

    @Test
    fun `TC-UPL-049 the lease starts when the policy arrives, not when encoding ends`() = runTest {
        val rig = uploadRig()
        rig.compressor.onCall = { _, _ -> rig.advanceSeconds(100.0) }
        rig.ready()
        rig.advanceSeconds(196.0)
        rig.submit()
        assertEquals(2, rig.creation.uploadCalls.size, "296 s after the policy: expired")
    }

    @Test
    fun `TC-UPL-050 a policy 295 299 or 301 seconds old is replaced, PUT and POST use the new uploadId`() = runTest {
        listOf(295.0, 299.0, 301.0).forEach { seconds ->
            val rig = uploadRig()
            rig.ready()
            rig.advanceSeconds(seconds)
            rig.submit()
            assertEquals(2, rig.creation.uploadCalls.size, "at $seconds s")
            assertEquals("https://upload.example.test/put/2", rig.uploader.calls.single().uploadUrl)
            assertEquals("upload-2", rig.creation.createCalls.single().uploadId)
        }
    }

    @Test
    fun `TC-UPL-051 expiry follows the monotonic clock only (100 s keeps the policy, 296 s replaces it)`() = runTest {
        val keep = uploadRig()
        keep.ready()
        keep.advanceSeconds(100.0) // wall clock +10 min would not matter: the holder has no wall clock input
        keep.submit()
        assertEquals(1, keep.creation.uploadCalls.size)
        val replace = uploadRig()
        replace.ready()
        replace.advanceSeconds(296.0)
        replace.submit()
        assertEquals(2, replace.creation.uploadCalls.size)
    }

    @Test
    fun `TC-UPL-052 a re-issued policy with enough room reuses the encoded file and uses the new uploadId`() = runTest {
        val rig = uploadRig()
        rig.ready()
        val encodedCalls = rig.compressor.calls.size
        val firstBytes = bytesOf(1_000, 90)
        rig.advanceSeconds(301.0)
        rig.submit()
        assertEquals(encodedCalls, rig.compressor.calls.size, "no new encode")
        assertContentEquals(firstBytes, rig.uploader.calls.single().bytes)
        assertEquals("upload-2", rig.creation.createCalls.single().uploadId)
    }

    @Test
    fun `TC-UPL-052 a re-issued policy with a smaller maxBytes re-encodes the original with the saved edit`() = runTest {
        val rig = uploadRig()
        val edit = PhotoEdit(quarterTurns = 1)
        rig.compressor.sizeFor = { _, q -> if (q == 90) 1_000 else 400 }
        rig.ready(edit = edit)
        rig.creation.uploadResults += ApiResult.Success(rig.creation.policy(2, maxBytes = 500L))
        rig.advanceSeconds(301.0)
        rig.submit()
        assertEquals(2, rig.codec.renderedEdits.size)
        assertEquals(listOf(edit, edit), rig.codec.renderedEdits.toList(), "the saved edit is applied again to the original")
        assertEquals(2, rig.codec.decodeCalls.size)
        val sent = rig.uploader.calls.single()
        assertTrue(sent.bytes.size <= 500, "sent ${sent.bytes.size} bytes")
        assertEquals("upload-2", rig.creation.createCalls.single().uploadId)
    }

    @Test
    fun `TC-UPL-053 a re-issued policy that is not image-webp uploads nothing and shows the prepare message`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.creation.uploadResults += UploadFixtures.policyResult("upload/posts-uploads__content-type-png.json")
        rig.advanceSeconds(301.0)
        rig.submit()
        assertTrue(rig.uploader.calls.isEmpty())
        assertTrue(rig.creation.createCalls.isEmpty())
        assertEquals(UploadCopyKeys.ERROR_PREPARE, rig.s.error?.copyKey)
        assertEquals(false, rig.s.submitting)
        assertEquals(photo(), rig.s.photo)
    }

    // ---- PUT -----------------------------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-054 the PUT carries the policy url, the policy content type and the encoded bytes untouched`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.submit()
        val put = rig.uploader.calls.single()
        assertEquals("https://upload.example.test/put/1", put.uploadUrl)
        assertEquals("image/webp", put.contentType)
        assertContentEquals(bytesOf(1_000, 90), put.bytes)
    }

    @Test
    fun `TC-UPL-055 a rejected PUT shows the upload message, keeps the input and drops the policy for the next submit`() = runTest {
        listOf("upload/s3-put__403-signature-mismatch.json" to 403, "upload/s3-put__500-server-error.json" to 500).forEach { (_, status) ->
            val rig = uploadRig()
            rig.show()
            rig.holder.onTitleChanged("제목")
            rig.pickAndConfirm()
            rig.uploader.results += ApiResult.Failure(ApiError.Http(status, ErrorCode.BUSINESS_ERROR))
            rig.submit()
            assertEquals(UploadCopyKeys.ERROR_UPLOAD, rig.s.error?.copyKey, "status $status")
            assertTrue(rig.creation.createCalls.isEmpty())
            assertEquals(photo(), rig.s.photo)
            assertEquals("제목", rig.s.title)
            assertEquals(false, rig.s.submitting)
            rig.submit()
            assertEquals(2, rig.creation.uploadCalls.size, "a new policy is requested")
            assertEquals("upload-2", rig.creation.createCalls.single().uploadId)
            assertEquals(2, rig.uploader.calls.size)
        }
    }

    @Test
    fun `TC-UPL-055 a PUT connection failure shows the network message and the same policy is used again`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.uploader.results += UploadFixtures.network(NetworkKind.OFFLINE)
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_NETWORK, rig.s.error?.copyKey)
        assertEquals(photo(), rig.s.photo)
        rig.submit()
        assertEquals(1, rig.creation.uploadCalls.size)
        assertEquals(2, rig.uploader.calls.size)
        assertEquals("https://upload.example.test/put/1", rig.uploader.calls.last().uploadUrl)
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-056 a PUT the transport refuses (insecure or malformed url) is an upload failure, nothing is posted`() = runTest {
        listOf(ConfigError.INSECURE_HTTP, ConfigError.MALFORMED).forEach { reason ->
            val rig = uploadRig()
            rig.ready()
            rig.uploader.results += ApiResult.Failure(ApiError.Config(reason))
            rig.submit()
            assertEquals(UploadCopyKeys.ERROR_UPLOAD, rig.s.error?.copyKey, "for $reason")
            assertTrue(rig.creation.createCalls.isEmpty())
        }
    }

    @Test
    fun `TC-UPL-058 the size limit of the policy decides, not the 5 MiB default`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += ApiResult.Success(rig.creation.policy(1, maxBytes = 1_000_000L))
        rig.compressor.sizeFor = { _, q -> if (q == 90) 2_000_000 else 900_000 }
        rig.ready()
        rig.submit()
        val sent = rig.uploader.calls.single().bytes
        assertEquals(900_000, sent.size)
        assertTrue(sent.size <= 1_000_000)
    }

    // ---- success and create-side errors -----------------------------------------------------------------------

    @Test
    fun `TC-UPL-060 201 pending and validating both lead to the success screen with their own status, and the post is announced`() = runTest {
        listOf(ModerationStatus.PENDING, ModerationStatus.VALIDATING).forEach { status ->
            val rig = uploadRig()
            rig.creation.createResults += ApiResult.Success(CreatedPost("post-77", status))
            rig.ready()
            rig.submit()
            val info = successes(rig).single().info
            assertEquals(status, info.status)
            assertEquals("post-77", info.postId)
            assertEquals(ENTRY_DATE, info.topicDate)
            assertEquals(TOPIC_FIXTURE.title, info.topicTitle)
            assertEquals(1, rig.published.size)
            assertEquals("post-77", rig.published.single().postId)
            assertEquals(ENTRY_DATE, rig.published.single().topicDate)
            assertEquals(status, rig.published.single().status)
            assertTrue(rig.files.live.isEmpty(), "temp file is removed after success")
            assertEquals(true, rig.s.completed)
        }
    }

    @Test
    fun `TC-UPL-060 the fixture answers (201 pending and validating) map to the same results`() = runTest {
        val pending = UploadFixtures.created("upload/posts-create__201-pending.json")
        val validating = UploadFixtures.created("upload/posts-create__201-validating.json")
        assertEquals(ModerationStatus.PENDING, pending.status)
        assertEquals(ModerationStatus.VALIDATING, validating.status)
        val rig = uploadRig()
        rig.creation.createResults += ApiResult.Success(validating)
        rig.ready()
        rig.submit()
        assertEquals(validating.postId, successes(rig).single().info.postId)
    }

    @Test
    fun `TC-UPL-061 a 201 with an unknown status is a contract violation that is recovered through today`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += ApiResult.Failure(ApiError.InvalidResponse("unknown moderationStatus"))
        rig.ready()
        rig.todayAnswers(today("home/posts-today__posted-pending.json"))
        rig.submit()
        assertEquals(1, rig.creation.createCalls.size)
        assertEquals(1, rig.home.todayCalls.size)
        assertEquals(ModerationStatus.PENDING, successes(rig).single().info.status)
    }

    @Test
    fun `TC-UPL-062 400 then today says posted shows the duplicate message whatever the server text is`() = runTest {
        listOf("이미 해당 주제에 게시물을 작성했습니다.", "something else entirely", null).forEach { message ->
            val rig = uploadRig()
            rig.creation.createResults += ApiResult.Failure(ApiError.Http(400, ErrorCode.BUSINESS_ERROR, message))
            rig.ready()
            rig.todayAnswers(today("home/posts-today__posted-pending.json"))
            rig.submit()
            assertEquals(UploadCopyKeys.ERROR_DUPLICATE, rig.s.error?.copyKey, "message=$message")
            assertNull(rig.s.error?.serverMessage)
            assertTrue(successes(rig).isEmpty())
            assertEquals(1, rig.creation.createCalls.size)
        }
    }

    @Test
    fun `TC-UPL-062 the real already-posted fixture behaves the same`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__400-already-posted.json")
        rig.ready()
        rig.todayAnswers(today("home/posts-today__posted-pending.json"))
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_DUPLICATE, rig.s.error?.copyKey)
    }

    @Test
    fun `TC-UPL-063 400 then today 404 or another topicDate shows the topic-changed message whatever the server text is`() = runTest {
        listOf(
            HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json"),
            today("upload/posts-today__topic-date-changed.json"),
        ).forEach { answer ->
            listOf("현재 게시물을 작성할 수 없는 주제입니다.", "different words").forEach { message ->
                val rig = uploadRig()
                rig.creation.createResults += ApiResult.Failure(ApiError.Http(400, ErrorCode.BUSINESS_ERROR, message))
                rig.ready()
                rig.todayAnswers(answer)
                rig.submit()
                assertEquals(UploadCopyKeys.ERROR_TOPIC_CHANGED, rig.s.error?.copyKey, "message=$message answer=$answer")
            }
        }
    }

    @Test
    fun `TC-UPL-064 other 400s show the server message, throw the preparation away and the next submit prepares from the policy on`() = runTest {
        listOf(
            "upload/posts-create__400-upload-expired.json",
            "upload/posts-create__400-upload-used.json",
            "upload/posts-create__400-rejected-unsupported-format.json",
            "upload/posts-create__400-rejected-too-large.json",
        ).forEach { path ->
            val failure = UploadFixtures.failure(path)
            val rig = uploadRig()
            rig.creation.createResults += failure
            rig.show()
            rig.holder.onTitleChanged("제목")
            rig.pickAndConfirm()
            rig.todayAnswers(today("home/posts-today__not-posted.json"))
            rig.submit()
            assertEquals((failure.error as ApiError.Http).message, rig.s.error?.serverMessage, path)
            assertNull(rig.s.error?.copyKey)
            assertEquals(photo(), rig.s.photo)
            assertEquals("제목", rig.s.title)
            assertEquals(Preparation.None, rig.s.preparation)
            assertEquals(1, rig.creation.uploadCalls.size, "no automatic re-preparation")
            val encodes = rig.compressor.calls.size
            rig.submit()
            assertEquals(2, rig.creation.uploadCalls.size, "policy requested again")
            assertTrue(rig.compressor.calls.size > encodes, "encoded again")
            assertEquals("upload-2", rig.creation.createCalls.last().uploadId)
            assertEquals(1, successes(rig).size)
        }
    }

    @Test
    fun `TC-UPL-065 404 on POST is a plain create failure and the preparation restarts from the policy`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__404-upload-not-found.json")
        rig.ready()
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_CREATE, rig.s.error?.copyKey)
        assertEquals(photo(), rig.s.photo)
        rig.submit()
        assertEquals(2, rig.creation.uploadCalls.size)
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-066 a 401 on POST goes to login and the photo, title and prepared state survive until the session ends`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        rig.submit()
        assertTrue(UploadEffect.ReauthRequired in rig.effects)
        assertEquals(photo(), rig.s.photo)
        assertEquals("제목", rig.s.title)
        assertEquals(false, rig.s.submitting)
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(1, rig.creation.createCalls.size)
    }

    @Test
    fun `TC-UPL-067 a banned member gets the banned message on POST and no second request`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__403-banned.json")
        rig.ready()
        rig.submit()
        assertEquals(UploadCopyKeys.GATE_BANNED, rig.s.error?.copyKey)
        assertEquals(1, rig.creation.createCalls.size)
        assertTrue(rig.home.todayCalls.isEmpty())
    }

    @Test
    fun `TC-UPL-068 a 500 on POST is sent once, shows the create message and keeps the input`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__500-server-error.json")
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_CREATE, rig.s.error?.copyKey)
        assertEquals(1, rig.creation.createCalls.size)
        assertTrue(rig.home.todayCalls.isEmpty(), "a 5xx is not a lost response")
        assertEquals(photo(), rig.s.photo)
        assertEquals("제목", rig.s.title)
        assertEquals(true, rig.s.canSubmit)
    }

    // ---- lost response ----------------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-069 a lost POST response is not re-sent, today says posted and the success screen shows once with today's status`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.network(NetworkKind.TIMEOUT)
        rig.ready()
        rig.todayAnswers(today("home/posts-today__posted-validating.json"))
        rig.submit()
        assertEquals(1, rig.creation.createCalls.size)
        val shown = successes(rig)
        assertEquals(1, shown.size)
        assertEquals(ModerationStatus.VALIDATING, shown.single().info.status)
        assertEquals(1, rig.published.size)
    }

    @Test
    fun `TC-UPL-070 a lost response and today not posted shows the network message and allows resubmitting with the same uploadId`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.network(NetworkKind.TIMEOUT)
        rig.ready()
        rig.todayAnswers(today("home/posts-today__not-posted.json"))
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_NETWORK, rig.s.error?.copyKey)
        assertEquals(true, rig.s.canSubmit)
        rig.submit()
        assertEquals(2, rig.creation.createCalls.size)
        assertEquals(rig.creation.createCalls[0].uploadId, rig.creation.createCalls[1].uploadId)
        assertEquals(1, rig.creation.uploadCalls.size, "no new policy")
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-071 a lost response and a failing today shows the network message, a later duplicate 400 shows the duplicate message`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.network(NetworkKind.TIMEOUT)
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__400-already-posted.json")
        rig.ready()
        rig.todayAnswers(
            HomeFixtureModels.failure("home/posts-today__500-server-error.json"),
            today("home/posts-today__posted-pending.json"),
        )
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_NETWORK, rig.s.error?.copyKey)
        assertEquals(true, rig.s.canSubmit)
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_DUPLICATE, rig.s.error?.copyKey)
        assertTrue(successes(rig).isEmpty())
    }

    @Test
    fun `TC-UPL-072 a resubmit 59 minutes 59 seconds later still sends POST, a server expired answer shows its text and starts over`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.network(NetworkKind.TIMEOUT)
        rig.ready()
        rig.todayAnswers(today("home/posts-today__not-posted.json"))
        rig.submit()
        rig.advanceSeconds(59 * 60 + 59.0)
        rig.submit()
        assertEquals(2, rig.creation.createCalls.size, "the resubmit POST is sent")
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-072 after 61 minutes the server says the upload id expired, its text is shown and preparation restarts`() = runTest {
        val rig = uploadRig()
        val expired = UploadFixtures.failure("upload/posts-create__400-upload-expired.json")
        rig.creation.createResults += UploadFixtures.network(NetworkKind.TIMEOUT)
        rig.creation.createResults += expired
        rig.ready()
        rig.todayAnswers(today("home/posts-today__not-posted.json"))
        rig.submit()
        rig.advanceSeconds(61 * 60.0)
        rig.submit()
        assertEquals((expired.error as ApiError.Http).message, rig.s.error?.serverMessage)
        assertEquals(Preparation.None, rig.s.preparation)
        val policies = rig.creation.uploadCalls.size
        rig.submit()
        assertEquals(policies + 1, rig.creation.uploadCalls.size)
    }

    // ---- guards and tap handling ----------------------------------------------------------------------------

    @Test
    fun `TC-UPL-073 tapping repeatedly while submitting sends one PUT and one POST and one success`() = runTest {
        val rig = uploadRig()
        rig.ready()
        val gate = CompletableDeferred<Unit>()
        rig.uploader.onPut = { gate.await() }
        repeat(5) { rig.holder.onSubmitClicked() }
        rig.t.runCurrent()
        repeat(3) { rig.holder.onSubmitClicked() }
        gate.complete(Unit)
        rig.idle()
        repeat(3) { rig.holder.onSubmitClicked() }
        rig.idle()
        assertEquals(1, rig.uploader.calls.size)
        assertEquals(1, rig.creation.createCalls.size)
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-074 after a failed submit photo and title are unchanged and a new submit works`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += UploadFixtures.failure("upload/posts-create__500-server-error.json")
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        rig.submit()
        assertEquals(photo(), rig.s.photo)
        assertEquals("제목", rig.s.title)
        assertEquals(false, rig.s.submitting)
        rig.submit()
        assertEquals("제목", rig.creation.createCalls.last().title)
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-075 a topic that is no longer open after midnight shows the topic-changed message, an entry-time topic that is still open succeeds`() = runTest {
        val closed = uploadRig()
        closed.creation.createResults += UploadFixtures.failure("upload/posts-create__400-topic-not-open.json")
        closed.ready()
        closed.todayAnswers(today("upload/posts-today__topic-date-changed.json"))
        closed.submit()
        assertEquals(UploadCopyKeys.ERROR_TOPIC_CHANGED, closed.s.error?.copyKey)
        assertEquals(TOPIC_FIXTURE.id, closed.creation.createCalls.single().topicId, "the entry-time topicId was sent")
        val open = uploadRig()
        open.ready()
        open.submit()
        assertEquals(TOPIC_FIXTURE.id, open.creation.createCalls.single().topicId)
        assertEquals(1, successes(open).size)
    }

    @Test
    fun `TC-UPL-077 offline submit shows the network message and keeps the input, back online it succeeds`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        rig.uploader.results += UploadFixtures.network(NetworkKind.OFFLINE)
        rig.submit()
        assertEquals(UploadCopyKeys.ERROR_NETWORK, rig.s.error?.copyKey)
        assertEquals("제목", rig.s.title)
        rig.submit()
        assertEquals(1, successes(rig).size)
    }

    @Test
    fun `TC-UPL-078 when the session ends everything is forgotten and the temp files are gone`() = runTest {
        val rig = uploadRig()
        rig.creation.createResults += ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        rig.submit()
        assertTrue(rig.files.live.isNotEmpty())
        rig.holder.onSessionEnded()
        rig.idle()
        assertTrue(rig.files.live.isEmpty())
        assertNull(rig.s.photo)
        assertEquals("", rig.s.title)
        assertEquals(Preparation.None, rig.s.preparation)
        val createsBefore = rig.creation.createCalls.size
        rig.holder.onSubmitClicked()
        rig.idle()
        assertEquals(createsBefore, rig.creation.createCalls.size, "nothing left to submit")
    }

    @Test
    fun `TC-UPL-079 leaving during the PUT or the POST cancels, shows no success and leaves no file`() = runTest {
        val duringPut = uploadRig()
        duringPut.ready()
        val putGate = CompletableDeferred<Unit>()
        duringPut.uploader.onPut = { putGate.await() }
        duringPut.holder.onSubmitClicked()
        duringPut.t.runCurrent()
        duringPut.holder.onScreenGone()
        putGate.complete(Unit)
        duringPut.idle()
        assertTrue(duringPut.creation.createCalls.isEmpty())
        assertTrue(successes(duringPut).isEmpty())
        assertTrue(duringPut.files.live.isEmpty())

        val duringPost = uploadRig()
        duringPost.ready()
        val postGate = CompletableDeferred<Unit>()
        duringPost.creation.onCreate = { postGate.await() }
        duringPost.holder.onSubmitClicked()
        duringPost.t.runCurrent()
        duringPost.holder.onScreenGone()
        postGate.complete(Unit)
        duringPost.idle()
        assertTrue(successes(duringPost).isEmpty())
        assertTrue(duringPost.published.isEmpty())
        assertTrue(duringPost.files.live.isEmpty())
    }

    @Test
    fun `TC-UPL-083 a 400 for a too long title shows the server message and keeps the input`() = runTest {
        val failure = UploadFixtures.failure("upload/posts-create__400-title-too-long.json")
        val rig = uploadRig()
        rig.creation.createResults += failure
        rig.show()
        rig.holder.onTitleChanged("가나다라마바사아자차")
        rig.pickAndConfirm()
        rig.todayAnswers(today("home/posts-today__not-posted.json"))
        rig.submit()
        assertEquals((failure.error as ApiError.Http).message, rig.s.error?.serverMessage)
        assertEquals("가나다라마바사아자차", rig.s.title)
        assertEquals(photo(), rig.s.photo)
    }

    // ---- success screen ------------------------------------------------------------------------------------------

    @Test
    fun `TC-UPL-086 confirming the success screen opens the exhibition of the uploaded date, and the upload screen cannot submit again`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.submit()
        assertEquals(true, rig.s.completed)
        rig.holder.onSuccessConfirmed()
        rig.idle()
        assertEquals(UploadEffect.OpenDisplay(ENTRY_DATE), rig.effects.last())
        rig.holder.onSubmitClicked()
        rig.idle()
        assertEquals(1, rig.creation.createCalls.size, "no second post from the same screen")
        assertEquals(1, rig.uploader.calls.size)
        assertEquals(false, rig.s.canSubmit)
    }
}
