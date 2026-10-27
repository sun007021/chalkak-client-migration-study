package kr.chalkak.core.data.onboarding.testing

import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.onboarding.SignatureImages
import kr.chalkak.core.data.onboarding.SignatureRepository
import kr.chalkak.core.data.onboarding.SignatureUpload
import kr.chalkak.core.data.onboarding.SignatureUploader
import kr.chalkak.core.data.onboarding.SignupRepository
import kr.chalkak.core.data.onboarding.SignupUpload
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.core.network.Session
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

fun httpFailure(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

fun networkFailure(kind: NetworkKind = NetworkKind.OFFLINE) = ApiResult.Failure(ApiError.Network(kind))

fun signupSession(): Session = Session(
    userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    accessToken = "fixture-access-token-1",
    accessExpiresAt = Instant.parse("2026-09-17T00:15:00Z"),
    refreshToken = "fixture-refresh-token-1",
    refreshExpiresAt = Instant.parse("2026-10-17T00:00:00Z"),
)

/** Scripted [SignupRepository]. Unscripted calls succeed. Gates let a test hold a call in flight. */
class FakeSignupRepository(val log: EventLog = EventLog()) : SignupRepository {
    val uploadCalls = CopyOnWriteArrayList<Pair<String, String>>()
    val confirmCalls = CopyOnWriteArrayList<String>()
    /** Virtual time (ms) of every confirm call; set [timeSource] to `{ testScheduler.currentTime }`. */
    val confirmTimes = CopyOnWriteArrayList<Long>()
    var timeSource: () -> Long = { 0L }
    val uploadResults = ArrayDeque<ApiResult<SignupUpload>>()
    val confirmResults = ArrayDeque<ApiResult<Session>>()
    var uploadGate: CompletableDeferred<Unit>? = null
    var confirmGate: CompletableDeferred<Unit>? = null
    /** Incremented only when a confirm call ran to completion with a session (a cancelled call never persists). */
    var persistedSessions = 0
    private var issued = 0

    override suspend fun requestUpload(idToken: String, rawNonce: String): ApiResult<SignupUpload> {
        log.add("signup.uploads")
        uploadCalls += idToken to rawNonce
        uploadGate?.await()
        return uploadResults.removeFirstOrNull()
            ?: ApiResult.Success(SignupUpload("upload-${++issued}", "http://localhost:4010/__upload/$issued", "signup-token-$issued"))
    }

    override suspend fun confirm(signupToken: String): ApiResult<Session> {
        log.add("signup.confirm")
        confirmCalls += signupToken
        confirmTimes += timeSource()
        confirmGate?.await()
        val result = confirmResults.removeFirstOrNull() ?: ApiResult.Success(signupSession())
        if (result is ApiResult.Success) persistedSessions++
        return result
    }
}

/** Scripted [SignatureUploader] that records the presigned URL and PNG size. Unscripted calls succeed. */
class FakeSignatureUploader(val log: EventLog = EventLog()) : SignatureUploader {
    val calls = CopyOnWriteArrayList<Pair<String, Int>>()
    val results = ArrayDeque<ApiResult<Unit>>()
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun put(uploadUrl: String, png: ByteArray): ApiResult<Unit> {
        log.add("put")
        calls += uploadUrl to png.size
        gate?.await()
        return results.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }
}

/** Scripted [SignatureRepository]. Unscripted calls succeed. */
class FakeSignatureRepository(val log: EventLog = EventLog()) : SignatureRepository {
    var currentCalls = 0
    val uploadCalls = CopyOnWriteArrayList<Int>()
    val confirmCalls = CopyOnWriteArrayList<String>()
    val currentResults = ArrayDeque<ApiResult<SignatureImages>>()
    val uploadResults = ArrayDeque<ApiResult<SignatureUpload>>()
    val confirmResults = ArrayDeque<ApiResult<Unit>>()
    var currentGate: CompletableDeferred<Unit>? = null
    var uploadGate: CompletableDeferred<Unit>? = null
    var confirmGate: CompletableDeferred<Unit>? = null
    private var issued = 0

    override suspend fun current(): ApiResult<SignatureImages> {
        log.add("signature.get")
        currentCalls++
        currentGate?.await()
        return currentResults.removeFirstOrNull()
            ?: ApiResult.Success(SignatureImages("https://cdn.example.test/original.png", "https://cdn.example.test/thumbnail.png"))
    }

    override suspend fun requestUpload(): ApiResult<SignatureUpload> {
        log.add("signature.uploads")
        uploadCalls += ++issued
        uploadGate?.await()
        return uploadResults.removeFirstOrNull()
            ?: ApiResult.Success(SignatureUpload("sig-upload-$issued", "http://localhost:4010/__upload/sig-$issued"))
    }

    override suspend fun confirm(uploadId: String): ApiResult<Unit> {
        log.add("signature.confirm")
        confirmCalls += uploadId
        confirmGate?.await()
        return confirmResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }
}
