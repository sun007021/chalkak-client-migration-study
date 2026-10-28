package kr.chalkak.feature.display

/** [id] is unique per occurrence so the same text twice in a row still re-triggers the UI (D-20, TC-LIKE-030). */
data class ToastMessage(val id: Long, val copyKey: String)

/** Copy keys of `shared/copy/ko.json` used by the exhibition and detail holders. */
internal object CopyKeys {
    const val NETWORK = "common.error.network"
    const val DISPLAY_ERROR = "display.error"
    const val DISPLAY_DATE_MISSING = "display.date-missing"
    const val GUEST_FEED = "guest.feed"
    const val FEED_NOT_FOUND = "feed.error.not-found"
    const val FEED_LOAD_ERROR = "feed.error.load"
    const val FEED_INVALID = "feed.error.invalid"
    const val FEED_EDIT_SUCCESS = "feed.edit.success"
    const val FEED_EDIT_STATE = "feed.edit.error.state"
    const val FEED_EDIT_BANNED = "feed.edit.error.banned"
    const val FEED_EDIT_LOGIN = "feed.edit.error.login"
    const val FEED_EDIT_OTHER = "feed.edit.error.other"
    const val FEED_DELETE_SUCCESS = "feed.delete.success"
    const val FEED_DELETE_STATE = "feed.delete.error.state"
    const val FEED_DELETE_FORBIDDEN = "feed.delete.error.forbidden"
    const val FEED_DELETE_OTHER = "feed.delete.error.other"
    const val FEED_TITLE_NONE = "feed.title-none"
    const val FEED_PHOTO_ALT = "feed.photo-alt"
    const val FEED_PHOTO_ALT_NONE = "feed.photo-alt-none"
}

/** The one toast a screen shows at a time; only a visible screen shows toasts. */
internal class ToastSlot {
    private var counter = 0L

    var current: ToastMessage? = null
        private set

    fun show(copyKey: String) {
        current = ToastMessage(++counter, copyKey)
    }

    /** The UI displayed toast [id]. Returns true when the slot changed. */
    fun shown(id: Long): Boolean {
        if (current?.id != id) return false
        current = null
        return true
    }

    fun drop() {
        current = null
    }
}
