package kr.chalkak.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kr.chalkak.core.common.Clock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

data class RefreshedTokens(
    val accessToken: String,
    val expiresInSeconds: Long,
    val refreshToken: String,
    val refreshTokenExpiresInSeconds: Long,
)

sealed interface RefreshResult {
    data class Success(val tokens: RefreshedTokens) : RefreshResult
    /** 401 REAUTHENTICATION_REQUIRED (K2-K4). */
    data object ReauthenticationRequired : RefreshResult
    /** Network error, timeout, 5xx, 400, missing token field, anything else. Never logs the user out. */
    data class Failed(val error: ApiError) : RefreshResult
}

/** One `POST /auth/refresh {refreshToken}` call. No retry, no Authorization header. */
fun interface RefreshApi {
    suspend fun refresh(refreshToken: String): RefreshResult
}

/** Real implementation over OkHttp; [okHttp] must be a client WITHOUT auth handling. */
class HttpRefreshApi(
    private val baseUrl: ApiBaseUrl,
    private val okHttp: OkHttpClient,
    private val decoder: ApiResponseDecoder = ApiResponseDecoder(),
) : RefreshApi {
    override suspend fun refresh(refreshToken: String): RefreshResult {
        val body = ApiJson.instance.encodeToString(RefreshRequest(refreshToken)).toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url(baseUrl.apiUrl("/auth/refresh"))
            .header("Accept", "application/json")
            .post(body)
            .build()
        val raw = try {
            okHttp.newCall(request).awaitRaw()
        } catch (e: IOException) {
            return RefreshResult.Failed(e.toNetworkError())
        }
        return when (val decoded = decoder.decode(raw, RefreshResponse.serializer())) {
            is ApiResult.Success -> RefreshResult.Success(decoded.value.toTokens())
            is ApiResult.Failure -> {
                val error = decoded.error
                if (error is ApiError.Http && error.errorCode == ErrorCode.REAUTHENTICATION_REQUIRED) {
                    RefreshResult.ReauthenticationRequired
                } else {
                    RefreshResult.Failed(error)
                }
            }
        }
    }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}

@Serializable
private data class RefreshRequest(val refreshToken: String)

@Serializable
private data class RefreshResponse(
    val accessToken: String,
    val expiresIn: Long,
    val refreshToken: String,
    val refreshTokenExpiresIn: Long,
) {
    fun toTokens() = RefreshedTokens(accessToken, expiresIn, refreshToken, refreshTokenExpiresIn)
}

/** Converts a refresh response into a [Session] using [Clock.now] + `expiresIn` seconds (TC-NET-022). */
fun RefreshedTokens.toSession(userId: String, clock: Clock): Session {
    val now = clock.now()
    return Session(
        userId = userId,
        accessToken = accessToken,
        accessExpiresAt = now.plusSeconds(expiresInSeconds),
        refreshToken = refreshToken,
        refreshExpiresAt = now.plusSeconds(refreshTokenExpiresInSeconds),
    )
}
