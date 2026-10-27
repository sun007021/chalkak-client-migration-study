package kr.chalkak.core.data.onboarding

import kotlinx.serialization.Serializable

/** `POST /auth/social-signup/signature/uploads` body: `{provider, idToken, rawNonce}` only (no authorizationCode, no consent fields; D-25). */
@Serializable
data class SignupUploadsRequest(val provider: String, val idToken: String, val rawNonce: String) {
    /** Secrets never reach logs. */
    override fun toString(): String = "SignupUploadsRequest(provider=$provider, idToken=<redacted>, rawNonce=<redacted>)"
}

@Serializable
data class SignupUploadsResponse(
    val uploadId: String,
    val uploadUrl: String,
    val expiresInSeconds: Long,
    val signupToken: String,
)

/** `POST /auth/social-signup` body: `{signupToken}` only. */
@Serializable
data class SocialSignupRequest(val signupToken: String) {
    override fun toString(): String = "SocialSignupRequest(signupToken=<redacted>)"
}

@Serializable
data class SocialSignupResponse(
    val userId: String,
    val accessToken: String,
    val expiresIn: Long,
    val refreshToken: String,
    val refreshTokenExpiresIn: Long,
)

/** `POST /users/me/signature/uploads` response. No contentType/maxBytes: the client uses its own constants (API 1.2, D7). */
@Serializable
data class SignatureUploadResponse(val uploadId: String, val uploadUrl: String, val expiresInSeconds: Long)

/** `PUT /users/me/signature` body: `{signatureOriginalUploadId}` only. */
@Serializable
data class SignatureConfirmRequest(val signatureOriginalUploadId: String)

/** `GET /users/me/signature` response; `PUT` returns only [signatureOriginalImageUrl] (possibly the OLD url, D-18). */
@Serializable
data class SignatureImagesResponse(
    val signatureOriginalImageUrl: String,
    val signatureThumbnailImageUrl: String? = null,
)

/** Domain view of the issued signup upload. [signupToken] lives 5 minutes and must stay in memory only. */
data class SignupUpload(val uploadId: String, val uploadUrl: String, val signupToken: String)

/** Domain view of the issued signature-change upload. */
data class SignatureUpload(val uploadId: String, val uploadUrl: String)

/** Current signature. [displayUrl] is the thumbnail, or the original when the thumbnail is null (REQ-SIGN-013). */
data class SignatureImages(val originalUrl: String, val thumbnailUrl: String?) {
    val displayUrl: String get() = thumbnailUrl ?: originalUrl
}
