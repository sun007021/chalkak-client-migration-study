package kr.chalkak.core.data.auth

import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import java.time.Instant

/** The six persisted values (REQ-AUTH-023). All nullable: a partial record is possible after a crash. */
data class SessionRecord(
    val userId: String? = null,
    val accessToken: String? = null,
    val accessTokenExpiresAt: Instant? = null,
    val refreshToken: String? = null,
    val refreshTokenExpiresAt: Instant? = null,
    val guest: Boolean = false,
) {
    override fun toString(): String = "SessionRecord(userId=$userId, guest=$guest, tokens=<redacted>)"
}

/** Platform secure storage (Keystore-encrypted prefs). Every method may throw (corrupted ciphertext). */
interface SecureRecordStorage {
    suspend fun load(): SessionRecord
    suspend fun save(record: SessionRecord)
    suspend fun wipe()
}

/**
 * [SessionStore] + [GuestFlagStore] over [SecureRecordStorage].
 *  - read: full user record -> User (guest flag ignored, user wins); only guest flag -> Guest; empty -> None;
 *    partial credentials -> wipe and None (TC-BOOT-006). Storage exceptions propagate (callers treat them as "no session" and clear).
 *  - write: saves the session and drops the guest flag. clear: wipes everything. markGuest: wipes credentials, stores flag.
 */
class PersistentSessionStore(private val storage: SecureRecordStorage) : SessionStore, GuestFlagStore {
    override suspend fun read(): StoredSession {
        val record = storage.load()
        val session = record.toSessionOrNull()
        return when {
            session != null -> StoredSession.User(session)
            record.hasNoCredentials() -> if (record.guest) StoredSession.Guest else StoredSession.None
            else -> {
                storage.wipe()
                StoredSession.None
            }
        }
    }

    override suspend fun write(session: Session) = storage.save(
        SessionRecord(
            userId = session.userId,
            accessToken = session.accessToken,
            accessTokenExpiresAt = session.accessExpiresAt,
            refreshToken = session.refreshToken,
            refreshTokenExpiresAt = session.refreshExpiresAt,
        ),
    )

    override suspend fun clear() = storage.wipe()

    override suspend fun markGuest() {
        storage.wipe()
        storage.save(SessionRecord(guest = true))
    }

    override suspend fun clearGuest() {
        val record = storage.load()
        if (record.guest) storage.save(record.copy(guest = false))
    }
}

private fun SessionRecord.toSessionOrNull(): Session? {
    return Session(
        userId = userId ?: return null,
        accessToken = accessToken ?: return null,
        accessExpiresAt = accessTokenExpiresAt ?: return null,
        refreshToken = refreshToken ?: return null,
        refreshExpiresAt = refreshTokenExpiresAt ?: return null,
    )
}

private fun SessionRecord.hasNoCredentials(): Boolean =
    userId == null && accessToken == null && accessTokenExpiresAt == null && refreshToken == null && refreshTokenExpiresAt == null
