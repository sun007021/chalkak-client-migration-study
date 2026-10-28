package kr.chalkak.core.data.upload

import kotlinx.serialization.Serializable
import kr.chalkak.core.data.home.ModerationStatus
import java.time.LocalDate

/** `POST /posts/uploads` response (UPL-024). [maxBytes] is a 64-bit value (the server may send > Int.MAX). */
@Serializable
data class UploadPolicyResponse(
    val uploadId: String,
    val uploadUrl: String,
    val expiresInSeconds: Long,
    val contentType: String,
    val maxBytes: Long,
)

/** `POST /posts` body: `{topicId, photoUploadId, title}`. A null [title] is omitted from the JSON (explicitNulls=false). */
@Serializable
data class CreatePostRequest(val topicId: String, val photoUploadId: String, val title: String? = null)

/** `POST /posts` 201 body. [moderationStatus] stays a string on the wire; the repository validates it. */
@Serializable
data class CreatePostResponse(val postId: String, val moderationStatus: String)

/** Domain view of an issued upload policy. The repository does NOT judge [contentType]; the preparer does (REQ-UPL-026). */
data class UploadPolicy(
    val uploadId: String,
    val uploadUrl: String,
    val expiresInSeconds: Long,
    val contentType: String,
    val maxBytes: Long,
)

/** A created post. [status] is VALIDATING or PENDING only (REQ-UPL-046). */
data class CreatedPost(val postId: String, val status: ModerationStatus)

/** Process-wide announcement that a post was created, so home / record / exhibition reload (REQ-UPL-063). */
data class PostCreated(val topicDate: LocalDate, val postId: String, val status: ModerationStatus)
