package kr.chalkak.core.data.notification

import java.time.Instant

/** Server `type`. Any value not listed maps to [UNKNOWN] (the raw text stays in [NotificationItem.rawType]). */
enum class NotificationType {
    POST_APPROVED,
    POST_REJECTED,
    AI_REVIEW_COMPLETED,
    AI_REVIEW_FAILED,
    NOTICE,
    TOPIC,
    REMINDER,
    UNKNOWN,
}

/**
 * One inbox row (`GET /notifications`). Title/body are server text, shown as is (REQ-NOTI-004).
 * [sourceType]/[sourceId] are raw strings: the row router decides whether they are usable (UUID check).
 */
data class NotificationItem(
    val id: String,
    val type: NotificationType,
    val rawType: String,
    val sourceType: String?,
    val sourceId: String?,
    val title: String,
    val body: String,
    val thumbnailImageUrl: String?,
    val readAt: Instant?,
    val createdAt: Instant,
)

data class NotificationPage(
    val currentPage: Int,
    val pageSize: Int,
    val hasNext: Boolean,
    val items: List<NotificationItem>,
)

/** `GET /notifications/{id}`. Reading it never marks the notification read (REQ-NOTI-023). */
data class NotificationDetail(
    val id: String,
    val type: NotificationType,
    val title: String,
    val body: String,
    val originalImageUrl: String?,
    val rejectionReason: String?,
    val readAt: Instant?,
    val createdAt: Instant,
)
