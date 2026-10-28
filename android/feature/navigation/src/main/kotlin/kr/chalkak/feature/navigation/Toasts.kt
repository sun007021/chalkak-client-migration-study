package kr.chalkak.feature.navigation

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.Clock
import java.time.Duration
import java.time.Instant

/** A toast on screen. [id] is unique per request, so the same [text] requested twice is two toasts (REQ-NAV-045). */
data class Toast(val id: Long, val text: String)

/**
 * Toast state with time taken only from [Clock] (REQ-NAV-044/045, D-20). Duration is `AppConstants.TOAST_DURATION_MS` (2.5 s):
 * visible at 2.499 s, gone at 2.5 s.
 */
class ToastHost(private val clock: Clock) {
    private var toast: Toast? = null
    private var expiresAt: Instant = Instant.MIN
    private var nextId: Long = 1

    /**
     * Ask for a toast. [screenVisible] false (background, covered screen) -> nothing is shown and nothing is queued: returns null.
     * Otherwise it replaces the current toast, restarts the 2.5 s window and returns the new [Toast]. An old window never
     * hides a newer toast.
     */
    fun request(text: String, screenVisible: Boolean): Toast? {
        if (!screenVisible) return null
        // One field pair holds the only live window, so an older window can never hide a newer toast.
        val created = Toast(nextId++, text)
        toast = created
        expiresAt = clock.now().plus(DURATION)
        return created
    }

    /** The toast to render now, or null once its 2.5 s are over. */
    fun current(): Toast? = toast?.takeIf { clock.now().isBefore(expiresAt) }

    private companion object {
        val DURATION: Duration = Duration.ofMillis(AppConstants.TOAST_DURATION_MS)
    }
}
