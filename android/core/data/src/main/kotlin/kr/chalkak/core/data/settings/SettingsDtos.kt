package kr.chalkak.core.data.settings

import kotlinx.serialization.Serializable
import java.time.Instant

/** The three push receive switches. [field] is the JSON key used by `GET`/`PATCH /notification-settings` (REQ-SET-009). */
enum class PushSetting(val field: String) {
    Topic("topicPushEnabled"),
    Moderation("moderationPushEnabled"),
    AiReview("aiReviewPushEnabled"),
}

/** `GET /notification-settings` body. All three fields are required and non-null (TC-SET-015). */
@Serializable
data class NotificationSettingsResponse(
    val topicPushEnabled: Boolean,
    val moderationPushEnabled: Boolean,
    val aiReviewPushEnabled: Boolean,
)

/** Domain view of the member's push receive settings. */
data class NotificationSettings(val topic: Boolean, val moderation: Boolean, val aiReview: Boolean) {
    operator fun get(setting: PushSetting): Boolean = when (setting) {
        PushSetting.Topic -> topic
        PushSetting.Moderation -> moderation
        PushSetting.AiReview -> aiReview
    }
}

/** `POST /feedbacks` body: `{content}` only (no app version or device info, REQ-FDBK-007, Q-13). */
@Serializable
data class FeedbackRequest(val content: String)

/** `POST /feedbacks` 201 body. */
@Serializable
data class FeedbackCreatedResponse(val feedbackId: String, val createdAt: String)

/** Domain view of the 201 response; callers do not use it (REQ-FDBK-008) but it proves the body was understood. */
data class FeedbackReceipt(val feedbackId: String, val createdAt: Instant)
