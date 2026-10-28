package com.stonefive.chalkak.data

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import kr.chalkak.core.data.auth.PersistentSessionStore
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.security.SecureRandom
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

/** Same AES-GCM format as [KeystoreSecretCipher] with a software key: Robolectric has no hardware-backed Keystore. */
private class SoftwareCipher(private val key: SecretKeySpec) : SecretCipher {
    override fun encrypt(plain: ByteArray): ByteArray {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv)) }
        return iv + c.doFinal(plain)
    }

    override fun decrypt(sealed: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, 12)) }
        return c.doFinal(sealed, 12, sealed.size - 12)
    }
}

@RunWith(RobolectricTestRunner::class)
class KeystoreRecordStorageTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val cipher = SoftwareCipher(SecretKeySpec(ByteArray(32) { it.toByte() }, "AES"))
    private val storage = KeystoreRecordStorage(context, cipher)
    private val record = SessionRecord(
        userId = "u-1",
        accessToken = "access-secret",
        accessTokenExpiresAt = Instant.parse("2026-10-01T00:00:00Z"),
        refreshToken = "refresh-secret",
        refreshTokenExpiresAt = Instant.parse("2026-11-01T00:00:00Z"),
    )

    @Test
    fun `save then load round trips and the prefs file holds no plain text`() = runBlocking {
        storage.save(record)
        assertEquals(record, storage.load())
        val raw = context.getSharedPreferences(KeystoreRecordStorage.FILE, 0).all.values.joinToString()
        assertFalse(raw.contains("access-secret") || raw.contains("u-1"))
    }

    @Test
    fun `empty storage loads an empty record and wipe clears`() = runBlocking {
        assertEquals(SessionRecord(), storage.load())
        storage.save(record)
        storage.wipe()
        assertEquals(SessionRecord(), storage.load())
    }

    @Test
    fun `a blob sealed with another key fails to load`(): Unit = runBlocking {
        storage.save(record)
        val other = KeystoreRecordStorage(context, SoftwareCipher(SecretKeySpec(ByteArray(32) { 9 }, "AES")))
        assertFailsWith<Exception> { other.load() }
    }

    @Test
    fun `corrupted or truncated blobs throw on load and wipe recovers`() = runBlocking {
        val prefs = context.getSharedPreferences(KeystoreRecordStorage.FILE, 0)
        for (garbage in listOf("not base64 !!", android.util.Base64.encodeToString(ByteArray(5), android.util.Base64.NO_WRAP))) {
            prefs.edit().putString("record", garbage).commit()
            assertFailsWith<Exception> { storage.load() }
            storage.wipe()
            assertEquals(SessionRecord(), storage.load())
        }
    }

    @Test
    fun `a tampered ciphertext fails authentication`(): Unit = runBlocking {
        storage.save(record)
        val prefs = context.getSharedPreferences(KeystoreRecordStorage.FILE, 0)
        val bytes = android.util.Base64.decode(prefs.getString("record", null), android.util.Base64.NO_WRAP)
        bytes[bytes.size - 1] = (bytes.last().toInt() xor 1).toByte()
        prefs.edit().putString("record", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)).commit()
        assertFailsWith<Exception> { storage.load() }
    }

    @Test
    fun `works as the backing of PersistentSessionStore including guest flag`() = runBlocking {
        val store = PersistentSessionStore(storage)
        val session = Session("u-1", "a", Instant.parse("2026-10-01T00:00:00Z"), "r", Instant.parse("2026-11-01T00:00:00Z"))
        store.write(session)
        assertEquals(StoredSession.User(session), store.read())
        store.markGuest()
        assertEquals(StoredSession.Guest, store.read())
        store.clear()
        assertEquals(StoredSession.None, store.read())
    }
}
