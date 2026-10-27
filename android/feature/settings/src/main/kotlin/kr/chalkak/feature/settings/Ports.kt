package kr.chalkak.feature.settings

/** Device-level notification permission (iOS authorization, Android notifications allowed). */
enum class NotificationPermission { Granted, Denied, NotDetermined }

/** Platform adapter (in :app): permission lookup and the jump to the system notification settings (REQ-SET-015..018). */
interface DeviceNotificationSettings {
    fun permission(): NotificationPermission

    /**
     * Shows the system permission prompt (REQ-SET-018) and returns the answer: [NotificationPermission.Granted] or
     * [NotificationPermission.Denied]. Only called while [permission] is [NotificationPermission.NotDetermined].
     */
    suspend fun requestPermission(): NotificationPermission

    /** Opens the app's system notification settings screen (`ACTION_APP_NOTIFICATION_SETTINGS`). */
    fun openSystemSettings()
}

/** `shared/copy/ko.json` keys used by this module. */
object SettingsCopyKeys {
    const val PUSH_LOAD_ERROR = "settings.push.load-error"
    const val PUSH_SAVE_ERROR = "settings.push.save-error"
    const val GUEST_FEEDBACK = "nav.guest.feedback"
    const val FEEDBACK_SUCCESS = "fdbk.success"
    const val FEEDBACK_ERROR_INVALID = "fdbk.error.invalid"
    const val FEEDBACK_ERROR_GENERIC = "fdbk.error.generic"
    const val ERROR_NETWORK = "common.error.network"
}
