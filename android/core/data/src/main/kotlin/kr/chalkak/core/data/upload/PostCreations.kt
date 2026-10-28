package kr.chalkak.core.data.upload

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Hub of [PostCreated] announcements. Home (hero, AI card, week), record (that month) and the exhibition (that date)
 * collect [events] and reload (REQ-UPL-063). Hot, no replay, nothing stored (so nothing to clear on account change).
 */
class PostCreations {
    private val shared = MutableSharedFlow<PostCreated>(extraBufferCapacity = BUFFER)

    val events: SharedFlow<PostCreated> get() = shared.asSharedFlow()

    /** Publishes [event] to every current collector without suspending. */
    fun announce(event: PostCreated) {
        shared.tryEmit(event)
    }

    private companion object {
        const val BUFFER = 16
    }
}
