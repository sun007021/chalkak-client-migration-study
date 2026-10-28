package kr.chalkak.core.data.post

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Process-wide hub of post changes that every screen (display, home ranking, record, feed) must honour:
 *  - removed ids (deleted by the user, or a 404 on detail/like/delete). Remembered so a late list revalidation
 *    can never revive them (TC-FEED-044);
 *  - title edits (TC-FEED-023/024), applied to list caches by the screens.
 * Cleared on account change (D-17).
 */
class PostChanges {
    private val _removed = MutableStateFlow<Set<String>>(emptySet())
    private val _titles = MutableStateFlow<Map<String, String?>>(emptyMap())

    /** Ids that must not appear in any list. */
    val removed: StateFlow<Set<String>> = _removed.asStateFlow()

    /** postId -> latest edited title (null = cleared title). */
    val titles: StateFlow<Map<String, String?>> = _titles.asStateFlow()

    fun markRemoved(postId: String) = _removed.update { it + postId }

    fun isRemoved(postId: String): Boolean = postId in _removed.value

    fun titleChanged(postId: String, title: String?) = _titles.update { it + (postId to title) }

    /** Account switch / logout. */
    fun reset() {
        _removed.value = emptySet()
        _titles.value = emptyMap()
    }
}
