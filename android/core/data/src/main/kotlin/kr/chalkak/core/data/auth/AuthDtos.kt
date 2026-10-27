package kr.chalkak.core.data.auth

import kotlinx.serialization.Serializable
import kr.chalkak.core.network.Session

/** `POST /auth/social-login` body. No `authorizationCode` field exists on purpose (Kakao must never send it). */
@Serializable
data class SocialLoginRequest(val provider: String, val idToken: String, val rawNonce: String) {
    /** Secrets never reach logs (REQ-AUTH-004/031). */
    override fun toString(): String = "SocialLoginRequest(provider=$provider, idToken=<redacted>, rawNonce=<redacted>)"
}

@Serializable
data class SocialLoginResponse(
    val status: String,
    val userId: String? = null,
    val accessToken: String? = null,
    val expiresIn: Long? = null,
    val refreshToken: String? = null,
    val refreshTokenExpiresIn: Long? = null,
)

@Serializable
data class LogoutRequest(val refreshToken: String)

sealed interface SocialLoginOutcome {
    /** Session is already persisted (guest flag cleared, previous account data reset). */
    data class LoggedIn(val session: Session) : SocialLoginOutcome
    /** Nothing persisted; the caller keeps idToken/rawNonce in memory for the signup flow. */
    data object SignUpRequired : SocialLoginOutcome
}
