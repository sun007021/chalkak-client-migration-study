package kr.chalkak.core.common.analytics

/**
 * Wraps a tracker so that a failing SDK never reaches the UI flow (REQ-ANL-008, TC-ANL-021): every [Exception] thrown by the
 * delegate is swallowed on both methods. Errors (OutOfMemoryError ...) are not swallowed.
 */
class SafeAnalyticsTracker(private val delegate: AnalyticsTracker) : AnalyticsTracker {
    override fun screenView(screen: String) = swallowing { delegate.screenView(screen) }

    override fun bottomNavigationSelected(destination: String) = swallowing { delegate.bottomNavigationSelected(destination) }

    @Suppress("TooGenericExceptionCaught")
    private inline fun swallowing(call: () -> Unit) {
        try {
            call()
        } catch (_: Exception) {
            // Analytics must never affect the screen (REQ-ANL-008); Errors still propagate.
        }
    }
}

/**
 * Default implementation (REQ-ANL-001): writes one line per event to [sink], e.g. `analytics screen_view screen_name=home`
 * (event name first, then `key=value` pairs in the order of the event params). Built from [AnalyticsEvents], so an invalid
 * name throws [IllegalArgumentException] like the builders do. Never touches a network or SDK.
 */
class LoggingAnalyticsTracker(private val sink: (String) -> Unit = ::println) : AnalyticsTracker {
    override fun screenView(screen: String) = log(AnalyticsEvents.screenView(screen))

    override fun bottomNavigationSelected(destination: String) = log(AnalyticsEvents.bottomNavigationSelected(destination))

    private fun log(event: AnalyticsEvent) {
        val params = event.params.entries.joinToString(" ") { (key, value) -> "$key=$value" }
        sink("analytics ${event.name} $params")
    }
}

object AnalyticsTrackers {
    /**
     * Tracker selection at app start (REQ-ANL-001, Q-16). [firebase] is null when the build has no Firebase config file.
     * Returns the Firebase tracker when [firebase] is non-null and builds without throwing, otherwise [fallback] (the logging tracker).
     * The result is always wrapped in [SafeAnalyticsTracker]. Never throws.
     */
    @Suppress("TooGenericExceptionCaught")
    fun create(firebase: (() -> AnalyticsTracker)?, fallback: AnalyticsTracker): AnalyticsTracker {
        val selected = try {
            firebase?.invoke() ?: fallback
        } catch (_: Exception) {
            fallback // Firebase init failed: keep the app running on the logging tracker (Q-16).
        }
        return SafeAnalyticsTracker(selected)
    }
}

/**
 * Sends `screen_view` once per visible period of a screen (D-22, REQ-ANL-004).
 *  - [shown] with the same screen already shown (recomposition, rotation, a second call) sends nothing (TC-ANL-018).
 *  - [shown] after [hidden], or with a different screen name, sends (coming back after a back press: TC-ANL-017).
 *  - [hidden] only forgets the current screen; it never sends (closing a sheet does not re-send the screen below: TC-ANL-011).
 */
class ScreenViewReporter(private val tracker: AnalyticsTracker) {
    private var current: String? = null

    fun shown(screenName: String) {
        if (current == screenName) return
        current = screenName // marked before sending: a failing tracker must not cause a resend loop
        tracker.screenView(screenName)
    }

    fun hidden() {
        current = null
    }
}
