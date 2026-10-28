package kr.chalkak.core.data.upload.testing

import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.upload.CreatedPost
import kr.chalkak.core.data.upload.PostCreationRepository
import kr.chalkak.core.data.upload.PostImageUploader
import kr.chalkak.core.data.upload.UploadPolicy
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import java.util.concurrent.CopyOnWriteArrayList

const val UPLOAD_ID_1 = "55555555-5555-4555-8555-555555555501"
const val UPLOAD_ID_2 = "55555555-5555-4555-8555-555555555502"

/** Typed values from the `shared/fixtures/upload` files WITHOUT production mapping code (holder tests depend on the files only). */
object UploadFixtures {
    private fun obj(path: String): JsonObject = Fixtures.json(path).jsonObject

    fun policy(path: String): UploadPolicy = obj(path).let {
        UploadPolicy(
            uploadId = it.getValue("uploadId").jsonPrimitive.content,
            uploadUrl = it.getValue("uploadUrl").jsonPrimitive.content,
            expiresInSeconds = it.getValue("expiresInSeconds").jsonPrimitive.long,
            contentType = it.getValue("contentType").jsonPrimitive.content,
            maxBytes = it.getValue("maxBytes").jsonPrimitive.long,
        )
    }

    fun policyResult(path: String): ApiResult<UploadPolicy> = ApiResult.Success(policy(path))

    fun created(path: String): CreatedPost = obj(path).let {
        CreatedPost(
            postId = it.getValue("postId").jsonPrimitive.content,
            status = ModerationStatus.valueOf(it.getValue("moderationStatus").jsonPrimitive.content),
        )
    }

    fun createdResult(path: String): ApiResult<CreatedPost> = ApiResult.Success(created(path))

    /** An error fixture (`{errorCode, message}`, status from manifest.json) as the [ApiResult] the network layer produces. */
    fun failure(path: String): ApiResult.Failure {
        val status = Fixtures.manifestEntry(path).getValue("status").jsonPrimitive.int
        val body = obj(path)
        return ApiResult.Failure(
            ApiError.Http(status, ErrorCode.from(body["errorCode"]?.jsonPrimitive?.contentOrNull), body["message"]?.jsonPrimitive?.contentOrNull),
        )
    }

    fun http(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

    fun network(kind: NetworkKind = NetworkKind.OFFLINE) = ApiResult.Failure(ApiError.Network(kind))
}

/** One recorded `POST /posts`. */
data class CreateCall(val topicId: String, val uploadId: String, val title: String?)

/**
 * Scripted [PostCreationRepository]. Per endpoint: a FIFO of results, then [defaultPolicy] / [defaultCreate].
 * [uploadDelayMs] / [createDelayMs] are virtual time. [onUpload] / [onCreate] run at the start of each call and may suspend
 * (gates). Unscripted `requestUpload` issues `upload-N` (https URL, 300 s, image/webp, 5 MiB); unscripted `create` = 201 PENDING.
 */
class FakePostCreationRepository : PostCreationRepository {
    val uploadCalls = CopyOnWriteArrayList<Int>()
    val createCalls = CopyOnWriteArrayList<CreateCall>()
    val uploadResults = ArrayDeque<ApiResult<UploadPolicy>>()
    val createResults = ArrayDeque<ApiResult<CreatedPost>>()
    var uploadDelayMs = 0L
    var createDelayMs = 0L
    var onUpload: suspend (callNumber: Int) -> Unit = {}
    var onCreate: suspend (CreateCall) -> Unit = {}
    private var issued = 0

    fun policy(n: Int, maxBytes: Long = 5_242_880L, expiresInSeconds: Long = 300L, contentType: String = "image/webp") = UploadPolicy(
        uploadId = "upload-$n",
        uploadUrl = "https://upload.example.test/put/$n",
        expiresInSeconds = expiresInSeconds,
        contentType = contentType,
        maxBytes = maxBytes,
    )

    override suspend fun requestUpload(): ApiResult<UploadPolicy> {
        val n = ++issued
        uploadCalls += n
        onUpload(n)
        if (uploadDelayMs > 0) delay(uploadDelayMs)
        return uploadResults.removeFirstOrNull() ?: ApiResult.Success(policy(n))
    }

    override suspend fun create(topicId: String, uploadId: String, title: String?): ApiResult<CreatedPost> {
        val call = CreateCall(topicId, uploadId, title)
        createCalls += call
        onCreate(call)
        if (createDelayMs > 0) delay(createDelayMs)
        return createResults.removeFirstOrNull() ?: ApiResult.Success(CreatedPost("post-${createCalls.size}", ModerationStatus.PENDING))
    }
}

/** One recorded `PUT`. */
data class PutCall(val uploadUrl: String, val contentType: String, val bytes: ByteArray) {
    override fun equals(other: Any?) = other is PutCall && uploadUrl == other.uploadUrl && contentType == other.contentType && bytes.contentEquals(other.bytes)
    override fun hashCode() = 31 * (31 * uploadUrl.hashCode() + contentType.hashCode()) + bytes.contentHashCode()
}

/** Scripted [PostImageUploader]. Unscripted calls succeed. [onPut] may suspend (gate); [delayMs] is virtual time. */
class FakePostImageUploader : PostImageUploader {
    val calls = CopyOnWriteArrayList<PutCall>()
    val results = ArrayDeque<ApiResult<Unit>>()
    var delayMs = 0L
    var onPut: suspend (PutCall) -> Unit = {}

    override suspend fun put(uploadUrl: String, contentType: String, webp: ByteArray): ApiResult<Unit> {
        val call = PutCall(uploadUrl, contentType, webp.copyOf())
        calls += call
        onPut(call)
        if (delayMs > 0) delay(delayMs)
        return results.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }
}
