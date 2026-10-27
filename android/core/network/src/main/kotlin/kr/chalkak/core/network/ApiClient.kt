package kr.chalkak.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.serialization.KSerializer
import kr.chalkak.core.common.Clock
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Entry point for all API calls. Order of work per request:
 *  1. config check, build URL `<origin>/api/v1<path>`;
 *  2. read the session (a throwing store = no session, entry cleared); attach Bearer only if valid per [RequestRules]
 *     and the access token is not expired per [clock];
 *  3. send with [RetryPolicy] (virtual-time `delay`), mapping IOExceptions to ApiError.Network;
 *  4. 401 UNAUTHORIZED with a token sent -> [TokenRefresher] -> resend ONCE; 401 REAUTHENTICATION_REQUIRED -> no refresh.
 * Coroutine cancellation is rethrown, never turned into a Network error (D-20).
 */
class ApiClient(
    private val baseUrl: ApiBaseUrl,
    private val okHttp: OkHttpClient,
    private val sessionStore: SessionStore,
    private val refresher: TokenRefresher,
    private val clock: Clock,
    private val events: AuthEventSink,
    private val retryPolicy: RetryPolicy = RetryPolicy(),
    private val decoder: ApiResponseDecoder = ApiResponseDecoder(),
    private val logSink: NetworkLogSink = NetworkLogSink { },
) {
    /** 2xx -> Success(raw); otherwise Failure. */
    suspend fun execute(request: ApiRequest): ApiResult<RawResponse> {
        val url = baseUrl.apiUrl(lowerCaseUuidSegments(request.path), request.query)
        val session = if (RequestRules.neverSendsAuthorization(request.method, request.path) ||
            !RequestRules.canAttachAuthorization(url)
        ) {
            null
        } else {
            readUserSession()
        }
        return attempt(request, url, session, mayResend = true)
    }

    suspend fun <T> send(request: ApiRequest, serializer: KSerializer<T>): ApiResult<T> =
        when (val result = execute(request)) {
            is ApiResult.Success -> decoder.decode(result.value, serializer)
            is ApiResult.Failure -> result
        }

    /** 204-style endpoints. */
    suspend fun sendNoContent(request: ApiRequest): ApiResult<Unit> =
        when (val result = execute(request)) {
            is ApiResult.Success -> decoder.decodeNoContent(result.value)
            is ApiResult.Failure -> result
        }

    /**
     * Presigned PUT: separate [uploadClient] (60s), no Authorization and no app-wide headers,
     * Content-Type = [contentType]; rejects non-loopback http with Config(INSECURE_HTTP).
     */
    suspend fun putPresigned(url: String, contentType: String, body: ByteArray, uploadClient: OkHttpClient): ApiResult<Unit> {
        val parsed = url.toHttpUrlOrNull() ?: return ApiResult.Failure(ApiError.Config(ConfigError.MALFORMED))
        if (!ApiBaseUrl.isAllowedUrl(parsed)) return ApiResult.Failure(ApiError.Config(ConfigError.INSECURE_HTTP))
        val request = Request.Builder()
            .url(parsed)
            .put(body.toRequestBody(contentType.toMediaType()))
            .build()
        val result = transmit(uploadClient, request, HttpMethod.PUT, parsed.encodedPath)
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(Unit)
            is ApiResult.Failure -> result
        }
    }

    // ---- authentication handling -----------------------------------------------------------

    /**
     * [session] is the user session this request belongs to (null for guests and for requests that never carry a token).
     * [mayResend] is false for the single resend, so a second 401 is returned as is (TC-NET-017).
     */
    private suspend fun attempt(request: ApiRequest, url: HttpUrl, session: Session?, mayResend: Boolean): ApiResult<RawResponse> {
        val result = transmitApi(request, url, session)
        val error = (result as? ApiResult.Failure)?.error as? ApiError.Http ?: return result
        if (session == null) return result
        return when {
            error.status == 401 && error.errorCode == ErrorCode.REAUTHENTICATION_REQUIRED -> {
                val outcome = refresher.onReauthenticationRequired(session)
                if (outcome is RefreshOutcome.Refreshed && mayResend) attempt(request, url, outcome.session, mayResend = false) else result
            }
            mayResend && error.status == 401 && error.errorCode == ErrorCode.UNAUTHORIZED -> when (val outcome = refresher.refresh(session)) {
                is RefreshOutcome.Refreshed -> attempt(request, url, outcome.session, mayResend = false)
                RefreshOutcome.ReauthenticationRequired ->
                    ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED))
                is RefreshOutcome.Failed -> ApiResult.Failure(outcome.error)
                RefreshOutcome.Skipped -> result
            }
            else -> result
        }
    }

    private suspend fun readUserSession(): Session? {
        val stored = try {
            sessionStore.read()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            clearQuietly()
            StoredSession.None
        }
        return (stored as? StoredSession.User)?.session
    }

    private suspend fun clearQuietly() {
        try {
            sessionStore.clear()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Storage is unusable; the request proceeds as a guest.
        }
    }

    // ---- sending ---------------------------------------------------------------------------

    private suspend fun transmitApi(request: ApiRequest, url: HttpUrl, session: Session?): ApiResult<RawResponse> {
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (session != null && clock.now().isBefore(session.accessExpiresAt)) {
            builder.header("Authorization", "Bearer ${session.accessToken}")
        }
        val body: RequestBody? = when (request.method) {
            HttpMethod.GET -> null
            else -> request.jsonBody?.toRequestBody(JSON_MEDIA_TYPE) ?: EMPTY_BODY
        }
        builder.method(request.method.name, body)
        return transmit(okHttp, builder.build(), request.method, request.path)
    }

    /** One logical send with the [RetryPolicy]; non-2xx becomes Failure(Http). */
    private suspend fun transmit(client: OkHttpClient, request: Request, method: HttpMethod, policyPath: String): ApiResult<RawResponse> {
        var retriesDone = 0
        while (true) {
            logSink.log(LogRedactor.redact("--> ${method.name} ${request.url.encodedPath}"))
            val outcome = try {
                client.newCall(request).awaitRaw()
            } catch (e: IOException) {
                e.toNetworkError()
            }
            val attemptResult = when (outcome) {
                is RawResponse -> AttemptResult(outcome.status, outcome.header("Retry-After"))
                else -> AttemptResult(null)
            }
            logSink.log(LogRedactor.redact("<-- ${attemptResult.status ?: "network error"} ${method.name} ${request.url.encodedPath}"))
            if (outcome is RawResponse && outcome.status < 400) {
                return if (outcome.isSuccessful) ApiResult.Success(outcome) else ApiResult.Failure(decoder.parseError(outcome))
            }
            when (val decision = retryPolicy.decide(method, policyPath, attemptResult, retriesDone, clock.now())) {
                is RetryDecision.RetryAfter -> {
                    delay(decision.delayMs)
                    retriesDone++
                }
                RetryDecision.GiveUp -> return when (outcome) {
                    is RawResponse -> ApiResult.Failure(decoder.parseError(outcome))
                    else -> ApiResult.Failure(outcome as ApiError.Network)
                }
            }
        }
    }

    private fun lowerCaseUuidSegments(path: String): String =
        path.split('/').joinToString("/") { if (QueryValues.isUuid(it)) QueryValues.uuid(it) else it }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        val EMPTY_BODY: RequestBody = ByteArray(0).toRequestBody(null)
    }
}
