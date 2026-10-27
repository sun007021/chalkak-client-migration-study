package kr.chalkak.core.data.auth

/** Guest flag persistence (D-05). Both calls may throw when storage fails. */
interface GuestFlagStore {
    /** Wipes stored credentials and stores the guest flag. */
    suspend fun markGuest()
    suspend fun clearGuest()
}

/** Drops everything bound to the previous account: caches, pending push navigation, unread state, push dedupe cache. */
fun interface UserDataResetter {
    suspend fun resetAll()
}
