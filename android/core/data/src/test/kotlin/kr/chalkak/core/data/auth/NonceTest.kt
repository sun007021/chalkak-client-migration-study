package kr.chalkak.core.data.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NonceTest {
    @Test
    fun `TC-AUTH-002 100 raw nonces are all different 43 char base64url without padding`() {
        val gen = SecureNonceGenerator()
        val all = List(100) { gen.newRawNonce() }
        assertEquals(100, all.toSet().size)
        all.forEach {
            assertEquals(43, it.length)
            assertTrue(Regex("[A-Za-z0-9_-]{43}").matches(it), it)
        }
    }

    @Test
    fun `TC-AUTH-002 nonce encodes exactly 32 random bytes`() {
        val bytes = ByteArray(32) { it.toByte() }
        val nonce = SecureNonceGenerator(randomBytes = { size -> assertEquals(32, size); bytes }).newRawNonce()
        assertEquals(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), nonce)
    }

    @Test
    fun `TC-AUTH-003 hash is SHA-256 of the UTF-8 raw nonce as lowercase hex`() {
        // sha256("abc")
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", NonceHasher.sha256Hex("abc"))
        // sha256("") guards against hashing the wrong thing
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", NonceHasher.sha256Hex(""))
        val h = NonceHasher.sha256Hex("한글-nonce_01")
        assertEquals(64, h.length)
        assertTrue(h.all { it in '0'..'9' || it in 'a'..'f' })
    }
}
