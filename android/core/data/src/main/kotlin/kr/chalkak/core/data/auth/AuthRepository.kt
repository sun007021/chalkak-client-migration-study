package kr.chalkak.core.data.auth

import kotlinx.coroutines.CancellationException
import kr.chalkak.core.common.Clock
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession

interface AuthRepository {
    /**
     * `POST /auth/social-login {provider:"KAKAO", idToken, rawNonce}`, sent once (no retry, no Authorization).
     * LOGIN_SUCCESS: persists the session (expiry = clock.now + seconds), clears the guest flag, resets previous account data.
     * SIGN_UP_REQUIRED: nothing persisted. Unknown status / missing token -> Failure(InvalidResponse), nothing persisted.
     */
    suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome>

    /**
     * Local session + caches are cleared FIRST, then `POST /auth/logout {refreshToken}` (no Authorization, no retry).
     * Any failure of the request is ignored. No refresh token (guest) -> no request.
     */
    suspend fun logout()

    /** `DELETE /users/me`. Only on 204 are the local session and caches cleared; every other result keeps them. */
    suspend fun withdraw(): ApiResult<Unit>
}

class DefaultAuthRepository(
    private val api: ApiClient,
    private val sessionStore: SessionStore,
    private val resetter: UserDataResetter,
    private val clock: Clock,
) : AuthRepository {
    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> {
        val body = ApiJson.instance.encodeToString(SocialLoginRequest.serializer(), SocialLoginRequest("KAKAO", idToken, rawNonce))
        val response = when (val result = api.send(ApiRequest(HttpMethod.POST, "/auth/social-login", jsonBody = body), SocialLoginResponse.serializer())) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> return result
        }
        return when (response.status) {
            "SIGN_UP_REQUIRED" -> ApiResult.Success(SocialLoginOutcome.SignUpRequired)
            "LOGIN_SUCCESS" -> completeLogin(response)
            else -> invalid("unknown status")
        }
    }

    private suspend fun completeLogin(response: SocialLoginResponse): ApiResult<SocialLoginOutcome> {
        val now = clock.now()
        val session = Session(
            userId = response.userId ?: return invalid("missing userId"),
            accessToken = response.accessToken ?: return invalid("missing accessToken"),
            accessExpiresAt = now.plusSeconds(response.expiresIn ?: return invalid("missing expiresIn")),
            refreshToken = response.refreshToken ?: return invalid("missing refreshToken"),
            refreshExpiresAt = now.plusSeconds(response.refreshTokenExpiresIn ?: return invalid("missing refreshTokenExpiresIn")),
        )
        resetter.resetAll()
        sessionStore.write(session)
        return ApiResult.Success(SocialLoginOutcome.LoggedIn(session))
    }

    private fun invalid(reason: String) = ApiResult.Failure(ApiError.InvalidResponse(reason))

    override suspend fun logout() {
        val refreshToken = (readOrNone() as? StoredSession.User)?.session?.refreshToken
        ignoringFailure { sessionStore.clear() }
        ignoringFailure { resetter.resetAll() }
        if (refreshToken == null) return
        val body = ApiJson.instance.encodeToString(LogoutRequest.serializer(), LogoutRequest(refreshToken))
        api.sendNoContent(ApiRequest(HttpMethod.POST, "/auth/logout", jsonBody = body))
    }

    override suspend fun withdraw(): ApiResult<Unit> {
        val result = api.sendNoContent(ApiRequest(HttpMethod.DELETE, "/users/me"))
        if (result is ApiResult.Success) {
            // The server already deleted the account: a local cleanup failure must not look like a failed withdrawal.
            ignoringFailure { sessionStore.clear() }
            ignoringFailure { resetter.resetAll() }
        }
        return result
    }

    private suspend fun readOrNone(): StoredSession =
        try {
            sessionStore.read()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            StoredSession.None
        }

    private suspend fun ignoringFailure(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Local cleanup failure must not block logout/withdraw navigation.
        }
    }
}
