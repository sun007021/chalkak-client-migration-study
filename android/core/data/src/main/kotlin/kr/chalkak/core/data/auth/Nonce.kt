package kr.chalkak.core.data.auth

import java.security.MessageDigest
import java.util.Base64

interface NonceGenerator {
    /** 32 random bytes, base64url without padding (43 chars). New value on every call (REQ-AUTH-002). */
    fun newRawNonce(): String
}

class SecureNonceGenerator(
    private val randomBytes: (Int) -> ByteArray = { size -> ByteArray(size).also { java.security.SecureRandom().nextBytes(it) } },
) : NonceGenerator {
    override fun newRawNonce(): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(NONCE_BYTES))

    private companion object {
        const val NONCE_BYTES = 32
    }
}

object NonceHasher {
    /** SHA-256 of the UTF-8 bytes, lowercase hex, 64 chars (REQ-AUTH-003). */
    fun sha256Hex(rawNonce: String): String =
        MessageDigest.getInstance("SHA-256").digest(rawNonce.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
