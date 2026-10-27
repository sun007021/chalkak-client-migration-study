package kr.chalkak.core.network

import java.time.Instant

data class Session(
    val userId: String,
    val accessToken: String,
    val accessExpiresAt: Instant,
    val refreshToken: String,
    val refreshExpiresAt: Instant,
)

/** What secure storage currently holds. */
sealed interface StoredSession {
    data object None : StoredSession
    data object Guest : StoredSession
    data class User(val session: Session) : StoredSession
}

/**
 * Secure token storage. Implementations may THROW from every method (Keystore corruption);
 * the network layer must treat a throwing [read] as "no session" and then call [clear].
 */
interface SessionStore {
    suspend fun read(): StoredSession
    suspend fun write(session: Session)
    suspend fun clear()
}

sealed interface AuthEvent {
    /** Session was cleared because re-authentication is required; UI goes to the login screen. */
    data object GoToLogin : AuthEvent
}

fun interface AuthEventSink {
    fun onEvent(event: AuthEvent)
}
