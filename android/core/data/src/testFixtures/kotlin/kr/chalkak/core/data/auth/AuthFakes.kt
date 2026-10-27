package kr.chalkak.core.data.auth.testing

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

/** Ordered log shared between fakes so tests can assert call order (e.g. local clear before POST /auth/logout). */
class EventLog {
    val entries = CopyOnWriteArrayList<String>()
    fun add(entry: String) { entries += entry }
}

/** In-memory [SecureRecordStorage]; [corrupted] makes every call throw like an undecryptable Keystore value. */
class InMemorySecureStorage(initial: SessionRecord = SessionRecord(), var corrupted: Boolean = false) : SecureRecordStorage {
    @Volatile var record: SessionRecord = initial
    var wipeCount = 0
    var saveCount = 0
    var failSave = false

    override suspend fun load(): SessionRecord {
        if (corrupted) throw IllegalStateException("cannot decrypt")
        return record
    }

    override suspend fun save(record: SessionRecord) {
        if (failSave) throw IllegalStateException("disk full")
        saveCount++
        this.record = record
    }

    override suspend fun wipe() {
        wipeCount++
        record = SessionRecord()
        corrupted = false
    }
}

/** A `_kind: storage` fixture from `shared/fixtures/boot/`. */
data class StorageFixture(val record: SessionRecord, val corrupted: Boolean, val expect: JsonObject) {
    val destination: String get() = expect.getValue("destination").jsonPrimitive.content
    val mode: String? get() = expect["mode"]?.jsonPrimitive?.contentOrNull
    val storageCleared: Boolean get() = expect["storageCleared"]?.jsonPrimitive?.booleanOrNull ?: false

    fun toStorage() = InMemorySecureStorage(record, corrupted)

    companion object {
        fun load(path: String): StorageFixture {
            val root = Fixtures.json(path).jsonObject
            val stored = root.getValue("stored").jsonObject
            fun str(k: String) = stored[k]?.jsonPrimitive?.contentOrNull
            return StorageFixture(
                record = SessionRecord(
                    userId = str("userId"),
                    accessToken = str("accessToken"),
                    accessTokenExpiresAt = str("accessTokenExpiresAt")?.let(Instant::parse),
                    refreshToken = str("refreshToken"),
                    refreshTokenExpiresAt = str("refreshTokenExpiresAt")?.let(Instant::parse),
                    guest = stored["guest"]?.jsonPrimitive?.booleanOrNull ?: false,
                ),
                corrupted = root["corrupted"]?.jsonPrimitive?.booleanOrNull ?: false,
                expect = root.getValue("expect").jsonObject,
            )
        }
    }
}

/** Simple [SessionStore] + [GuestFlagStore] for holder tests that do not care about the record layer. */
class InMemorySessionStore(
    initial: StoredSession = StoredSession.None,
    private val log: EventLog = EventLog(),
) : SessionStore, GuestFlagStore {
    @Volatile var current: StoredSession = initial
    var readFailure: Exception? = null
    var guestFailure: Exception? = null
    val writes = CopyOnWriteArrayList<Session>()
    var clearCount = 0

    override suspend fun read(): StoredSession {
        readFailure?.let { throw it }
        return current
    }

    override suspend fun write(session: Session) {
        log.add("store.write")
        writes += session
        current = StoredSession.User(session)
    }

    override suspend fun clear() {
        log.add("store.clear")
        clearCount++
        current = StoredSession.None
    }

    override suspend fun markGuest() {
        guestFailure?.let { throw it }
        log.add("store.markGuest")
        current = StoredSession.Guest
    }

    override suspend fun clearGuest() {
        log.add("store.clearGuest")
        if (current == StoredSession.Guest) current = StoredSession.None
    }
}

class RecordingUserDataResetter(private val log: EventLog = EventLog()) : UserDataResetter {
    var count = 0
    override suspend fun resetAll() {
        log.add("reset")
        count++
    }
}
