package com.stonefive.chalkak.data

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import org.json.JSONObject
import java.time.Instant

/**
 * [SecureRecordStorage] adapter: the six session values (REQ-AUTH-023) as one JSON blob, sealed by a [SecretCipher]
 * (Keystore AES-GCM in production) and kept in a private SharedPreferences file (`auth_session`, excluded from backup).
 * `androidx.security:security-crypto` is deprecated, so the small cipher layer is ours. One blob means a record is
 * never half-written. [load] throws when the blob cannot be decrypted; `PersistentSessionStore`'s callers treat that as
 * "no session" and wipe.
 */
class KeystoreRecordStorage(context: Context, private val cipher: SecretCipher) : SecureRecordStorage {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override suspend fun load(): SessionRecord = withContext(Dispatchers.IO) {
        val blob = prefs.getString(KEY, null) ?: return@withContext SessionRecord()
        val json = JSONObject(String(cipher.decrypt(Base64.decode(blob, Base64.NO_WRAP)), Charsets.UTF_8))
        SessionRecord(
            userId = json.optStringOrNull("userId"),
            accessToken = json.optStringOrNull("accessToken"),
            accessTokenExpiresAt = json.optStringOrNull("accessTokenExpiresAt")?.let(Instant::parse),
            refreshToken = json.optStringOrNull("refreshToken"),
            refreshTokenExpiresAt = json.optStringOrNull("refreshTokenExpiresAt")?.let(Instant::parse),
            guest = json.optBoolean("guest", false),
        )
    }

    override suspend fun save(record: SessionRecord): Unit = withContext(Dispatchers.IO) {
        val json = JSONObject()
            .put("userId", record.userId ?: JSONObject.NULL)
            .put("accessToken", record.accessToken ?: JSONObject.NULL)
            .put("accessTokenExpiresAt", record.accessTokenExpiresAt?.toString() ?: JSONObject.NULL)
            .put("refreshToken", record.refreshToken ?: JSONObject.NULL)
            .put("refreshTokenExpiresAt", record.refreshTokenExpiresAt?.toString() ?: JSONObject.NULL)
            .put("guest", record.guest)
        val sealed = Base64.encodeToString(cipher.encrypt(json.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(prefs.edit().putString(KEY, sealed).commit()) { "session write failed" }
    }

    override suspend fun wipe(): Unit = withContext(Dispatchers.IO) {
        check(prefs.edit().clear().commit()) { "session wipe failed" }
    }

    private fun JSONObject.optStringOrNull(name: String): String? = if (isNull(name)) null else getString(name)

    companion object {
        const val FILE = "auth_session"
        private const val KEY = "record"
    }
}
