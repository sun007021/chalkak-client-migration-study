package kr.chalkak.feature.notification

/**
 * The FCM `data` map of a push, common to every platform adapter (TC-PUSH-050). All fields are the raw strings the server sent;
 * a key that is absent or whose value is not a string is null (TC-PUSH-049). `eventId` is carried but never used for routing (REQ-PUSH-021).
 * Notification title/body are not part of it: they are display text and never decide a destination (TC-PUSH-051).
 */
data class PushPayload(
    val type: String?,
    val notificationId: String?,
    val sourceType: String?,
    val sourceId: String?,
    val eventId: String?,
)

object PushPayloadParser {
    /** FCM `data` map as plugins/`RemoteMessage.data` deliver it (flat). Values that are not `String` count as missing; never throws. */
    fun fromData(data: Map<String, Any?>): PushPayload = PushPayload(
        type = data["type"] as? String,
        notificationId = data["notificationId"] as? String,
        sourceType = data["sourceType"] as? String,
        sourceId = data["sourceId"] as? String,
        eventId = data["eventId"] as? String,
    )

    /**
     * Intent extras of a notification tap from the system tray. Extras also hold `google.*` bookkeeping keys; the tap is an FCM
     * tap only when `google.message_id` is present, otherwise null (REQ-PUSH-032). Extra `google.*`/`from`/`collapse_key` keys are ignored.
     */
    fun fromAndroidExtras(extras: Map<String, Any?>): PushPayload? =
        if (extras.containsKey(FCM_MESSAGE_ID_KEY)) fromData(extras) else null

    private const val FCM_MESSAGE_ID_KEY = "google.message_id"
}
