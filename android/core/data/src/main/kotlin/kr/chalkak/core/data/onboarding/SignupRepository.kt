package kr.chalkak.core.data.onboarding

import kr.chalkak.core.common.Clock
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore

/** Signup steps 1 and 3 (step 2 is [SignatureUploader]). Polling of SIGNATURE_PROCESSING_PENDING is NOT done here (holder). */
interface SignupRepository {
    /**
     * `POST /auth/social-signup/signature/uploads {provider:"KAKAO", idToken, rawNonce}`, sent once (never auto-retried,
     * D-21), no Authorization. Server errors come back as `ApiResult.Failure(Http)` untouched.
     */
    suspend fun requestUpload(idToken: String, rawNonce: String): ApiResult<SignupUpload>

    /**
     * `POST /auth/social-signup {signupToken}`, sent once, no Authorization. On 200: resets previous account data,
     * persists the session (expiry = clock.now + seconds from the response) and returns it. Nothing is persisted on failure.
     * Storage errors propagate like in [kr.chalkak.core.data.auth.AuthRepository]; the holder turns them into a retryable error.
     * A `400 SIGNATURE_PROCESSING_PENDING` is returned as `Failure(Http(400, SIGNATURE_PROCESSING_PENDING))`.
     */
    suspend fun confirm(signupToken: String): ApiResult<Session>
}

class DefaultSignupRepository(
    private val api: ApiClient,
    private val sessionStore: SessionStore,
    private val resetter: UserDataResetter,
    private val clock: Clock,
) : SignupRepository {
    override suspend fun requestUpload(idToken: String, rawNonce: String): ApiResult<SignupUpload> {
        val body = ApiJson.instance.encodeToString(
            SignupUploadsRequest.serializer(),
            SignupUploadsRequest(provider = "KAKAO", idToken = idToken, rawNonce = rawNonce),
        )
        val request = ApiRequest(HttpMethod.POST, "/auth/social-signup/signature/uploads", jsonBody = body)
        return when (val result = api.send(request, SignupUploadsResponse.serializer())) {
            is ApiResult.Success -> ApiResult.Success(
                SignupUpload(result.value.uploadId, result.value.uploadUrl, result.value.signupToken),
            )
            is ApiResult.Failure -> result
        }
    }

    override suspend fun confirm(signupToken: String): ApiResult<Session> {
        val body = ApiJson.instance.encodeToString(SocialSignupRequest.serializer(), SocialSignupRequest(signupToken))
        val request = ApiRequest(HttpMethod.POST, "/auth/social-signup", jsonBody = body)
        val response = when (val result = api.send(request, SocialSignupResponse.serializer())) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> return result
        }
        return persist(response)
    }

    // Reached only after the response is fully decoded, so a cancelled call never leaves a half-saved session (TC-ONB-044).
    private suspend fun persist(response: SocialSignupResponse): ApiResult<Session> {
        val now = clock.now()
        val session = Session(
            userId = response.userId,
            accessToken = response.accessToken,
            accessExpiresAt = now.plusSeconds(response.expiresIn),
            refreshToken = response.refreshToken,
            refreshExpiresAt = now.plusSeconds(response.refreshTokenExpiresIn),
        )
        resetter.resetAll()
        sessionStore.write(session)
        return ApiResult.Success(session)
    }
}
