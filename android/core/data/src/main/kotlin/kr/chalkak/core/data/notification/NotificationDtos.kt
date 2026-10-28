package kr.chalkak.core.data.notification

import kotlinx.serialization.Serializable
import kr.chalkak.core.common.InstantParser
import kr.chalkak.core.data.home.Malformed
import java.time.Instant

@Serializable
internal data class NotificationItemDto(
    val id: String,
    val type: String,
    val sourceType: String? = null,
    val sourceId: String? = null,
    val title: String,
    val body: String,
    val thumbnailImageUrl: String? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
internal data class NotificationPageDto(
    val currentPage: Int,
    val pageSize: Int,
    val hasNext: Boolean,
    val notifications: List<NotificationItemDto>,
)

@Serializable
internal data class NotificationDetailDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    val originalImageUrl: String? = null,
    val rejectionReason: String? = null,
    val readAt: String? = null,
    val createdAt: String,
)

private fun notificationType(raw: String): NotificationType =
    NotificationType.entries.firstOrNull { it.name == raw && it != NotificationType.UNKNOWN } ?: NotificationType.UNKNOWN

private fun instant(text: String, field: String): Instant = InstantParser.parse(text) ?: throw Malformed("bad $field")

internal fun NotificationItemDto.toDomain() = NotificationItem(
    id = id,
    type = notificationType(type),
    rawType = type,
    sourceType = sourceType,
    sourceId = sourceId,
    title = title,
    body = body,
    thumbnailImageUrl = thumbnailImageUrl,
    readAt = readAt?.let { instant(it, "readAt") },
    createdAt = instant(createdAt, "createdAt"),
)

internal fun NotificationPageDto.toDomain() = NotificationPage(currentPage, pageSize, hasNext, notifications.map { it.toDomain() })

internal fun NotificationDetailDto.toDomain() = NotificationDetail(
    id = id,
    type = notificationType(type),
    title = title,
    body = body,
    originalImageUrl = originalImageUrl,
    rejectionReason = rejectionReason,
    readAt = readAt?.let { instant(it, "readAt") },
    createdAt = instant(createdAt, "createdAt"),
)
