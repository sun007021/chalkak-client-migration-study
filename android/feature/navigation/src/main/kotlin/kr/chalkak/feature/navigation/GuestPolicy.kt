package kr.chalkak.feature.navigation

/**
 * Who is using the main screens. A suspended (BANNED) member is a [Member]: the client has no ban knowledge, the restriction
 * only appears as a 403 on writes (TC-NAV-024).
 */
enum class AccessMode { Guest, Member }

/** Actions a guest cannot do (D-05). */
enum class GuestAction { RecordTab, UploadButton, FeedDetail, Like, NotificationEntry, FeedbackEntry }

object GuestPolicy {
    /**
     * Copy key of the toast that blocks [action] for a [AccessMode.Guest], or null when the action is allowed ([AccessMode.Member]
     * is always allowed). Keys: `nav.guest.record`, `.upload`, `.feed`, `.like`, `.notification`, `.feedback` (REQ-NAV-013..018).
     * A blocked action must send no network request at all (REQ-NAV-019): callers check this before doing anything else.
     */
    fun blockingToast(mode: AccessMode, action: GuestAction): String? = when (mode) {
        AccessMode.Member -> null
        AccessMode.Guest -> when (action) {
            GuestAction.RecordTab -> "nav.guest.record"
            GuestAction.UploadButton -> "nav.guest.upload"
            GuestAction.FeedDetail -> "nav.guest.feed"
            GuestAction.Like -> "nav.guest.like"
            GuestAction.NotificationEntry -> "nav.guest.notification"
            GuestAction.FeedbackEntry -> "nav.guest.feedback"
        }
    }
}
