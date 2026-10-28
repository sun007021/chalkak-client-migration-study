package kr.chalkak.feature.notification

import kr.chalkak.core.data.notification.NotificationItem
import kr.chalkak.core.data.notification.NotificationType
import kr.chalkak.core.network.QueryValues

sealed interface NotificationDestination {
    /** [scrollToTopAndRefresh] is true for TOPIC (REQ-PUSH-022), false for REMINDER. */
    data class Home(val scrollToTopAndRefresh: Boolean) : NotificationDestination

    /** My post detail. [postId] is the lower-case form of `sourceId`. [openAiFeedbackSheet]: open the AI sheet once from the latest GET. */
    data class PostDetail(val postId: String, val openAiFeedbackSheet: Boolean) : NotificationDestination

    /** Notification detail by the NOTIFICATION id (never the notice's `sourceId`). Lower-case. */
    data class NotificationDetail(val notificationId: String) : NotificationDestination

    /** Push fallback for unknown type / missing field / bad UUID (REQ-PUSH-026). Never produced for inbox rows. */
    data object Inbox : NotificationDestination
}

/**
 * [destination] null = do nothing (inbox row that cannot be routed: no navigation, no read request).
 * [readNotificationId] non-null = send `PATCH /notifications/{id}/read` first (lower-case id).
 */
data class TapPlan(val destination: NotificationDestination?, val readNotificationId: String?)

/** One table (D-11) for both inbox row taps and push taps. Pure, never throws. */
object NotificationTapPlanner {
    /**
     * TOPIC -> Home(true), no read. REMINDER -> Home(false), no read.
     * POST_APPROVED -> PostDetail(sourceId, false) + read(notificationId).
     * AI_REVIEW_COMPLETED/FAILED -> PostDetail(sourceId, true) + read, only if sourceType == "POST".
     * POST_REJECTED/NOTICE -> NotificationDetail(notificationId) + read.
     * Unknown type, a missing needed field, a needed id that is not a UUID (any case) -> Inbox, no read.
     * Ids are returned lower-case (TC-PUSH-048).
     */
    fun forPush(payload: PushPayload): TapPlan =
        plan(PushType.from(payload.type), payload.notificationId, payload.sourceType, payload.sourceId)
            ?: TapPlan(NotificationDestination.Inbox, null)

    /**
     * Same table, ids taken from the row (`id` is the notification id), but anything unroutable -> destination null (stay in the
     * inbox, no read: TC-NOTI-024/026/029). TOPIC/REMINDER rows -> Home, no read (TC-NOTI-025).
     */
    fun forInboxRow(item: NotificationItem): TapPlan =
        plan(PushType.from(item.type), item.id, item.sourceType, item.sourceId) ?: TapPlan(null, null)

    /** Null when the type is unknown or a field the type needs is missing or not a UUID. */
    private fun plan(type: PushType, notificationId: String?, sourceType: String?, sourceId: String?): TapPlan? {
        val notification = notificationId?.takeIf(QueryValues::isUuid)?.let(QueryValues::uuid)
        val post = sourceId?.takeIf(QueryValues::isUuid)?.let(QueryValues::uuid)
        return when (type) {
            PushType.Topic -> TapPlan(NotificationDestination.Home(scrollToTopAndRefresh = true), null)
            PushType.Reminder -> TapPlan(NotificationDestination.Home(scrollToTopAndRefresh = false), null)
            PushType.PostApproved -> postPlan(post, notification, openAiFeedbackSheet = false)
            PushType.AiReview -> if (sourceType == POST_SOURCE) postPlan(post, notification, openAiFeedbackSheet = true) else null
            PushType.NotificationDetail ->
                notification?.let { TapPlan(NotificationDestination.NotificationDetail(it), it) }
            PushType.Unknown -> null
        }
    }

    private fun postPlan(post: String?, notification: String?, openAiFeedbackSheet: Boolean): TapPlan? =
        if (post == null || notification == null) null else TapPlan(NotificationDestination.PostDetail(post, openAiFeedbackSheet), notification)

    private const val POST_SOURCE = "POST"
}

private enum class PushType {
    Topic, Reminder, PostApproved, AiReview, NotificationDetail, Unknown;

    companion object {
        fun from(raw: String?): PushType = when (raw) {
            "TOPIC" -> Topic
            "REMINDER" -> Reminder
            "POST_APPROVED" -> PostApproved
            "AI_REVIEW_COMPLETED", "AI_REVIEW_FAILED" -> AiReview
            "POST_REJECTED", "NOTICE" -> NotificationDetail
            else -> Unknown
        }

        fun from(type: NotificationType): PushType = from(type.name)
    }
}

/** What is on screen when a navigation command is issued. */
sealed interface TopScreen {
    data object Home : TopScreen
    data class PostDetail(val postId: String) : TopScreen
    data class NotificationDetail(val notificationId: String) : TopScreen
    data object Inbox : TopScreen
    data object Other : TopScreen
}

enum class NavMode {
    /** Add the destination on top. */
    Push,
    /** The same post/notification detail is already on top: replace it instead of stacking (REQ-PUSH-029). */
    ReplaceTop,
    /** Already there (Home on Home): no new screen, only the side effects (scroll to top + refresh). */
    AlreadyThere,
}

data class NavCommand(val destination: NotificationDestination, val mode: NavMode)

object NavModes {
    fun resolve(destination: NotificationDestination, top: TopScreen): NavMode = when {
        destination is NotificationDestination.Home && top == TopScreen.Home -> NavMode.AlreadyThere
        destination is NotificationDestination.PostDetail && top == TopScreen.PostDetail(destination.postId) -> NavMode.ReplaceTop
        destination is NotificationDestination.NotificationDetail && top == TopScreen.NotificationDetail(destination.notificationId) ->
            NavMode.ReplaceTop
        else -> NavMode.Push
    }
}
